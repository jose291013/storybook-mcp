import { runAgent } from "../services/agentRunner.js";
import { loadPrompt } from "../services/loadPrompt.js";

export function inspectPageStructure(finalBlueprint) {
  const pages = Array.isArray(finalBlueprint?.pages) ? finalBlueprint.pages : [];
  const expectedPageCount = Number(finalBlueprint?.format?.interior_pages || 0);
  const issues = [];
  if (pages.length !== expectedPageCount) issues.push(`expected ${expectedPageCount} pages, received ${pages.length}`);
  if (pages[0]?.page_type !== "opening_text") issues.push("page 1 is not opening_text");
  if (pages.at(-1)?.page_type !== "closing_text") issues.push(`page ${expectedPageCount} is not closing_text`);

  const expectedSpreadCount = Math.max(0, (expectedPageCount - 2) / 2);
  for (let spreadNumber = 1; spreadNumber <= expectedSpreadCount; spreadNumber += 1) {
    const spreadPages = pages
      .filter((page) => Number(page.spread_number) === spreadNumber)
      .sort((left, right) => Number(left.page_number) - Number(right.page_number));
    const expectedTypes = spreadNumber % 2 === 1 ? ["text", "image"] : ["image", "text"];
    const actualTypes = spreadPages.map((page) => page.page_type);
    if (spreadPages.length !== 2 || actualTypes.join(",") !== expectedTypes.join(",")) {
      issues.push(`spread ${spreadNumber} expected ${expectedTypes.join(" then ")}, received ${actualTypes.join(" then ") || "no pages"}`);
    }
  }
  return {
    valid: issues.length === 0,
    expected_page_count: expectedPageCount,
    expected_spread_count: expectedSpreadCount,
    issues,
  };
}

export async function qaAgent(final_blueprint, {
  backgroundExecution = null,
  backgroundStep = "",
} = {}) {
  const system = loadPrompt("qa.txt");
  const pageStructure = inspectPageStructure(final_blueprint);

  return runAgent({
    name: "qa",
    system,
    user: (input) =>
      `DETERMINISTIC_PAGE_STRUCTURE_JSON:\n${JSON.stringify(input.page_structure, null, 2)}\n\nFINAL_BLUEPRINT_JSON:\n${JSON.stringify(input.final_blueprint, null, 2)}\n\nReturn ONLY JSON as specified.`,
    input: { final_blueprint, page_structure: pageStructure },
    backgroundExecution,
    backgroundStep,
  });
}

import { runAgent } from "../services/agentRunner.js";
import { loadPrompt } from "../services/loadPrompt.js";
import { enrichFamilyAddress } from "../services/characterRelationships.js";
import { canonicalizeWrittenNames } from "./blueprintFiller.js";

function clean(value, maximum = 900) {
  return String(value || "").trim().slice(0, maximum);
}

function list(value, maximum = 30) {
  return (Array.isArray(value) ? value : []).filter(Boolean).slice(0, maximum);
}

export function buildStorySceneTextRepairTargets({
  approvedScenario,
  pageTexts,
  sceneContracts,
  issues,
}) {
  const targets = [];
  for (const contract of list(sceneContracts)) {
    const sceneNumber = Number(contract?.scene_number || 0);
    const textPageNumber = Number(contract?.text_page_number || 0);
    const sceneIssues = list(issues, 20)
      .filter((issue) => Number(issue?.sceneNumber || 0) === sceneNumber)
      .map((issue) => ({
        code: clean(issue?.code, 80) || "scenario_fidelity",
        explanation: clean(issue?.explanation),
      }))
      .filter((issue) => issue.explanation);
    if (!sceneIssues.length || !textPageNumber) continue;
    const approvedScene = list(approvedScenario?.scenes, 40)
      .find((scene) => Number(scene?.sceneNumber || 0) === sceneNumber);
    if (!approvedScene) continue;
    targets.push({
      scene_number: sceneNumber,
      text_page_number: textPageNumber,
      current_text: clean(pageTexts?.[textPageNumber], 5000),
      approved_scene: approvedScene,
      issues: sceneIssues,
    });
  }
  return targets;
}

export async function storySceneTextRepairAgent({
  approvedScenario,
  pageTexts,
  sceneContracts,
  issues,
  canonicalCharacters = [],
  language = "FR",
}) {
  const targets = buildStorySceneTextRepairTargets({
    approvedScenario,
    pageTexts,
    sceneContracts,
    issues,
  });
  if (!targets.length) return { ...pageTexts };

  const result = await runAgent({
    name: "storySceneTextRepair",
    clientKind: "story",
    system: loadPrompt("story_scene_text_repair.txt"),
    user: (input) => `TARGETED_STORY_REPAIR_JSON:\n${JSON.stringify(input, null, 2)}\n\nReturn ONLY the requested JSON object.`,
    input: {
      language,
      canonical_characters: list(canonicalCharacters, 30)
        .map((character) => enrichFamilyAddress(character, language)),
      repair_targets: targets,
    },
  });

  const supplied = new Map(list(result?.page_texts, targets.length + 5)
    .map((item) => [Number(item?.page_number || 0), clean(item?.text, 5000)]));
  const repaired = { ...pageTexts };
  for (const target of targets) {
    const text = supplied.get(target.text_page_number);
    if (!text) {
      throw new Error(`Targeted story repair omitted text page ${target.text_page_number}`);
    }
    repaired[target.text_page_number] = canonicalizeWrittenNames(text, canonicalCharacters);
  }
  return repaired;
}

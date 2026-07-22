import { runAgent } from "../services/agentRunner.js";
import { loadPrompt } from "../services/loadPrompt.js";
import { bookLanguageInstruction, normalizeBookLanguage } from "../config/bookLanguages.js";

export async function intakeAgent(rawAnswers) {
  const system = loadPrompt("intake.txt");
  const language = normalizeBookLanguage(rawAnswers?.language);

  const result = await runAgent({
    name: "intake",
    system: `${bookLanguageInstruction(language)}\n\n${system}`,
    user: (input) =>
      `RAW_ANSWERS_JSON:\n${JSON.stringify(input, null, 2)}\n\nReturn ONLY the JSON object specified by the system instructions.`,
    input: rawAnswers
  });
  result.intake ||= {};
  result.intake.language = language;
  // Product choices must never be reinterpreted or dropped by the language model.
  // They drive page planning, rendering and the WooCommerce variation.
  result.intake.page_count = rawAnswers?.page_count;
  result.intake.product_type = rawAnswers?.product_type;
  result.intake.font_style = rawAnswers?.font_style;
  result.intake.universe_id = rawAnswers?.universe_id;
  result.intake.universe_instructions = rawAnswers?.universe_instructions;
  result.intake.style_id = rawAnswers?.style_id;
  result.intake.style_instructions = rawAnswers?.style_instructions;
  result.intake.rendering_mode = rawAnswers?.rendering_mode;
  result.intake.likeness_goal = rawAnswers?.likeness_goal;
  return result;
}

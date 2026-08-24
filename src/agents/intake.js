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
  result.intake.book_format_id = rawAnswers?.book_format_id;
  result.intake.pricing_version = rawAnswers?.pricing_version;
  result.intake.font_style = rawAnswers?.font_style;
  result.intake.universe_id = rawAnswers?.universe_id;
  result.intake.universe_instructions = rawAnswers?.universe_instructions;
  result.intake.universe_story_contract = rawAnswers?.universe_story_contract || {};
  result.intake.story_seed_id = rawAnswers?.story_seed_id;
  result.intake.story_seed_title = rawAnswers?.story_seed_title;
  result.intake.story_seed_first_step = rawAnswers?.story_seed_first_step;
  result.intake.story_seed_effort = rawAnswers?.story_seed_effort;
  result.intake.story_seed_reward = rawAnswers?.story_seed_reward;
  result.intake.story_seed_adaptation = rawAnswers?.story_seed_adaptation;
  result.intake.story_seed_moment = rawAnswers?.story_seed_moment;
  result.intake.story_seed_transformation = rawAnswers?.story_seed_transformation;
  result.intake.creator_situation = rawAnswers?.creator_situation;
  for (const key of ["id", "title", "understanding", "desired_change", "protective_doubt", "first_step", "motivation", "reward", "message"]) {
    result.intake[`story_intent_${key}`] = rawAnswers?.[`story_intent_${key}`];
  }
  result.intake.style_id = rawAnswers?.style_id;
  result.intake.style_instructions = rawAnswers?.style_instructions;
  result.intake.rendering_mode = rawAnswers?.rendering_mode;
  result.intake.likeness_goal = rawAnswers?.likeness_goal;
  return result;
}

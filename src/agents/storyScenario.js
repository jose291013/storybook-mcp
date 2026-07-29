import { runAgent } from "../services/agentRunner.js";
import { bookLanguageInstruction, normalizeBookLanguage } from "../config/bookLanguages.js";
import { loadPrompt } from "../services/loadPrompt.js";

export async function storyScenarioAgent(input) {
  const language = normalizeBookLanguage(input?.intake?.language);
  return runAgent({
    name: "storyScenario",
    clientKind: "story",
    modelRole: "story_architect",
    system: `${bookLanguageInstruction(language)}\n\n${loadPrompt("story_scenario.txt")}`,
    user: (payload) => `STORY_INPUT_JSON:\n${JSON.stringify(payload, null, 2)}\n\nReturn ONLY JSON as specified.`,
    input,
  });
}

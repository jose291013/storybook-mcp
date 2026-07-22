import { runAgent } from "../services/agentRunner.js";
import { loadPrompt } from "../services/loadPrompt.js";

export async function storyScenarioAgent(input) {
  return runAgent({
    name: "storyScenario",
    clientKind: "story",
    system: loadPrompt("story_scenario.txt"),
    user: (payload) => `STORY_INPUT_JSON:\n${JSON.stringify(payload, null, 2)}\n\nReturn ONLY JSON as specified.`,
    input,
  });
}

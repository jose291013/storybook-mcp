import { runAgent } from "../services/agentRunner.js";
import { loadPrompt } from "../services/loadPrompt.js";

export async function storybrandAgent({ intake, hero_profile, approvedScenario = null }) {
  const system = loadPrompt("storybrand.txt");

  return runAgent({
    name: "storybrand",
    system,
    user: (input) =>
      `INPUT_JSON:\n${JSON.stringify(input, null, 2)}\n\nReturn ONLY JSON as specified.`,
    input: {
      intake: intake?.intake || intake,
      hero_profile: hero_profile?.hero_profile || hero_profile,
      approved_scenario: approvedScenario,
    }
  });
}

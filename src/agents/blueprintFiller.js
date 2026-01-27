import { runAgent } from "../services/agentRunner.js";
import { loadPrompt } from "../services/loadPrompt.js";

export async function blueprintFillerAgent({
  intake,
  hero_profile,
  storybrand,
  world,
  style,
  heroPhotoId,
  portraitCanonShort = "",
  portraitCanonJson = null
}) {

  const system = loadPrompt("blueprint_filler.txt");

  // IMPORTANT: The blueprint_filler prompt should include (or reference) the master blueprint template.
  // If your prompt file doesn't embed the master template yet, add it there.
  return runAgent({
    name: "blueprintFiller",
    system,
    user: (input) =>
      `MERGE_INPUT_JSON:\n${JSON.stringify(input, null, 2)}\n\nReturn ONLY JSON as specified.`,
    input: {
  intake,
  hero_profile,
  storybrand,
  world,
  style,
  heroPhotoId,
  portrait: {
  canon_short: portraitCanonShort,
  canon_json: portraitCanonJson
  }
}

  });
}

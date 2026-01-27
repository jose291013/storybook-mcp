import { runAgent } from "../services/agentRunner.js";
import { loadPrompt } from "../services/loadPrompt.js";
import { parseJsonSafe } from "../services/parseJsonSafe.js";

export async function blueprintFillerAgent({
  intake,
  hero_profile,
  storybrand,
  world,
  style,
  heroPhotoId,
  portraitCanonShort = "",
  portraitCanonJson = null,
}) {
  const system = loadPrompt("blueprint_filler.txt");

  const out = await runAgent({
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
        canon_json: portraitCanonJson,
      },
    },
  });

  // ---- Normalize and parse to plain JSON ----
  // Depending on your runner, the JSON might be in different fields.
  const candidate =
    out?.json ?? out?.data ?? out?.output ?? out?.message ?? out?.text ?? out;

  // If it's already an object, return it
  if (candidate && typeof candidate === "object") return candidate;

  // Otherwise parse from string
  const parsed = parseJsonSafe(String(candidate || ""));
  if (!parsed) {
    throw new Error("blueprintFillerAgent: could not parse JSON from agent output");
  }
  return parsed;
}


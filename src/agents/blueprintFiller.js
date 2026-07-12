import { runAgent } from "../services/agentRunner.js";
import { loadPrompt } from "../services/loadPrompt.js";
import { parseJsonSafe } from "../services/parseJsonSafe.js";
import { applyPagePlan, createPagePlan } from "../config/bookStructure.js";

function nameKey(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sameName(left, right) {
  const a = nameKey(left);
  const b = nameKey(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

export function lockBlueprintContinuity(blueprint, { heroProfile = {}, characterCanons = [] } = {}) {
  const result = applyPagePlan(blueprint);
  result.hero ||= {};
  const childCanon = characterCanons.find((canon) => canon.role === "child");
  result.hero.outfit_lock = String(
    childCanon?.outfit_lock
    || result.hero.outfit_lock
    || heroProfile?.outfit_lock
    || "a dark teal long-sleeve top, warm ochre trousers and plain white sneakers"
  ).trim();

  result.cast = Array.isArray(result.cast) ? result.cast : [];
  result.cast = result.cast.map((character) => {
    const photoCanon = characterCanons.find((canon) => sameName(canon.name, character.name));
    return {
      ...character,
      canon_short: photoCanon?.canon_short || character.canon_short || "",
      outfit_lock: photoCanon?.outfit_lock || character.outfit_lock || "",
    };
  });

  const canonicalCharacters = [
    { name: result.hero.name, role: "child" },
    ...result.cast,
  ].filter((character) => character.name);
  const canonicalizeCast = (castPresent = [], prompt = "") => {
    const requested = Array.isArray(castPresent) ? castPresent : [];
    let selected = canonicalCharacters.filter((character) => requested.some((name) => sameName(name, character.name)));
    if (!selected.length) {
      const promptKey = nameKey(prompt);
      selected = canonicalCharacters.filter((character) => promptKey.includes(nameKey(character.name)));
    }
    return [...new Set(selected.map((character) => character.name))];
  };

  result.cover ||= {};
  result.cover.cast_present = canonicalizeCast(result.cover.cast_present, result.cover.image_prompt);
  if (!result.cover.cast_present.length && result.hero.name) {
    result.cover.cast_present = [
      result.hero.name,
      ...result.cast.filter((character) => character.role === "mascot").slice(0, 1).map((character) => character.name),
    ];
  }
  result.pages = result.pages.map((page) => ({
    ...page,
    cast_present: page.page_type === "image"
      ? canonicalizeCast(page.cast_present, page.image_prompt)
      : [],
  }));
  return result;
}

export async function blueprintFillerAgent({
  intake,
  hero_profile,
  storybrand,
  world,
  style,
  heroPhotoId,
  portraitCanonShort = "",
  portraitCanonJson = null,
  characterCanons = [],
}) {
  const system = loadPrompt("blueprint_filler.txt");

  const out = await runAgent({
    name: "blueprintFiller",
    system,
    user: (input) =>
      `MERGE_INPUT_JSON:\n${JSON.stringify(input, null, 2)}\n\nReturn ONLY JSON as specified.`,
    input: {
      intake: intake?.intake || intake,
      hero_profile: hero_profile?.hero_profile || hero_profile,
      storybrand: storybrand?.storybrand || storybrand,
      world: world?.world || world,
      style: style?.style || style,
      heroPhotoId,
      page_plan: createPagePlan(),
      character_canons: characterCanons,
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

  const heroProfile = hero_profile?.hero_profile || hero_profile || {};

  // If it's already an object, return it
  if (candidate && typeof candidate === "object") {
    return lockBlueprintContinuity(candidate, { heroProfile, characterCanons });
  }

  // Otherwise parse from string
  const parsed = parseJsonSafe(String(candidate || ""));
  if (!parsed) {
    throw new Error("blueprintFillerAgent: could not parse JSON from agent output");
  }
  return lockBlueprintContinuity(parsed, { heroProfile, characterCanons });
}


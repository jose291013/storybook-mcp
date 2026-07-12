import { runAgent } from "../services/agentRunner.js";
import { loadPrompt } from "../services/loadPrompt.js";
import { parseJsonSafe } from "../services/parseJsonSafe.js";
import { applyPagePlan, createPagePlan } from "../config/bookStructure.js";
import { normalizeBookLanguage } from "../config/bookLanguages.js";

function nameKey(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sameName(left, right) {
  const a = nameKey(left);
  const b = nameKey(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function appearanceDirective(language, character) {
  const identity = character.name;
  if (language === "ES") {
    return `Incluye claramente a ${identity} en esta escena como personaje reconocible, usando fielmente su referencia fotográfica y sin sustituirlo por otro personaje. Sin texto, subtítulos, logotipos ni marcas de agua.`;
  }
  if (language === "EN") {
    return `Clearly include ${identity} in this scene as a recognizable character, faithfully using the supplied photo reference and never replacing them with another character. No text, captions, logos or watermarks.`;
  }
  return `Inclure clairement ${identity} dans cette scène comme personnage reconnaissable, en respectant fidèlement sa photo de référence et sans le remplacer par un autre personnage. Aucun texte, sous-titre, logo ni filigrane.`;
}

function preferredStoryRoles(storyRole, role) {
  if (storyRole === "guide") return ["meeting_the_guide", "simple_plan", "call_to_action"];
  if (storyRole === "ally" || storyRole === "companion") return ["simple_plan", "first_attempt", "challenge_and_choice"];
  if (storyRole === "supporter" || storyRole === "guest") return ["success_and_transformation", "return_home_and_moral"];
  if (role === "family") return ["return_home_and_moral", "success_and_transformation", "meeting_the_guide"];
  if (role === "friend") return ["meeting_the_guide", "simple_plan", "first_attempt"];
  if (role === "mascot") return ["meeting_the_guide", "simple_plan", "call_to_action"];
  return ["simple_plan", "success_and_transformation", "return_home_and_moral"];
}

export function lockBlueprintContinuity(blueprint, { heroProfile = {}, characterCanons = [], language } = {}) {
  const result = applyPagePlan(blueprint);
  result.language = normalizeBookLanguage(language || result.language);
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
      story_role: photoCanon?.story_role || character.story_role || "guest",
    };
  });
  for (const canon of characterCanons.filter((item) => item.role !== "child" && item.name)) {
    if (result.cast.some((character) => sameName(character.name, canon.name))) continue;
    result.cast.push({
      name: canon.name,
      role: canon.role || "other",
      relationship: canon.relationship || "",
      story_role: canon.story_role || "guest",
      canon_short: canon.canon_short || canon.character_fingerprint || "",
      outfit_lock: canon.outfit_lock || "",
    });
  }

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

  const imagePages = result.pages.filter((page) => page.page_type === "image");
  const assignedPerPage = new Map();
  for (const canon of characterCanons.filter((item) => item.role !== "child" && item.name)) {
    const alreadyVisible = imagePages.some((page) => page.cast_present.some((name) => sameName(name, canon.name)));
    if (alreadyVisible || !imagePages.length) continue;
    const preferred = preferredStoryRoles(canon.story_role, canon.role);
    const candidates = preferred.flatMap((storyRole) => imagePages.filter((page) => page.story_role === storyRole));
    const pool = candidates.length ? candidates : imagePages;
    const page = [...pool].sort((a, b) => (assignedPerPage.get(a.page_number) || 0) - (assignedPerPage.get(b.page_number) || 0))[0];
    page.cast_present = [...new Set([...page.cast_present, canon.name])];
    page.image_prompt = `${page.image_prompt} ${appearanceDirective(result.language, canon)}`.trim();
    assignedPerPage.set(page.page_number, (assignedPerPage.get(page.page_number) || 0) + 1);
  }
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
  const language = normalizeBookLanguage((intake?.intake || intake)?.language);

  // If it's already an object, return it
  if (candidate && typeof candidate === "object") {
    return lockBlueprintContinuity(candidate, { heroProfile, characterCanons, language });
  }

  // Otherwise parse from string
  const parsed = parseJsonSafe(String(candidate || ""));
  if (!parsed) {
    throw new Error("blueprintFillerAgent: could not parse JSON from agent output");
  }
  return lockBlueprintContinuity(parsed, { heroProfile, characterCanons, language });
}


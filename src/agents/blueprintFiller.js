import { runAgent } from "../services/agentRunner.js";
import { loadPrompt } from "../services/loadPrompt.js";
import { parseJsonSafe } from "../services/parseJsonSafe.js";
import { applyPagePlan, createPagePlan } from "../config/bookStructure.js";
import { normalizeBookLanguage } from "../config/bookLanguages.js";
import { normalizePageCount, normalizeTypography } from "../config/bookOptions.js";
import { extractBlueprintCandidate } from "../services/extractBlueprintCandidate.js";

function nameKey(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sameName(left, right) {
  const a = nameKey(left);
  const b = nameKey(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function editDistance(left, right) {
  const a = nameKey(left).replaceAll(" ", "");
  const b = nameKey(right).replaceAll(" ", "");
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

function canonicalizePromptNames(value, canonicalCharacters) {
  const text = String(value || "");
  const exactNames = new Map(canonicalCharacters.map((character) => [nameKey(character.name), character.name]));
  return text.replace(/\b[\p{Lu}][\p{L}'’.-]{2,}\b/gu, (token) => {
    const exact = exactNames.get(nameKey(token));
    if (exact) return exact;
    const candidates = canonicalCharacters
      .map((character) => ({ name: character.name, distance: editDistance(token, character.name) }))
      .filter((candidate) => candidate.distance <= Math.max(1, Math.ceil(nameKey(candidate.name).length * 0.4)))
      .sort((left, right) => left.distance - right.distance);
    if (!candidates.length || (candidates[1] && candidates[1].distance === candidates[0].distance)) return token;
    return candidates[0].name;
  });
}

function castDirective(language, names, pageType) {
  if (!names.length) return "";
  const list = names.join(", ");
  if (language === "ES") {
    return pageType === "image"
      ? `Personajes visibles obligatorios en esta escena: ${list}.`
      : `En esta escena, ${list} estan fisicamente presentes y participan en el mismo momento.`;
  }
  if (language === "EN") {
    return pageType === "image"
      ? `Mandatory visible characters in this scene: ${list}.`
      : `In this scene, ${list} are physically present and take part in the same moment.`;
  }
  return pageType === "image"
    ? `Personnages obligatoirement visibles dans cette scene : ${list}.`
    : `Dans cette scene, ${list} sont physiquement presents et participent au meme moment.`;
}

function outfitDirective(language, heroName, outfit) {
  if (!heroName || !outfit) return "";
  if (language === "ES") return `VESTUARIO FIJO DE ${heroName}: ${outfit}. Esta regla sustituye cualquier otra descripcion de ropa anterior.`;
  if (language === "EN") return `FIXED OUTFIT FOR ${heroName}: ${outfit}. This rule replaces any other earlier clothing description.`;
  return `TENUE VERROUILLEE DE ${heroName} : ${outfit}. Cette regle remplace toute autre description vestimentaire anterieure.`;
}

function coverCompositionDirective(language) {
  if (language === "ES") return "COMPOSICION DE PORTADA: reservar el 30% superior como zona limpia para el titulo, mostrando solo cielo o decorado sencillo; colocar todos los rostros y personajes por debajo de esa zona, sin texto dentro de la ilustracion.";
  if (language === "EN") return "COVER COMPOSITION: reserve the upper 30% as clean title-safe space containing only sky or simple scenery; place every face and character below that area, with no text inside the illustration.";
  return "COMPOSITION DE COUVERTURE : reserver les 30 % superieurs comme zone claire pour le titre, avec seulement du ciel ou un decor simple ; placer tous les visages et personnages sous cette zone, sans texte dans l'illustration.";
}

function appendDirective(prompt, directive) {
  const value = String(prompt || "").trim();
  if (!directive || value.includes(directive)) return value;
  return `${value} ${directive}`.trim();
}

function syncSpreadCastContracts(result, canonicalCharacters, questObject) {
  const canonicalNamesIn = (value) => canonicalCharacters
    .filter((character) => nameKey(value).includes(nameKey(character.name)))
    .map((character) => character.name);
  const spreads = new Map();
  for (const page of result.pages) {
    if (!page.spread_number || ["opening_text", "closing_text"].includes(page.page_type)) continue;
    const pages = spreads.get(page.spread_number) || [];
    pages.push(page);
    spreads.set(page.spread_number, pages);
  }
  for (const pages of spreads.values()) {
    const imagePage = pages.find((page) => page.page_type === "image");
    const textPage = pages.find((page) => page.page_type === "text");
    if (!imagePage || !textPage) continue;
    let names = [...new Set([
      ...(imagePage.cast_present || []),
      ...(textPage.cast_present || []),
      ...canonicalNamesIn(imagePage.image_prompt),
      ...canonicalNamesIn(textPage.text_prompt),
    ])].filter((name) => canonicalCharacters.some((character) => sameName(character.name, name)));
    if (imagePage.visual_state?.quest_object_state === "hidden" && questObject?.name) {
      names = names.filter((name) => !sameName(name, questObject.name));
    }
    names = names.map((name) => canonicalCharacters.find((character) => sameName(character.name, name))?.name).filter(Boolean);
    names = [...new Set(names)];
    imagePage.cast_present = names;
    textPage.cast_present = names;
    imagePage.image_prompt = appendDirective(imagePage.image_prompt, castDirective(result.language, names, "image"));
    textPage.text_prompt = appendDirective(textPage.text_prompt, castDirective(result.language, names, "text"));
  }
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

function plotObjectDirective(language, objectName, state) {
  if (language === "ES") {
    if (state === "hidden") return `No mostrar ${objectName}: todavia esta perdido y debe permanecer completamente invisible, incluso al fondo, como reflejo o como simbolo.`;
    if (state === "discovered") return `Mostrar ${objectName} por primera vez en esta escena, en el instante exacto de su descubrimiento; antes no estaba visible ni en posesion de los personajes.`;
    return `Si aparece ${objectName}, mostrarlo unicamente como ya encontrado despues del descubrimiento, sin repetir el momento del hallazgo.`;
  }
  if (language === "EN") {
    if (state === "hidden") return `Do not show ${objectName}: it is still lost and must remain completely invisible, including in the background, reflections or symbols.`;
    if (state === "discovered") return `Show ${objectName} for the first time in this scene, at the exact moment it is discovered; it was not visible or possessed earlier.`;
    return `If ${objectName} appears, show it only as already found after the discovery; do not repeat the discovery moment.`;
  }
  if (state === "hidden") return `Ne pas montrer ${objectName} : il est encore perdu et doit rester totalement invisible, meme au loin, dans un reflet ou sous forme de symbole.`;
  if (state === "discovered") return `Montrer ${objectName} pour la premiere fois dans cette scene, au moment exact de sa decouverte ; il n'etait ni visible ni possede auparavant.`;
  return `Si ${objectName} apparait, le montrer uniquement comme deja retrouve apres sa decouverte, sans repeter le moment de la trouvaille.`;
}

function normalizeQuestObject(result) {
  const raw = result?.plot_continuity?.quest_object || {};
  const name = String(raw.name || "").trim();
  const requestedScene = Number.parseInt(raw.discovery_scene_number, 10);
  const maximumScene = Math.max(1, (result.pages || []).filter((page) => page.page_type === "image").length);
  const discoveryScene = name && requestedScene >= 1 && requestedScene <= maximumScene ? requestedScene : 0;
  result.plot_continuity = {
    ...(result.plot_continuity || {}),
    quest_object: {
      name,
      appearance_lock: String(raw.appearance_lock || "").trim(),
      discovery_scene_number: discoveryScene,
    },
  };
  return result.plot_continuity.quest_object;
}

function lockPlotObjectTimeline(result, questObject) {
  const objectName = questObject?.name || "";
  const discoveryScene = questObject?.discovery_scene_number || 0;
  for (const page of result.pages) {
    if (page.page_type !== "image") {
      page.visual_state = {};
      continue;
    }
    if (!objectName || !discoveryScene) {
      page.visual_state = {};
      continue;
    }

    const state = page.scene_number < discoveryScene
      ? "hidden"
      : (page.scene_number === discoveryScene ? "discovered" : "after_discovery");
    const directive = plotObjectDirective(result.language, objectName, state);
    page.visual_state = {
      quest_object_name: objectName,
      quest_object_state: state,
      directive,
    };
    page.image_prompt = `${page.image_prompt} ${directive}`.trim();

    const objectCharacter = result.cast.find((character) => sameName(character.name, objectName));
    if (objectCharacter && state === "hidden") {
      page.cast_present = page.cast_present.filter((name) => !sameName(name, objectCharacter.name));
    } else if (objectCharacter && state === "discovered") {
      page.cast_present = [...new Set([...page.cast_present, objectCharacter.name])];
    }
  }
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

export function lockBlueprintContinuity(blueprint, {
  heroProfile = {},
  characterCanons = [],
  language,
  pageCount,
  fontStyle,
} = {}) {
  const selectedPageCount = normalizePageCount(pageCount ?? blueprint?.format?.interior_pages);
  const selectedFontStyle = normalizeTypography(fontStyle ?? blueprint?.typography?.id);
  const result = applyPagePlan(blueprint, selectedPageCount);
  result.language = normalizeBookLanguage(language || result.language);
  result.typography = { id: selectedFontStyle };
  const questObject = normalizeQuestObject(result);
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
  result.cover.image_prompt = canonicalizePromptNames(result.cover.image_prompt, canonicalCharacters);
  result.cover.image_prompt = appendDirective(result.cover.image_prompt, coverCompositionDirective(result.language));
  result.cover.cast_present = canonicalizeCast(result.cover.cast_present, result.cover.image_prompt);
  if (!result.cover.cast_present.length && result.hero.name) {
    result.cover.cast_present = [
      result.hero.name,
      ...result.cast.filter((character) => character.role === "mascot").slice(0, 1).map((character) => character.name),
    ];
  }
  result.pages = result.pages.map((page) => ({
    ...page,
    text_prompt: canonicalizePromptNames(page.text_prompt, canonicalCharacters),
    image_prompt: canonicalizePromptNames(page.image_prompt, canonicalCharacters),
    cast_present: canonicalizeCast(page.cast_present, `${page.text_prompt || ""} ${page.image_prompt || ""}`),
  }));

  const imagePages = result.pages.filter((page) => page.page_type === "image");
  const assignedPerPage = new Map();
  for (const canon of characterCanons.filter((item) => item.role !== "child" && item.name)) {
    const eligiblePages = questObject.discovery_scene_number && sameName(canon.name, questObject.name)
      ? imagePages.filter((page) => page.scene_number >= questObject.discovery_scene_number)
      : imagePages;
    const alreadyVisible = eligiblePages.some((page) => page.cast_present.some((name) => sameName(name, canon.name)));
    if (alreadyVisible || !imagePages.length) continue;
    const preferred = preferredStoryRoles(canon.story_role, canon.role);
    const candidates = preferred.flatMap((storyRole) => imagePages.filter((page) => page.story_role === storyRole));
    const eligibleCandidates = candidates.filter((page) => eligiblePages.includes(page));
    const pool = eligibleCandidates.length ? eligibleCandidates : eligiblePages;
    if (!pool.length) continue;
    const page = [...pool].sort((a, b) => (assignedPerPage.get(a.page_number) || 0) - (assignedPerPage.get(b.page_number) || 0))[0];
    page.cast_present = [...new Set([...page.cast_present, canon.name])];
    page.image_prompt = `${page.image_prompt} ${appearanceDirective(result.language, canon)}`.trim();
    assignedPerPage.set(page.page_number, (assignedPerPage.get(page.page_number) || 0) + 1);
  }
  lockPlotObjectTimeline(result, questObject);
  syncSpreadCastContracts(result, canonicalCharacters, questObject);
  const fixedOutfit = outfitDirective(result.language, result.hero.name, result.hero.outfit_lock);
  if (result.cover.cast_present.some((name) => sameName(name, result.hero.name))) {
    result.cover.image_prompt = appendDirective(result.cover.image_prompt, fixedOutfit);
  }
  for (const page of result.pages.filter((item) => item.page_type === "image")) {
    if (page.cast_present.some((name) => sameName(name, result.hero.name))) {
      page.image_prompt = appendDirective(page.image_prompt, fixedOutfit);
    }
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
  const intakeData = intake?.intake || intake || {};
  const pageCount = normalizePageCount(intakeData.page_count);
  const fontStyle = normalizeTypography(intakeData.font_style);

  const out = await runAgent({
    name: "blueprintFiller",
    system,
    user: (input) =>
      `MERGE_INPUT_JSON:\n${JSON.stringify(input, null, 2)}\n\nReturn ONLY JSON as specified.`,
    input: {
      intake: intakeData,
      hero_profile: hero_profile?.hero_profile || hero_profile,
      storybrand: storybrand?.storybrand || storybrand,
      world: world?.world || world,
      style: style?.style || style,
      heroPhotoId,
      page_plan: createPagePlan(pageCount),
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
  const language = normalizeBookLanguage(intakeData.language);

  // If it's already an object, return it
  if (candidate && typeof candidate === "object") {
    return lockBlueprintContinuity(extractBlueprintCandidate(candidate), { heroProfile, characterCanons, language, pageCount, fontStyle });
  }

  // Otherwise parse from string
  const parsed = parseJsonSafe(String(candidate || ""));
  if (!parsed) {
    throw new Error("blueprintFillerAgent: could not parse JSON from agent output");
  }
  return lockBlueprintContinuity(extractBlueprintCandidate(parsed), { heroProfile, characterCanons, language, pageCount, fontStyle });
}


import { runAgent } from "../services/agentRunner.js";
import { loadPrompt } from "../services/loadPrompt.js";
import { canonicalizeWrittenNames } from "./blueprintFiller.js";

function key(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function editDistance(left, right) {
  const a = key(left).replaceAll(" ", "");
  const b = key(right).replaceAll(" ", "");
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

function canonicalName(value, characters) {
  const exact = characters.find((character) => key(character.name) === key(value));
  if (exact) return exact.name;
  const source = key(value);
  const matches = characters
    .filter((character) => source.slice(0, 2) === key(character.name).slice(0, 2))
    .map((character) => ({ name: character.name, distance: editDistance(value, character.name) }))
    .filter((candidate) => candidate.distance <= 2)
    .sort((left, right) => left.distance - right.distance);
  return matches[0]?.name || "";
}

function list(value, maximum = 20) {
  return (Array.isArray(value) ? value : []).filter(Boolean).slice(0, maximum);
}

function normalizeContract(raw, expected, canonicalCharacters) {
  const rawNamed = list(raw?.named_characters, 10);
  const namedSource = rawNamed.length
    ? rawNamed
    : list(expected.planned_cast, 10).map((name) => ({ name, visual_role: "visible", action: "as stated in the paired prose" }));
  const named = namedSource.map((item) => {
    const name = canonicalName(item?.name, canonicalCharacters);
    return name ? {
      name,
      visual_role: String(item?.visual_role || "background"),
      action: canonicalizeWrittenNames(item?.action, canonicalCharacters),
    } : null;
  }).filter(Boolean);
  const generic = list(raw?.generic_characters, 12).map((item, index) => ({
    id: String(item?.id || `generic_${index + 1}`).replace(/[^a-z0-9_-]/gi, "_").toLowerCase(),
    description: canonicalizeWrittenNames(item?.description, canonicalCharacters),
    visual_role: String(item?.visual_role || "background"),
    action: canonicalizeWrittenNames(item?.action, canonicalCharacters),
    must_not_resemble: [...new Set(list(item?.must_not_resemble, 10).map((name) => canonicalName(name, canonicalCharacters)).filter(Boolean))],
  }));
  const resolveActor = (value) => canonicalName(value, canonicalCharacters)
    || generic.find((item) => key(item.id) === key(value))?.id
    || String(value || "");
  return {
    spread_number: expected.spread_number,
    scene_number: expected.scene_number,
    text_page_number: expected.text_page_number,
    image_page_number: expected.image_page_number,
    story_beat: String(raw?.story_beat || expected.prose || expected.planned_image || "").trim(),
    source_prose: String(expected.prose || "").trim(),
    planned_image_context: String(expected.planned_image || "").trim(),
    main_action: {
      subject: resolveActor(raw?.main_action?.subject),
      verb: String(raw?.main_action?.verb || "").trim(),
      target: resolveActor(raw?.main_action?.target),
    },
    named_characters: named,
    generic_characters: generic,
    required_elements: list(raw?.required_elements, 15).map((item) => ({
      description: String(item?.description || "").trim(),
      quantity: String(item?.quantity || "").trim(),
      scale: String(item?.scale || "").trim(),
    })).filter((item) => item.description),
    spatial_relationships: list(raw?.spatial_relationships).map(String),
    forbidden_elements: list(raw?.forbidden_elements).map(String),
    continuity_from_previous: String(raw?.continuity_from_previous || "").trim(),
    continuity_to_next: String(raw?.continuity_to_next || "").trim(),
  };
}

export async function storyScenePlannerAgent({ blueprint, pageTexts, characterCanons = [] }) {
  const canonicalCharacters = [
    ...characterCanons.map((item) => ({ name: item.name, role: item.role, relationship: item.relationship })),
    { name: blueprint?.hero?.name, role: "child" },
    ...(blueprint?.cast || []),
  ].filter((item, index, all) => item?.name && all.findIndex((candidate) => key(candidate?.name) === key(item.name)) === index);
  const textByPage = new Map(Object.entries(pageTexts || {}).map(([page, text]) => [Number(page), String(text || "")]));
  const spreads = (blueprint?.pages || []).filter((page) => page.page_type === "image").map((imagePage) => {
    const textPage = blueprint.pages.find((page) => page.spread_number === imagePage.spread_number && page.page_type === "text");
    return textPage ? {
      spread_number: imagePage.spread_number,
      scene_number: imagePage.scene_number,
      text_page_number: textPage.page_number,
      image_page_number: imagePage.page_number,
      story_role: imagePage.story_role,
      prose: textByPage.get(textPage.page_number) || "",
      planned_image: imagePage.image_prompt || "",
      planned_cast: imagePage.cast_present || [],
    } : null;
  }).filter(Boolean);
  const response = await runAgent({
    name: "storyScenePlanner",
    clientKind: "story",
    system: loadPrompt("story_scene_planner.txt"),
    user: (input) => `COMPLETE_BOOK_JSON:\n${JSON.stringify(input, null, 2)}\n\nReturn ONLY JSON as specified.`,
    input: {
      language: blueprint?.language,
      canonical_characters: canonicalCharacters,
      page_texts: [...textByPage].map(([page_number, text]) => ({ page_number, text })),
      narrative_spreads: spreads,
    },
  });
  const candidate = response?.json ?? response?.data ?? response?.output ?? response;
  const plannedTexts = new Map(list(candidate?.page_texts, 50).map((item) => [Number(item?.page_number), String(item?.text || "")]));
  const finalPageTexts = Object.fromEntries([...textByPage].map(([pageNumber, original]) => [
    pageNumber,
    canonicalizeWrittenNames(plannedTexts.get(pageNumber) || original, canonicalCharacters),
  ]));
  const rawContracts = list(candidate?.scene_contracts, 30);
  const sceneContracts = spreads.map((expected) => {
    const raw = rawContracts.find((item) => Number(item?.image_page_number) === Number(expected.image_page_number)
      || Number(item?.spread_number) === Number(expected.spread_number)) || {};
    return normalizeContract({ ...raw }, {
      ...expected,
      // The reader-visible prose returned by the whole-book pass is the final
      // authority, never the earlier sequential draft supplied as input.
      prose: finalPageTexts[expected.text_page_number] || expected.prose,
    }, canonicalCharacters);
  });
  return { pageTexts: finalPageTexts, sceneContracts };
}

export function sceneContractImagePrompt({ contract, stylePrompt = "", fallbackPrompt = "" } = {}) {
  if (!contract) return String(fallbackPrompt || "").trim();
  const named = list(contract.named_characters, 10)
    .map((item) => `${item.name}: ${item.visual_role || "visible"}; action: ${item.action || "as defined by the story"}`)
    .join(" | ");
  const generic = list(contract.generic_characters, 12)
    .map((item) => `${item.id}: ${item.description}; action: ${item.action}; must remain visually distinct from ${(item.must_not_resemble || []).join(", ") || "all recurring characters"}`)
    .join(" | ");
  const elements = list(contract.required_elements, 15)
    .map((item) => `${item.description}${item.quantity ? `; quantity: ${item.quantity}` : ""}${item.scale ? `; scale: ${item.scale}` : ""}`)
    .join(" | ");
  return [
    "Create one detailed square children's-book illustration from the authoritative scene contract below.",
    `STORY BEAT: ${contract.story_beat || ""}`,
    contract.source_prose ? `AUTHORITATIVE PAIRED PROSE: ${contract.source_prose}` : "",
    `MAIN ACTION: ${contract.main_action?.subject || ""} ${contract.main_action?.verb || ""} ${contract.main_action?.target || ""}. The subject, gesture and target must be unmistakable.`,
    named ? `RECURRING NAMED CHARACTERS: ${named}` : "",
    generic ? `GENERIC CHARACTERS: ${generic}` : "",
    elements ? `REQUIRED VISIBLE ELEMENTS: ${elements}` : "",
    list(contract.spatial_relationships).length ? `SPATIAL RELATIONSHIPS: ${contract.spatial_relationships.join(" | ")}` : "",
    list(contract.forbidden_elements).length ? `FORBIDDEN SUBSTITUTIONS OR ELEMENTS: ${contract.forbidden_elements.join(" | ")}` : "",
    stylePrompt ? `LOCKED RENDERING STYLE: ${stylePrompt}` : "",
    "Show one readable focal action, coherent physical scale and the exact requested number of people or objects. Generic people are not recurring family members. No text, captions, logos or watermarks inside the illustration.",
  ].filter(Boolean).join("\n");
}

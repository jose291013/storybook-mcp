import { getWordsTargetByAge } from "../config/readingGuidance.js";

const TEXT_PAGE_TYPES = new Set(["text", "opening_text", "closing_text"]);

function sceneActByNumber(approvedScenario) {
  return new Map((approvedScenario?.scenes || []).map((scene) => [
    Number(scene.sceneNumber),
    Math.min(3, Math.max(1, Number(scene.act || 0))),
  ]).filter(([sceneNumber, act]) => sceneNumber > 0 && act > 0));
}

function fallbackAct(index, total) {
  if (total <= 1) return 1;
  return Math.min(3, Math.floor((index * 3) / total) + 1);
}

export function manuscriptBatches({
  pages = [],
  approvedScenario = null,
  heroAge = 8,
} = {}) {
  const textPages = pages.filter((page) => TEXT_PAGE_TYPES.has(page.page_type));
  const acts = sceneActByNumber(approvedScenario);
  const grouped = new Map();
  textPages.forEach((page, index) => {
    let act = acts.get(Number(page.scene_number));
    if (page.page_type === "opening_text") act = 1;
    if (page.page_type === "closing_text") act = 3;
    if (!act) act = fallbackAct(index, textPages.length);
    const guidance = getWordsTargetByAge(heroAge, page.page_type);
    const item = {
      page_number: Number(page.page_number),
      page_type: page.page_type,
      scene_number: Number(page.scene_number || 0),
      story_role: String(page.story_role || ""),
      text_prompt: String(page.text_prompt || ""),
      word_target: guidance.target,
      word_tolerance: guidance.tolerance,
    };
    grouped.set(act, [...(grouped.get(act) || []), item]);
  });
  return [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .map(([act, batchPages]) => ({ act, pages: batchPages }));
}

export function mergeManuscriptBatch(draftTextByPage, result, expectedPages) {
  const returned = new Map((result?.pages || []).map((page) => [
    Number(page?.page_number),
    String(page?.text || "").trim(),
  ]));
  for (const expected of expectedPages) {
    const text = returned.get(Number(expected.page_number));
    if (!text) {
      throw new Error(`Manuscript batch is missing page ${expected.page_number}`);
    }
    draftTextByPage.set(Number(expected.page_number), text);
  }
  return draftTextByPage;
}

function mentionsName(text, name) {
  const escaped = String(name || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return escaped && new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "iu")
    .test(String(text || ""));
}

export function applyManuscriptCorrections(
  draftTextByPage,
  review,
  allowedPages = [],
  canonicalCharacters = [],
) {
  const allowed = new Set(allowedPages.map(Number));
  for (const correction of review?.pages || []) {
    const pageNumber = Number(correction?.page_number);
    const text = String(correction?.text || "").trim();
    if (!allowed.has(pageNumber) || !text) continue;
    const previous = String(draftTextByPage.get(pageNumber) || "");
    const introducesCharacter = canonicalCharacters.some((character) => (
      character?.name
      && mentionsName(text, character.name)
      && !mentionsName(previous, character.name)
    ));
    if (introducesCharacter) continue;
    draftTextByPage.set(pageNumber, text);
  }
  return draftTextByPage;
}

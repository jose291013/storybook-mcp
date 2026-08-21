import { getWordsTargetByAge } from "../config/readingGuidance.js";
import { manuscriptWordCount } from "../contracts/manuscriptV1.js";
import { loadNarrativeBookSpecV3 } from "../contracts/narrativeBookSpecV3.js";
import { NarrativeV3ContractError } from "../contracts/narrativeV3SchemaRegistry.js";

export const MANUSCRIPT_WORD_PREFLIGHT_VERSION = 1;
export const MANUSCRIPT_WORD_PREFLIGHT_MAX_ATTEMPTS = 2;

const TEXT_KINDS = new Set(["opening_text", "scene_text", "closing_text"]);

function normalizedTextMap(pageTexts = {}) {
  if (pageTexts instanceof Map) {
    return new Map([...pageTexts].map(([pageNumber, text]) => [Number(pageNumber), String(text || "").replace(/\s+/gu, " ").trim()]));
  }
  return new Map(Object.entries(pageTexts || {}).map(([pageNumber, text]) => [
    Number(pageNumber),
    String(text || "").replace(/\s+/gu, " ").trim(),
  ]));
}

function escapedName(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentionedNames(text, canonicalNames = []) {
  return [...new Set(canonicalNames.map((name) => String(name || "").trim()).filter(Boolean))]
    .filter((name) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapedName(name)}(?=$|[^\\p{L}\\p{N}])`, "iu")
      .test(String(text || "")))
    .sort((left, right) => left.localeCompare(right));
}

function sameStrings(left = [], right = []) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function preflightError(code, issues, message = "The manuscript word-target preflight did not converge.") {
  const error = new NarrativeV3ContractError({ code, artifactType: "manuscript_v1", issues });
  error.message = message;
  error.pageNumber = Number(issues?.[0]?.pageNumber || 0) || null;
  return error;
}

export function manuscriptWordTargetIssues({ spec: rawSpec, pageTexts } = {}) {
  const spec = loadNarrativeBookSpecV3(rawSpec);
  const texts = normalizedTextMap(pageTexts);
  return spec.pages
    .filter((page) => TEXT_KINDS.has(page.kind))
    .map((page, index) => {
      const text = texts.get(Number(page.pageNumber)) || "";
      const wordCount = manuscriptWordCount(text);
      const guidance = getWordsTargetByAge(spec.book.audienceAge, page.kind === "scene_text" ? "text" : page.kind);
      const minimumWords = guidance.target - guidance.tolerance;
      const maximumWords = guidance.target + guidance.tolerance;
      if (text && wordCount >= minimumWords && wordCount <= maximumWords) return null;
      return {
        code: "manuscript_word_target_missed",
        keyword: "wordTarget",
        path: `/pages/${index}/text`,
        pageNumber: Number(page.pageNumber),
        pageKind: page.kind,
        sceneNumber: Number(page.sceneNumber || 0) || null,
        wordCount,
        wordTarget: guidance.target,
        wordTolerance: guidance.tolerance,
        minimumWords,
        maximumWords,
        message: `Page ${page.pageNumber} has ${wordCount} words; expected ${minimumWords}-${maximumWords}.`,
      };
    })
    .filter(Boolean);
}

export function manuscriptWordRepairRequestPages({
  spec: rawSpec,
  pageTexts,
  issues = [],
  storyScenePlan = null,
} = {}) {
  const spec = loadNarrativeBookSpecV3(rawSpec);
  const texts = normalizedTextMap(pageTexts);
  const textPages = spec.pages.filter((page) => TEXT_KINDS.has(page.kind));
  const contracts = Array.isArray(storyScenePlan?.sceneContracts) ? storyScenePlan.sceneContracts : [];
  const issueByPage = new Map(issues.map((issue) => [Number(issue.pageNumber), issue]));
  return textPages
    .map((page, index) => {
      const issue = issueByPage.get(Number(page.pageNumber));
      if (!issue) return null;
      const contract = contracts.find((candidate) => Number(candidate?.text_page_number) === Number(page.pageNumber));
      const scene = page.sceneNumber ? spec.scenes[Number(page.sceneNumber) - 1] : null;
      return {
        page_number: Number(page.pageNumber),
        page_type: page.kind,
        scene_number: Number(page.sceneNumber || 0),
        current_text: texts.get(Number(page.pageNumber)) || "",
        current_word_count: issue.wordCount,
        word_target: issue.wordTarget,
        word_tolerance: issue.wordTolerance,
        minimum_words: issue.minimumWords,
        maximum_words: issue.maximumWords,
        previous_text: index > 0 ? texts.get(Number(textPages[index - 1].pageNumber)) || "" : "",
        next_text: index + 1 < textPages.length ? texts.get(Number(textPages[index + 1].pageNumber)) || "" : "",
        canonical_scene: scene,
        visual_beat: contract || null,
      };
    })
    .filter(Boolean);
}

function normalizedCorrections(result = {}) {
  const entries = (Array.isArray(result?.pages) ? result.pages : []).map((page) => [
    Number(page?.page_number),
    String(page?.text || "").replace(/\s+/gu, " ").trim(),
  ]).filter(([pageNumber, text]) => pageNumber > 0 && text);
  return { entries, corrections: new Map(entries) };
}

export async function normalizeManuscriptWordTargets({
  spec: rawSpec,
  pageTexts,
  canonicalNames = [],
  repair,
  maxAttempts = MANUSCRIPT_WORD_PREFLIGHT_MAX_ATTEMPTS,
} = {}) {
  const spec = loadNarrativeBookSpecV3(rawSpec);
  const texts = normalizedTextMap(pageTexts);
  const originalTexts = new Map(texts);
  const initialIssues = manuscriptWordTargetIssues({ spec, pageTexts: texts });
  if (!initialIssues.length) {
    return {
      version: MANUSCRIPT_WORD_PREFLIGHT_VERSION,
      status: "valid",
      changed: false,
      attemptCount: 0,
      changedPageNumbers: [],
      pageTexts: Object.fromEntries(texts),
      repairs: [],
    };
  }
  if (typeof repair !== "function") {
    throw preflightError("manuscript_word_target_missed", initialIssues);
  }

  let issues = initialIssues;
  let priorFailure = null;
  const attempts = Math.max(1, Math.min(2, Number(maxAttempts) || 1));
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const requested = new Set(issues.map((issue) => issue.pageNumber));
    const result = await repair({
      attempt,
      issues: structuredClone(issues),
      pageTexts: Object.fromEntries(texts),
      priorFailure,
    });
    const { entries, corrections } = normalizedCorrections(result);
    const returned = new Set(corrections.keys());
    if (entries.length !== requested.size
      || returned.size !== requested.size
      || [...returned].some((pageNumber) => !requested.has(pageNumber))) {
      priorFailure = "The correction response did not return every requested physical page exactly once.";
      if (attempt === attempts) {
        throw preflightError("manuscript_word_preflight_response_invalid", issues, priorFailure);
      }
      continue;
    }

    const entityDrift = [];
    for (const pageNumber of requested) {
      const before = texts.get(pageNumber) || "";
      const after = corrections.get(pageNumber) || "";
      const beforeNames = mentionedNames(before, canonicalNames);
      const afterNames = mentionedNames(after, canonicalNames);
      if (!sameStrings(beforeNames, afterNames)) {
        entityDrift.push({
          keyword: "namedMentions",
          path: `/pages/${pageNumber}/text`,
          pageNumber,
          message: `Page ${pageNumber} changed its approved named-character mentions.`,
        });
      }
    }
    if (entityDrift.length) {
      priorFailure = entityDrift.map((issue) => issue.message).join(" ");
      if (attempt === attempts) {
        throw preflightError("manuscript_word_preflight_entity_drift", entityDrift, priorFailure);
      }
      continue;
    }

    for (const [pageNumber, text] of corrections) texts.set(pageNumber, text);
    issues = manuscriptWordTargetIssues({ spec, pageTexts: texts });
    if (!issues.length) {
      const repairs = [...texts]
        .filter(([pageNumber, text]) => text !== originalTexts.get(pageNumber))
        .map(([pageNumber, text]) => {
          const initial = initialIssues.find((issue) => issue.pageNumber === pageNumber);
          return {
            pageNumber,
            beforeWords: manuscriptWordCount(originalTexts.get(pageNumber)),
            afterWords: manuscriptWordCount(text),
            wordTarget: initial?.wordTarget || 0,
            minimumWords: initial?.minimumWords || 0,
            maximumWords: initial?.maximumWords || 0,
          };
        });
      return {
        version: MANUSCRIPT_WORD_PREFLIGHT_VERSION,
        status: "normalized",
        changed: repairs.length > 0,
        attemptCount: attempt,
        changedPageNumbers: repairs.map((repairEntry) => repairEntry.pageNumber),
        pageTexts: Object.fromEntries(texts),
        repairs,
      };
    }
    priorFailure = issues.map((issue) => issue.message).join(" ");
  }
  throw preflightError("manuscript_word_target_missed", issues);
}

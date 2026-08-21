import { loadNarrativeBookSpecV3 } from "../contracts/narrativeBookSpecV3.js";
import {
  compileSceneProseAuthority,
  mentionedCharacterIds,
  sceneProseCharacterIssues,
} from "../contracts/sceneProseAuthorityV1.js";
import { NarrativeV3ContractError } from "../contracts/narrativeV3SchemaRegistry.js";

export const MANUSCRIPT_SCENE_CAST_PREFLIGHT_VERSION = 1;
export const MANUSCRIPT_SCENE_CAST_MAX_ATTEMPTS = 2;

function textMap(pageTexts = {}) {
  const entries = pageTexts instanceof Map ? [...pageTexts] : Object.entries(pageTexts || {});
  return new Map(entries.map(([pageNumber, text]) => [
    Number(pageNumber),
    String(text || "").replace(/\s+/gu, " ").trim(),
  ]));
}

function preflightError(code, issues, message) {
  const error = new NarrativeV3ContractError({ code, artifactType: "manuscript_fact_evidence_v1", issues });
  error.message = message || "The manuscript scene-cast preflight did not converge.";
  error.pageNumber = Number(issues?.[0]?.pageNumber || 0) || null;
  return error;
}

export function manuscriptSceneCastIssues({ spec: rawSpec, pageTexts } = {}) {
  const spec = loadNarrativeBookSpecV3(rawSpec);
  const texts = textMap(pageTexts);
  return spec.pages.flatMap((page) => {
    if (page.kind !== "scene_text") return [];
    return sceneProseCharacterIssues({
      spec,
      sceneNumber: page.sceneNumber,
      pageNumber: page.pageNumber,
      text: texts.get(page.pageNumber) || "",
    });
  });
}

export function manuscriptSceneCastRepairPages({ spec: rawSpec, pageTexts, issues = [], storyScenePlan = null } = {}) {
  const spec = loadNarrativeBookSpecV3(rawSpec);
  const texts = textMap(pageTexts);
  const issueByPage = new Map(issues.map((issue) => [Number(issue.pageNumber), issue]));
  const textPages = spec.pages.filter((page) => ["opening_text", "scene_text", "closing_text"].includes(page.kind));
  const contracts = Array.isArray(storyScenePlan?.sceneContracts) ? storyScenePlan.sceneContracts : [];
  return textPages.map((page, index) => {
    const issue = issueByPage.get(page.pageNumber);
    if (!issue || page.kind !== "scene_text") return null;
    const authority = compileSceneProseAuthority({ spec, sceneNumber: page.sceneNumber });
    const characterById = new Map(spec.registries.characters.map((character) => [character.id, character]));
    return {
      page_number: page.pageNumber,
      scene_number: page.sceneNumber,
      current_text: texts.get(page.pageNumber) || "",
      previous_text: index > 0 ? texts.get(textPages[index - 1].pageNumber) || "" : "",
      next_text: index + 1 < textPages.length ? texts.get(textPages[index + 1].pageNumber) || "" : "",
      allowed_characters: authority.allowed_characters,
      forbidden_observed_characters: issue.unexpectedCharacterIds.map((id) => ({
        id,
        display_name: characterById.get(id)?.displayName || id,
        family_address: characterById.get(id)?.familyAddress || "",
      })),
      canonical_scene: spec.scenes[page.sceneNumber - 1],
      visual_beat: contracts.find((candidate) => Number(candidate?.text_page_number) === page.pageNumber) || null,
    };
  }).filter(Boolean);
}

function corrections(result = {}) {
  const entries = (Array.isArray(result?.pages) ? result.pages : []).map((page) => [
    Number(page?.page_number),
    String(page?.text || "").replace(/\s+/gu, " ").trim(),
  ]).filter(([pageNumber, text]) => pageNumber > 0 && text);
  return { entries, byPage: new Map(entries) };
}

export async function normalizeManuscriptSceneCast({
  spec: rawSpec,
  pageTexts,
  storyScenePlan = null,
  repair,
  maxAttempts = MANUSCRIPT_SCENE_CAST_MAX_ATTEMPTS,
} = {}) {
  const spec = loadNarrativeBookSpecV3(rawSpec);
  const texts = textMap(pageTexts);
  const original = new Map(texts);
  const initialIssues = manuscriptSceneCastIssues({ spec, pageTexts: texts });
  if (!initialIssues.length) return {
    version: MANUSCRIPT_SCENE_CAST_PREFLIGHT_VERSION,
    status: "valid",
    changed: false,
    attemptCount: 0,
    changedPageNumbers: [],
    pageTexts: Object.fromEntries(texts),
  };
  if (typeof repair !== "function") {
    throw preflightError("manuscript_character_fact_unregistered", initialIssues);
  }
  let issues = initialIssues;
  let priorFailure = "";
  const attempts = Math.max(1, Math.min(2, Number(maxAttempts) || 1));
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const requested = new Set(issues.map((issue) => issue.pageNumber));
    const beforeAllowedMentions = new Map([...requested].map((pageNumber) => {
      const specPage = spec.pages.find((page) => page.pageNumber === pageNumber);
      const authority = compileSceneProseAuthority({ spec, sceneNumber: specPage?.sceneNumber });
      const observed = mentionedCharacterIds(texts.get(pageNumber), spec.registries.characters);
      return [pageNumber, observed.filter((id) => authority.allowed_character_ids.includes(id)).sort()];
    }));
    const result = await repair({
      attempt,
      issues: structuredClone(issues),
      pages: manuscriptSceneCastRepairPages({ spec, pageTexts: texts, issues, storyScenePlan }),
      priorFailure,
    });
    const { entries, byPage } = corrections(result);
    if (entries.length !== requested.size
      || byPage.size !== requested.size
      || [...byPage.keys()].some((pageNumber) => !requested.has(pageNumber))) {
      priorFailure = "Return every requested physical page exactly once and no other page.";
      if (attempt === attempts) throw preflightError("manuscript_scene_cast_response_invalid", issues, priorFailure);
      continue;
    }
    let allowedMentionDrift = false;
    for (const [pageNumber, text] of byPage) {
      const specPage = spec.pages.find((page) => page.pageNumber === pageNumber);
      const authority = compileSceneProseAuthority({ spec, sceneNumber: specPage?.sceneNumber });
      const afterAllowed = mentionedCharacterIds(text, spec.registries.characters)
        .filter((id) => authority.allowed_character_ids.includes(id)).sort();
      if (JSON.stringify(afterAllowed) !== JSON.stringify(beforeAllowedMentions.get(pageNumber))) {
        allowedMentionDrift = true;
        break;
      }
    }
    if (allowedMentionDrift) {
      priorFailure = "The repair changed an already-authorized named-character mention.";
      if (attempt === attempts) throw preflightError("manuscript_scene_cast_allowed_mention_drift", issues, priorFailure);
      continue;
    }
    for (const [pageNumber, text] of byPage) texts.set(pageNumber, text);
    issues = manuscriptSceneCastIssues({ spec, pageTexts: texts });
    if (!issues.length) {
      const changedPageNumbers = [...requested].filter((pageNumber) => texts.get(pageNumber) !== original.get(pageNumber)).sort((a, b) => a - b);
      return {
        version: MANUSCRIPT_SCENE_CAST_PREFLIGHT_VERSION,
        status: "normalized",
        changed: changedPageNumbers.length > 0,
        attemptCount: attempt,
        changedPageNumbers,
        pageTexts: Object.fromEntries(texts),
      };
    }
    priorFailure = issues.map((issue) => issue.message).join(" ");
  }
  throw preflightError("manuscript_character_fact_unregistered", issues);
}

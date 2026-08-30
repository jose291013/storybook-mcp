import { getWordsTargetByAge } from "../config/readingGuidance.js";
import { manuscriptWordCount } from "../contracts/manuscriptV1.js";
import { loadNarrativeBookSpecV3 } from "../contracts/narrativeBookSpecV3.js";
import { NarrativeV3ContractError } from "../contracts/narrativeV3SchemaRegistry.js";
import {
  compileSceneProseAuthority,
  mentionedCharacterIds,
} from "../contracts/sceneProseAuthorityV1.js";
import { canonicalNarrativeV2Safety } from "./narrativeV2Shadow.js";
import { childSafetyContract } from "./childSafety.js";
import { manuscriptSceneCastIssues } from "./manuscriptSceneCastPreflight.js";
import { manuscriptWordTargetIssues } from "./manuscriptWordPreflight.js";

export const GENERATED_MANUSCRIPT_SAFETY_CONFORMANCE_VERSION = 1;
export const GENERATED_MANUSCRIPT_SAFETY_CONFORMANCE_MAX_ATTEMPTS = 1;

const TEXT_KINDS = new Set(["opening_text", "scene_text", "closing_text"]);
const ALLOWED_CATEGORIES = new Set(["general", "protective_education"]);

function textMap(pageTexts = {}) {
  const entries = pageTexts instanceof Map ? [...pageTexts] : Object.entries(pageTexts || {});
  return new Map(entries.map(([pageNumber, text]) => [
    Number(pageNumber),
    String(text || "").replace(/\s+/gu, " ").trim(),
  ]));
}

function conformanceError(code, issues = [], message = "Generated manuscript safety conformance did not converge.") {
  const error = new NarrativeV3ContractError({
    code,
    artifactType: "manuscript_safety_conformance_v1",
    issues,
  });
  error.message = message;
  error.pageNumber = Number(issues?.[0]?.pageNumber || 0) || null;
  return error;
}

function validAuthority(childSafety = {}) {
  return childSafety
    && childSafety.action === "allow"
    && childSafety.restricted === false
    && ALLOWED_CATEGORIES.has(String(childSafety.category || ""));
}

export function approvedChildSafetyAuthority({ project = {}, spec: rawSpec = null } = {}) {
  const spec = loadNarrativeBookSpecV3(rawSpec);
  const approval = project?.continuitySnapshot?.narrativeV3Approval || {};
  if (approval.artifactDigest !== spec.validation.artifactDigest) {
    throw conformanceError("approved_safety_contract_stale", [{
      path: "/narrativeV3Approval/artifactDigest",
      message: "The approved safety authority is not bound to this Narrative V3 artifact.",
    }]);
  }
  const childSafety = approval.childSafety || canonicalNarrativeV2Safety(project).childSafety;
  if (!validAuthority(childSafety)) {
    throw conformanceError("approved_safety_contract_invalid", [{
      path: "/narrativeV3Approval/childSafety",
      message: "An allowed scenario-level child-safety authority is required.",
    }]);
  }
  return Object.freeze({
    version: 1,
    source: approval.childSafety ? "scenario_approval" : "legacy_questionnaire_compatibility",
    artifactDigest: spec.validation.artifactDigest,
    childSafety: Object.freeze(structuredClone(childSafety)),
  });
}

export function sealedChildSafetyDecision(authority) {
  const childSafety = authority?.childSafety || {};
  if (!validAuthority(childSafety)) {
    throw conformanceError("approved_safety_contract_invalid", [{
      path: "/childSafety",
      message: "The sealed child-safety authority is invalid.",
    }]);
  }
  const profile = {
    version: Number(childSafety.profileVersion || 1),
    category: childSafety.category,
    action: "allow",
    restricted: false,
    confidence: "high",
    safetyContractId: childSafety.contractId || "",
    source: "approved_scenario",
  };
  return {
    mode: "enforce",
    profile,
    intervention: null,
    contract: childSafetyContract(profile),
  };
}

function profileFromAssessment(value = {}) {
  return value?.profile || value || null;
}

function assessmentAction(value = {}) {
  return String(profileFromAssessment(value)?.action || "allow");
}

function assessmentCategory(value = {}) {
  return String(profileFromAssessment(value)?.category || "general");
}

function requestPages({ spec, texts, pageNumbers, storyScenePlan, assessments }) {
  const textPages = spec.pages.filter((page) => TEXT_KINDS.has(page.kind));
  const contracts = Array.isArray(storyScenePlan?.sceneContracts) ? storyScenePlan.sceneContracts : [];
  return textPages.map((page, index) => {
    if (!pageNumbers.has(page.pageNumber)) return null;
    const guidance = getWordsTargetByAge(
      spec.book.audienceAge,
      page.kind === "scene_text" ? "text" : page.kind,
    );
    const scene = page.sceneNumber ? spec.scenes[Number(page.sceneNumber) - 1] : null;
    return {
      page_number: page.pageNumber,
      page_type: page.kind,
      scene_number: Number(page.sceneNumber || 0),
      current_text: texts.get(page.pageNumber) || "",
      current_word_count: manuscriptWordCount(texts.get(page.pageNumber) || ""),
      minimum_words: guidance.target - guidance.tolerance,
      maximum_words: guidance.target + guidance.tolerance,
      detected_category: assessmentCategory(assessments.get(page.pageNumber)),
      detected_action: assessmentAction(assessments.get(page.pageNumber)),
      previous_text: index > 0 ? texts.get(textPages[index - 1].pageNumber) || "" : "",
      next_text: index + 1 < textPages.length ? texts.get(textPages[index + 1].pageNumber) || "" : "",
      canonical_scene: scene,
      prose_authority: scene ? compileSceneProseAuthority({ spec, sceneNumber: page.sceneNumber }) : null,
      visual_beat: contracts.find((candidate) => Number(candidate?.text_page_number) === page.pageNumber) || null,
    };
  }).filter(Boolean);
}

async function assessText(assess, text, pageNumber = null) {
  return assess({ text, pageNumber });
}

export async function normalizeGeneratedManuscriptSafety({
  spec: rawSpec,
  authority,
  pageTexts,
  storyScenePlan = null,
  assess,
  repair,
} = {}) {
  const spec = loadNarrativeBookSpecV3(rawSpec);
  if (!validAuthority(authority?.childSafety) || authority.artifactDigest !== spec.validation.artifactDigest) {
    throw conformanceError("approved_safety_contract_invalid", [{
      path: "/authority",
      message: "Generated prose must descend from the exact approved scenario safety authority.",
    }]);
  }
  if (typeof assess !== "function") {
    throw conformanceError("manuscript_safety_assessor_missing", [{ path: "/assess", message: "A private safety assessor is required." }]);
  }
  const texts = textMap(pageTexts);
  const original = new Map(texts);
  const allText = spec.pages.filter((page) => TEXT_KINDS.has(page.kind))
    .map((page) => texts.get(page.pageNumber) || "").join("\n");
  const initial = await assessText(assess, allText);
  if (assessmentAction(initial) === "allow") {
    return {
      version: GENERATED_MANUSCRIPT_SAFETY_CONFORMANCE_VERSION,
      status: "valid",
      changed: false,
      attemptCount: 0,
      changedPageNumbers: [],
      pageTexts: Object.fromEntries(texts),
    };
  }
  if (typeof repair !== "function") {
    throw conformanceError("generated_manuscript_safety_drift_unresolved", [{
      path: "/manuscript",
      message: "The generated manuscript diverged from its approved safety authority.",
    }]);
  }

  const assessments = new Map();
  for (const page of spec.pages.filter((candidate) => TEXT_KINDS.has(candidate.kind))) {
    const result = await assessText(assess, texts.get(page.pageNumber) || "", page.pageNumber);
    assessments.set(page.pageNumber, result);
  }
  const unsafePages = new Set([...assessments]
    .filter(([, result]) => assessmentAction(result) !== "allow")
    .map(([pageNumber]) => pageNumber));
  if (!unsafePages.size) {
    throw conformanceError("generated_manuscript_safety_drift_unresolved", [{
      path: "/manuscript",
      message: "The manuscript-level safety drift could not be localized to a bounded page repair.",
    }]);
  }

  const beforeMentions = new Map([...unsafePages].map((pageNumber) => [
    pageNumber,
    mentionedCharacterIds(texts.get(pageNumber), spec.registries.characters),
  ]));
  const result = await repair({
    attempt: 1,
    approvedSafety: authority.childSafety,
    pages: requestPages({ spec, texts, pageNumbers: unsafePages, storyScenePlan, assessments }),
    priorFailure: "",
  });
  const entries = (Array.isArray(result?.pages) ? result.pages : []).map((page) => [
    Number(page?.page_number),
    String(page?.text || "").replace(/\s+/gu, " ").trim(),
  ]).filter(([pageNumber, text]) => pageNumber > 0 && text);
  const corrections = new Map(entries);
  if (entries.length !== unsafePages.size
    || corrections.size !== unsafePages.size
    || [...corrections].some(([pageNumber, text]) => !unsafePages.has(pageNumber) || text === original.get(pageNumber))) {
    throw conformanceError("manuscript_safety_conformance_response_invalid", [...unsafePages].map((pageNumber) => ({
      path: `/pages/${pageNumber}/text`, pageNumber, message: "Return every requested changed page exactly once.",
    })));
  }
  for (const [pageNumber, text] of corrections) {
    const afterMentions = mentionedCharacterIds(text, spec.registries.characters);
    if (JSON.stringify(afterMentions) !== JSON.stringify(beforeMentions.get(pageNumber))) {
      throw conformanceError("manuscript_safety_conformance_entity_drift", [{
        path: `/pages/${pageNumber}/text`, pageNumber, message: "The safety repair changed approved named-character mentions.",
      }]);
    }
    texts.set(pageNumber, text);
  }
  const contractIssues = [
    ...manuscriptWordTargetIssues({ spec, pageTexts: texts }),
    ...manuscriptSceneCastIssues({ spec, pageTexts: texts }),
  ];
  if (contractIssues.length) {
    throw conformanceError("manuscript_safety_conformance_contract_drift", contractIssues, "The safety repair changed another immutable manuscript fact.");
  }
  const repairedText = spec.pages.filter((page) => TEXT_KINDS.has(page.kind))
    .map((page) => texts.get(page.pageNumber) || "").join("\n");
  const finalAssessment = await assessText(assess, repairedText);
  if (assessmentAction(finalAssessment) !== "allow") {
    throw conformanceError("generated_manuscript_safety_drift_unresolved", [...unsafePages].map((pageNumber) => ({
      path: `/pages/${pageNumber}/text`, pageNumber, message: "The bounded private repair did not restore the approved safety profile.",
    })));
  }
  for (const pageNumber of unsafePages) {
    const pageAssessment = await assessText(assess, texts.get(pageNumber) || "", pageNumber);
    if (assessmentAction(pageAssessment) !== "allow") {
      throw conformanceError("generated_manuscript_safety_drift_unresolved", [{
        path: `/pages/${pageNumber}/text`, pageNumber, message: "This generated page still conflicts with the approved safety profile.",
      }]);
    }
  }
  return {
    version: GENERATED_MANUSCRIPT_SAFETY_CONFORMANCE_VERSION,
    status: "normalized",
    changed: true,
    attemptCount: 1,
    changedPageNumbers: [...unsafePages].sort((a, b) => a - b),
    pageTexts: Object.fromEntries(texts),
  };
}

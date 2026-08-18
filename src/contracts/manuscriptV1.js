import { getWordsTargetByAge } from "../config/readingGuidance.js";
import { canonicalDigest } from "./narrativeV3Canonical.js";
import { loadNarrativeBookSpecV3 } from "./narrativeBookSpecV3.js";
import {
  assertNarrativeV3Schema,
  NarrativeV3ContractError,
} from "./narrativeV3SchemaRegistry.js";

export const MANUSCRIPT_WIRE_VERSION = 1;
export const MANUSCRIPT_WIRE_ID = "calitiki.manuscript-wire.v1";
export const MANUSCRIPT_VERSION = 1;
export const MANUSCRIPT_ID = "calitiki.manuscript.v1";
export const MANUSCRIPT_PARSER_VERSION = 1;

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

function manuscriptError(code, path, message) {
  throw new NarrativeV3ContractError({
    code,
    artifactType: "manuscript_v1",
    issues: [{ path, message }],
  });
}

function digestProjection(value) {
  const projection = structuredClone(value);
  if (projection.validation) delete projection.validation.artifactDigest;
  return projection;
}

export function manuscriptDigest(manuscript) {
  return canonicalDigest(digestProjection(manuscript));
}

export function manuscriptWordCount(value) {
  return String(value || "").match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length || 0;
}

function normalizedText(value) {
  return String(value || "").replace(/\s+/gu, " ").trim();
}

function expectedTextPages(spec) {
  return spec.pages.filter((page) => ["opening_text", "scene_text", "closing_text"].includes(page.kind));
}

function assertManuscriptInvariants(manuscript) {
  if (manuscript.pages.length !== (manuscript.book.pageCount - 2) / 2 + 2) {
    manuscriptError("manuscript_page_count_mismatch", "/pages", "The manuscript must contain every reader-visible text page exactly once.");
  }
  const pageNumbers = manuscript.pages.map((page) => page.pageNumber);
  if (new Set(pageNumbers).size !== pageNumbers.length || pageNumbers.some((number, index) => index > 0 && number <= pageNumbers[index - 1])) {
    manuscriptError("manuscript_page_order_invalid", "/pages", "Manuscript pages must be unique and physically ordered.");
  }
  manuscript.pages.forEach((page, index) => {
    const count = manuscriptWordCount(page.text);
    if (count !== page.wordCount) {
      manuscriptError("manuscript_word_count_mismatch", `/pages/${index}/wordCount`, "The stored word count does not match the exact page text.");
    }
    if (count < page.wordTarget - page.wordTolerance || count > page.wordTarget + page.wordTolerance) {
      manuscriptError("manuscript_word_target_missed", `/pages/${index}/text`, "The page text falls outside its deterministic age-bound word range.");
    }
    if (page.kind === "scene_text") {
      if (!page.sceneNumber || !page.sourceSceneDigest || !page.objectStateDigest) {
        manuscriptError("manuscript_scene_binding_missing", `/pages/${index}`, "A scene text page needs exact scene and object-state evidence.");
      }
    } else if (page.sceneNumber !== null || page.sourceSceneDigest !== null || page.objectStateDigest !== null) {
      manuscriptError("manuscript_non_scene_binding_invalid", `/pages/${index}`, "Opening and closing prose cannot claim a scene binding.");
    }
  });
}

export function parseManuscriptWire({ spec: rawSpec, wire: rawWire, revision = 1 } = {}) {
  const spec = loadNarrativeBookSpecV3(rawSpec);
  assertNarrativeV3Schema("manuscript_wire_v1", rawWire);
  if (!Number.isSafeInteger(Number(revision)) || Number(revision) < 1) {
    manuscriptError("manuscript_revision_invalid", "/revision", "A positive manuscript revision is required.");
  }
  if (rawWire.source_spec_digest !== spec.validation.artifactDigest) {
    manuscriptError("manuscript_source_spec_mismatch", "/source_spec_digest", "The model response does not belong to this exact released book specification.");
  }
  if (rawWire.language !== spec.book.language) {
    manuscriptError("manuscript_language_mismatch", "/language", "The manuscript response language does not match the released book language.");
  }
  const expected = expectedTextPages(spec);
  const returned = new Map();
  rawWire.pages.forEach((page, index) => {
    if (returned.has(page.page_number)) {
      manuscriptError("manuscript_page_duplicate", `/pages/${index}/page_number`, "A manuscript page may be returned only once.");
    }
    returned.set(page.page_number, normalizedText(page.text));
  });
  const expectedNumbers = new Set(expected.map((page) => page.pageNumber));
  if (returned.size !== expected.length || [...returned.keys()].some((pageNumber) => !expectedNumbers.has(pageNumber))) {
    manuscriptError("manuscript_page_set_mismatch", "/pages", "The model must return every requested text page exactly once and no other page.");
  }
  const pages = expected.map((page) => {
    const text = returned.get(page.pageNumber);
    if (!text) manuscriptError("manuscript_page_missing", `/pages/${page.pageNumber}`, "A required text page is missing.");
    const guidance = getWordsTargetByAge(spec.book.audienceAge, page.kind === "scene_text" ? "text" : page.kind);
    const scene = page.sceneNumber ? spec.scenes[page.sceneNumber - 1] : null;
    return {
      pageNumber: page.pageNumber,
      kind: page.kind,
      act: scene?.act || (page.kind === "opening_text" ? 1 : 3),
      sceneNumber: scene?.sceneNumber || null,
      sourceSceneDigest: scene?.sourceSceneDigest || null,
      objectStateDigest: scene?.objectStateDigest || null,
      text,
      wordCount: manuscriptWordCount(text),
      wordTarget: guidance.target,
      wordTolerance: guidance.tolerance,
    };
  });
  const manuscript = {
    schemaVersion: MANUSCRIPT_VERSION,
    contractId: MANUSCRIPT_ID,
    revision: Number(revision),
    sourceSpec: {
      contractId: spec.contractId,
      schemaVersion: spec.schemaVersion,
      artifactDigest: spec.validation.artifactDigest,
    },
    book: {
      language: spec.book.language,
      audienceAge: spec.book.audienceAge,
      readingBand: spec.book.readingBand,
      pageCount: spec.book.pageCount,
    },
    pages,
    validation: { parserVersion: MANUSCRIPT_PARSER_VERSION, artifactDigest: "" },
  };
  manuscript.validation.artifactDigest = manuscriptDigest(manuscript);
  assertNarrativeV3Schema("manuscript_v1", manuscript);
  assertManuscriptInvariants(manuscript);
  return deepFreeze(structuredClone(manuscript));
}

export function loadManuscript(value) {
  assertNarrativeV3Schema("manuscript_v1", value);
  assertManuscriptInvariants(value);
  if (value.validation.artifactDigest !== manuscriptDigest(value)) {
    manuscriptError("manuscript_digest_mismatch", "/validation/artifactDigest", "The digest does not belong to this exact manuscript.");
  }
  return deepFreeze(structuredClone(value));
}

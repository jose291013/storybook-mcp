import { isReusableDraftPage } from "./previewGenerationCheckpoint.js";

export const STRICT_V3_ACCEPTED_PAGE_STATUSES = Object.freeze([
  "accepted",
  "strict_accepted",
  "accepted_after_repair",
  "approved",
  "creator_approved",
]);

function normalizedStatus(page = {}) {
  return String(page.qualityStatus || "accepted").trim().toLowerCase();
}

export function isStrictV3AcceptedImagePage(page = {}) {
  if (page.page_type !== "image" || !isReusableDraftPage(page) || !page.imageStorageKey) return false;
  const status = normalizedStatus(page);
  return Number(page.strictEvidenceVersion || 0) === 2
    && (status.startsWith("accepted") || STRICT_V3_ACCEPTED_PAGE_STATUSES.includes(status));
}

export function partitionPreviewDraftPages(pages = [], { strictV3Rendering = false } = {}) {
  const reusable = (Array.isArray(pages) ? pages : []).filter(isReusableDraftPage);
  if (!strictV3Rendering) {
    return { acceptedPages: reusable, recoveryPageNumbers: [] };
  }
  const acceptedPages = [];
  const recoveryPageNumbers = [];
  for (const page of reusable) {
    if (page.page_type !== "image" || isStrictV3AcceptedImagePage(page)) {
      acceptedPages.push(page);
    } else {
      recoveryPageNumbers.push(Number(page.page_number));
    }
  }
  return {
    acceptedPages,
    recoveryPageNumbers: [...new Set(recoveryPageNumbers.filter(Number.isFinite))].sort((a, b) => a - b),
  };
}

export function upsertPreviewDraftPage(pages = [], page = {}) {
  const pageNumber = Number(page.page_number);
  const index = pages.findIndex((candidate) => Number(candidate.page_number) === pageNumber);
  if (index >= 0) pages[index] = page;
  else pages.push(page);
  return pages;
}

export function strictPageIssueCodes(page = {}) {
  const sources = [
    page.qualityIssueCodes,
    page.qualityRepairPolicy?.remainingIssueCodes,
    page.qualityRepairPolicy?.targetCodes,
    page.qualityRepairPolicy?.classifications?.map((item) => item?.code),
  ];
  for (const source of sources) {
    const codes = [...new Set((Array.isArray(source) ? source : []).map(String).filter(Boolean))];
    if (codes.length) return codes;
  }
  return [];
}

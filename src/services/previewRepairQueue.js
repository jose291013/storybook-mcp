import crypto from "crypto";
import { isStrictV3AcceptedImagePage, strictPageIssueCodes } from "./previewPageRecovery.js";

export const PREVIEW_REPAIR_QUEUE_VERSION = 1;

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function unique(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].sort();
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function queueDigest(pages) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(stableValue(pages)))
    .digest("hex")
    .slice(0, 24);
}

function blocker({ pageNumber, kind = "scene", issueCodes = [], source }) {
  return {
    pageNumber,
    kind: String(kind || "scene").slice(0, 80),
    issueCodes: unique(issueCodes).slice(0, 16),
    source,
  };
}

/**
 * Compile the customer-safe, durable state of an incomplete preview. It keeps
 * only page numbers and bounded diagnostic codes; names, prompts, images and
 * customer prose never enter this manifest.
 */
export function buildPreviewRepairQueue({
  previewResult = {},
  totalPageCount = 0,
  priorQueue = null,
  status = "awaiting_retry",
} = {}) {
  const byPage = new Map();
  for (const deferred of Array.isArray(previewResult?.deferredIllustrationPages)
    ? previewResult.deferredIllustrationPages
    : []) {
    const pageNumber = positiveInteger(deferred?.pageNumber);
    if (!pageNumber) continue;
    byPage.set(pageNumber, blocker({
      pageNumber,
      kind: deferred?.kind || "provider_safety",
      issueCodes: [...(deferred?.issueCodes || []), "provider_safety_rejection"],
      source: "provider_safety",
    }));
  }
  for (const page of Array.isArray(previewResult?.draftPages) ? previewResult.draftPages : []) {
    const pageNumber = positiveInteger(page?.page_number);
    if (!pageNumber || page?.page_type !== "image" || isStrictV3AcceptedImagePage(page)) continue;
    const previous = byPage.get(pageNumber);
    byPage.set(pageNumber, blocker({
      pageNumber,
      kind: page?.qualityKind || previous?.kind || "scene",
      issueCodes: [...(previous?.issueCodes || []), ...strictPageIssueCodes(page)],
      source: previous ? "provider_and_quality" : "strict_quality",
    }));
  }
  const pages = [...byPage.values()].sort((left, right) => left.pageNumber - right.pageNumber);
  if (!pages.length) return null;
  const normalizedTotal = Math.max(positiveInteger(totalPageCount) || 0, pages.at(-1)?.pageNumber || 0);
  const attemptCount = Math.max(0, Number(priorQueue?.attemptCount || 0));
  return {
    version: PREVIEW_REPAIR_QUEUE_VERSION,
    digest: queueDigest(pages),
    status: ["awaiting_retry", "repairing", "exhausted"].includes(status) ? status : "awaiting_retry",
    totalPageCount: normalizedTotal,
    readyPageCount: Math.max(0, normalizedTotal - pages.length),
    pendingPageCount: pages.length,
    pendingPageNumbers: pages.map((page) => page.pageNumber),
    pages,
    attemptCount,
    preparedAt: new Date().toISOString(),
  };
}

export function startPreviewRepairQueue(queue, startedAt = new Date().toISOString()) {
  if (!queue || queue.version !== PREVIEW_REPAIR_QUEUE_VERSION) return null;
  return {
    ...queue,
    status: "repairing",
    attemptCount: Math.max(0, Number(queue.attemptCount || 0)) + 1,
    startedAt,
  };
}

export function finalizePreviewRepairQueue(queue, { retryAvailable = false } = {}) {
  if (!queue || queue.version !== PREVIEW_REPAIR_QUEUE_VERSION) return null;
  return {
    ...queue,
    status: retryAvailable ? "awaiting_retry" : "exhausted",
    retryAvailable: retryAvailable === true,
    updatedAt: new Date().toISOString(),
  };
}

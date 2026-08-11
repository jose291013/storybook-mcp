import { creditStore } from "./creditStore.js";
import { generationRunStore } from "./generationRunStore.js";
import {
  generationCheckpoint,
  mergeGenerationCheckpoint,
  PREVIEW_RETRY_POLICY_VERSION,
} from "./previewGenerationCheckpoint.js";
import { notifyPreviewReady } from "./previewNotification.js";
import { projectStore } from "./projectStore.js";

export const MAX_QUALITY_REVIEW_ATTEMPTS_PER_SCOPE = 2;

export function qualityReviewScopePolicy(page, requestedScope = "illustration") {
  const scope = requestedScope === "text" ? "text" : "illustration";
  const candidates = candidateMap(page);
  const candidateReady = candidates[scope]?.status === "ready";
  const successCount = Number(scope === "text"
    ? page?.qualityReviewTextRepairCount || 0
    : page?.qualityReviewRepairCount || 0);
  const attemptCountValue = Number(scope === "text"
    ? page?.qualityReviewTextRepairAttemptCount || 0
    : page?.qualityReviewRepairAttemptCount || 0);
  const completedAt = scope === "text"
    ? page?.qualityReviewTextRepairCompletedAt
    : page?.qualityReviewRepairCompletedAt;
  const failedAt = scope === "text"
    ? page?.qualityReviewTextRepairFailedAt
    : page?.qualityReviewRepairFailedAt;
  // Earlier deployments incremented the success counter before generation.
  // A page with a recorded failure, no completion and no candidate therefore
  // receives one bounded recovery instead of being mislabeled as "used".
  const legacyFailureOnly = successCount > 0 && failedAt && !completedAt && !candidateReady;
  const completedCount = candidateReady || completedAt
    ? Math.max(1, successCount)
    : legacyFailureOnly
      ? 0
      : successCount;
  const attemptCount = Math.max(
    attemptCountValue,
    failedAt ? 1 : 0,
    completedCount > 0 ? 1 : 0,
  );
  const canRequest = completedCount < 1 && attemptCount < MAX_QUALITY_REVIEW_ATTEMPTS_PER_SCOPE;
  return {
    scope,
    candidateReady,
    completedCount,
    attemptCount,
    canRequest,
    retryAvailable: Boolean(failedAt) && canRequest,
    technicalExhausted: completedCount < 1 && !candidateReady && attemptCount >= MAX_QUALITY_REVIEW_ATTEMPTS_PER_SCOPE,
  };
}

function unresolvedPages(draftPages = []) {
  return draftPages
    .filter((page) => page.page_type === "image" && page.qualityStatus === "review_required")
    .map((page) => ({
      pageNumber: Number(page.page_number),
      kind: page.qualityKind || "scene",
      issues: Array.isArray(page.qualityIssues) ? page.qualityIssues : [],
      repairCount: Number(page.qualityReviewRepairCount || 0),
      textRepairCount: Number(page.qualityReviewTextRepairCount || 0),
      repairAttemptCount: qualityReviewScopePolicy(page, "illustration").attemptCount,
      textRepairAttemptCount: qualityReviewScopePolicy(page, "text").attemptCount,
    }));
}

function candidateMap(page) {
  const candidates = { ...(page?.qualityReviewCandidates || {}) };
  if (page?.qualityReviewCandidate?.status === "ready") {
    const legacyScope = page.qualityReviewCandidate.scope || "illustration";
    if (!candidates[legacyScope]) candidates[legacyScope] = page.qualityReviewCandidate;
  }
  return candidates;
}

function resolvedPage(page, resolution, replacement = {}, selectedScope = "") {
  const resolvedAt = new Date().toISOString();
  const qualityReviewCandidates = Object.fromEntries(
    Object.entries(candidateMap(page)).map(([scope, candidate]) => [
      scope,
      {
        ...candidate,
        decision: resolution === "creator_repaired" && scope === selectedScope
          ? "selected"
          : "original_kept",
        decidedAt: resolvedAt,
      },
    ]),
  );
  const qualityReviewCandidate = page.qualityReviewCandidate
    ? {
        ...page.qualityReviewCandidate,
        decision: resolution === "creator_repaired"
          && (page.qualityReviewCandidate.scope || "illustration") === selectedScope
          ? "selected"
          : "original_kept",
        decidedAt: resolvedAt,
      }
    : undefined;
  return {
    ...page,
    ...replacement,
    qualityStatus: resolution === "creator_approved"
      ? "accepted_by_creator"
      : "accepted_after_creator_repair",
    qualityOriginalIssues: Array.isArray(page.qualityIssues) ? page.qualityIssues : [],
    qualityIssues: [],
    qualityKind: "",
    qualityResolution: {
      type: resolution,
      scope: selectedScope || "original",
      resolvedAt,
    },
    ...(Object.keys(qualityReviewCandidates).length ? { qualityReviewCandidates } : {}),
    ...(qualityReviewCandidate ? { qualityReviewCandidate } : {}),
  };
}

function candidatePage(project, pageNumber) {
  return project.previewResult?.draftPages?.find((page) => (
    Number(page.page_number) === Number(pageNumber)
    && page.page_type === "image"
    && page.qualityStatus === "review_required"
  )) || null;
}

export function qualityReviewCandidateSelection(page, requestedScope = "") {
  const candidates = candidateMap(page);
  const scope = requestedScope || page?.qualityReviewCandidate?.scope || "illustration";
  const candidate = candidates[scope];
  if (!candidate || candidate.status !== "ready") {
    const error = new Error("No quality-review alternative is ready for this page");
    error.statusCode = 409;
    throw error;
  }
  if (scope === "text") {
    return {
      scope,
      pageReplacement: {
        qualityReviewTextRepairCount: Math.max(1, Number(page.qualityReviewTextRepairCount || 0)),
        qualityReviewTextRepairCompletedAt: candidate.generatedAt || new Date().toISOString(),
      },
      pairedTextReplacement: {
        pageNumber: Number(candidate.textPageNumber),
        replacement: {
          text: candidate.text,
          previewUrl: candidate.previewUrl,
          storageKey: candidate.storageKey,
          qualityReviewModifiedAt: candidate.generatedAt || new Date().toISOString(),
        },
      },
    };
  }
  return {
    scope: "illustration",
    pageReplacement: {
      imageUrl: candidate.imageUrl,
      imageStorageKey: candidate.imageStorageKey,
      previewUrl: candidate.previewUrl,
      storageKey: candidate.storageKey,
      qualityReviewRepairCount: Math.max(1, Number(page.qualityReviewRepairCount || 0)),
      qualityReviewRepairCompletedAt: candidate.generatedAt || new Date().toISOString(),
    },
    pairedTextReplacement: null,
  };
}

export function qualityReviewCandidateReplacement(page) {
  return qualityReviewCandidateSelection(page, "illustration").pageReplacement;
}

export async function saveQualityReviewCandidate({
  projectId,
  identity,
  pageNumber,
  candidate,
  instruction = "",
  dependencies = {},
}) {
  const projects = dependencies.projects || projectStore;
  const project = await projects.getForCustomer(projectId, identity);
  if (!project) {
    const error = new Error("Project not found");
    error.statusCode = 404;
    throw error;
  }
  if (project.status !== "preview_quality_review" || !project.previewResult) {
    const error = new Error("This preview is not awaiting quality review");
    error.statusCode = 409;
    throw error;
  }
  const currentPage = candidatePage(project, pageNumber);
  if (!currentPage) {
    const error = new Error("Quality-review page not found");
    error.statusCode = 404;
    throw error;
  }
  const scope = candidate?.scope === "text" ? "text" : "illustration";
  const pairedTextPage = scope === "text"
    ? project.previewResult.draftPages.find((page) => (
        Number(page.page_number) === Number(candidate.textPageNumber)
        && ["text", "opening_text", "closing_text"].includes(page.page_type)
      ))
    : null;
  const candidateComplete = scope === "text"
    ? candidate?.text && candidate?.previewUrl && candidate?.storageKey && pairedTextPage
    : candidate?.previewUrl && candidate?.storageKey && candidate?.imageUrl && candidate?.imageStorageKey;
  if (!candidateComplete) {
    const error = new Error("Quality-review alternative is incomplete");
    error.statusCode = 500;
    throw error;
  }
  const generatedAt = new Date().toISOString();
  const qualityReviewCandidate = {
    status: "ready",
    scope,
    generatedAt,
    instruction: String(instruction || ""),
    original: scope === "text"
      ? {
          textPageNumber: Number(pairedTextPage.page_number),
          text: pairedTextPage.text,
          previewUrl: pairedTextPage.previewUrl,
          storageKey: pairedTextPage.storageKey,
        }
      : {
          imageUrl: currentPage.imageUrl,
          imageStorageKey: currentPage.imageStorageKey,
          previewUrl: currentPage.previewUrl,
          storageKey: currentPage.storageKey,
        },
    ...(scope === "text"
      ? {
          textPageNumber: Number(candidate.textPageNumber),
          text: String(candidate.text),
        }
      : {
          imageUrl: candidate.imageUrl,
          imageStorageKey: candidate.imageStorageKey,
        }),
    previewUrl: candidate.previewUrl,
    storageKey: candidate.storageKey,
  };
  const qualityReviewCandidates = {
    ...candidateMap(currentPage),
    [scope]: qualityReviewCandidate,
  };
  const draftPages = project.previewResult.draftPages.map((page) => (
    Number(page.page_number) === Number(pageNumber)
      ? {
          ...page,
          qualityReviewCandidate,
          qualityReviewCandidates,
          ...(scope === "text"
            ? {
                qualityReviewTextRepairCount: Math.max(1, Number(page.qualityReviewTextRepairCount || 0)),
                qualityReviewTextRepairCompletedAt: generatedAt,
                qualityReviewTextRepairError: "",
              }
            : {
                qualityReviewRepairCount: Math.max(1, Number(page.qualityReviewRepairCount || 0)),
                qualityReviewRepairCompletedAt: generatedAt,
                qualityReviewRepairError: "",
              }),
        }
      : page
  ));
  const updated = await projects.updateForCustomer(project.id, identity, {
    status: "preview_quality_review",
    previewResult: { ...project.previewResult, draftPages },
  });
  return {
    project: updated,
    candidate: qualityReviewCandidate,
    page: candidatePage(updated, pageNumber),
  };
}

export async function resolveQualityReviewPage({
  projectId,
  identity,
  pageNumber,
  resolution,
  replacement = {},
  pairedTextReplacement = null,
  selectedScope = "",
  dependencies = {},
}) {
  const projects = dependencies.projects || projectStore;
  const credits = dependencies.credits || creditStore;
  const runs = dependencies.runs || generationRunStore;
  const notify = dependencies.notify || notifyPreviewReady;
  const project = await projects.getForCustomer(projectId, identity);
  if (!project) {
    const error = new Error("Project not found");
    error.statusCode = 404;
    throw error;
  }
  if (project.status !== "preview_quality_review" || !project.previewResult) {
    const error = new Error("This preview is not awaiting quality review");
    error.statusCode = 409;
    throw error;
  }
  if (!["creator_approved", "creator_repaired"].includes(resolution)) {
    const error = new Error("Unsupported quality-review resolution");
    error.statusCode = 400;
    throw error;
  }

  const draftPages = [...(project.previewResult.draftPages || [])];
  const index = draftPages.findIndex((page) => Number(page.page_number) === Number(pageNumber));
  if (index < 0 || draftPages[index].page_type !== "image") {
    const error = new Error("Preview illustration not found");
    error.statusCode = 404;
    throw error;
  }
  if (draftPages[index].qualityStatus !== "review_required") {
    return {
      project,
      ready: project.status === "preview_ready",
      remainingPages: unresolvedPages(draftPages),
      duplicate: true,
    };
  }

  if (pairedTextReplacement) {
    const textIndex = draftPages.findIndex((page) => (
      Number(page.page_number) === Number(pairedTextReplacement.pageNumber)
      && ["text", "opening_text", "closing_text"].includes(page.page_type)
    ));
    if (textIndex < 0) {
      const error = new Error("Paired preview text not found");
      error.statusCode = 404;
      throw error;
    }
    draftPages[textIndex] = {
      ...draftPages[textIndex],
      ...pairedTextReplacement.replacement,
    };
  }
  const resolutionScope = selectedScope || (
    resolution === "creator_repaired"
      ? draftPages[index].qualityReviewCandidate?.scope || "illustration"
      : ""
  );
  draftPages[index] = resolvedPage(
    draftPages[index],
    resolution,
    replacement,
    resolutionScope,
  );
  const remainingPages = unresolvedPages(draftPages);
  const previewResult = { ...project.previewResult, draftPages };
  const checkpoint = generationCheckpoint(project) || {};
  const resolvedAt = new Date().toISOString();
  const qualityReview = remainingPages.length
    ? {
        ...(checkpoint.qualityReview || {}),
        status: "required",
        pages: remainingPages,
        updatedAt: resolvedAt,
      }
    : {
        ...(checkpoint.qualityReview || {}),
        status: "resolved",
        pages: [],
        resolvedAt,
      };

  if (remainingPages.length) {
    const continuitySnapshot = mergeGenerationCheckpoint(project.continuitySnapshot, {
      ...checkpoint,
      phase: "quality-review",
      qualityReview,
    });
    const updated = await projects.updateForCustomer(project.id, identity, {
      status: "preview_quality_review",
      previewResult,
      continuitySnapshot,
    });
    await runs.updateRun(project.generationJobId, {
      status: "repair_pending",
      currentStep: "draft:quality-review",
      metadata: {
        creditReservationId: checkpoint.creditReservationId || null,
        pageCount: Number(project.questionnaire?.page_count || draftPages.length),
        qualityReview,
      },
    }).catch(() => null);
    return { project: updated, ready: false, remainingPages };
  }

  if (checkpoint.creditReservationId) {
    await credits.capturePreview(checkpoint.creditReservationId);
  }
  const continuitySnapshot = mergeGenerationCheckpoint(project.continuitySnapshot, {
    ...checkpoint,
    phase: "done",
    retryPolicyVersion: PREVIEW_RETRY_POLICY_VERSION,
    retryAvailable: false,
    retryExhausted: false,
    completedAt: resolvedAt,
    qualityReview,
  });
  let updated = await projects.updateForCustomer(project.id, identity, {
    status: "preview_ready",
    previewResult,
    continuitySnapshot,
  });
  await runs.updateRun(project.generationJobId, {
    status: "completed",
    currentStep: "draft:done",
    completedAt: resolvedAt,
    leaseOwner: "",
    leaseExpiresAt: null,
    errorCode: "",
    errorMessage: "",
    metadata: {
      creditReservationId: checkpoint.creditReservationId || null,
      pageCount: Number(project.questionnaire?.page_count || draftPages.length),
      qualityReview,
    },
  }).catch(() => null);

  if (updated?.continuitySnapshot?.previewNotification?.emailRequested) {
    try {
      await notify({ project: updated, identity });
      updated = await projects.updateForCustomer(project.id, identity, {
        continuitySnapshot: {
          ...updated.continuitySnapshot,
          previewNotification: {
            ...updated.continuitySnapshot.previewNotification,
            sentAt: resolvedAt,
          },
        },
      }) || updated;
    } catch (error) {
      console.warn("[quality-review] ready notification failed", JSON.stringify({
        projectId: project.id,
        error: String(error?.message || error),
      }));
    }
  }

  return { project: updated, ready: true, remainingPages: [] };
}

export function qualityReviewPageNumbers(project) {
  return unresolvedPages(project?.previewResult?.draftPages || []).map((page) => page.pageNumber);
}

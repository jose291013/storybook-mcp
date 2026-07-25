import { creditStore } from "./creditStore.js";
import { generationRunStore } from "./generationRunStore.js";
import {
  generationCheckpoint,
  mergeGenerationCheckpoint,
  PREVIEW_RETRY_POLICY_VERSION,
} from "./previewGenerationCheckpoint.js";
import { notifyPreviewReady } from "./previewNotification.js";
import { projectStore } from "./projectStore.js";

function unresolvedPages(draftPages = []) {
  return draftPages
    .filter((page) => page.page_type === "image" && page.qualityStatus === "review_required")
    .map((page) => ({
      pageNumber: Number(page.page_number),
      kind: page.qualityKind || "scene",
      issues: Array.isArray(page.qualityIssues) ? page.qualityIssues : [],
      repairCount: Number(page.qualityReviewRepairCount || 0),
    }));
}

function resolvedPage(page, resolution, replacement = {}) {
  const resolvedAt = new Date().toISOString();
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
      resolvedAt,
    },
  };
}

export async function resolveQualityReviewPage({
  projectId,
  identity,
  pageNumber,
  resolution,
  replacement = {},
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

  draftPages[index] = resolvedPage(draftPages[index], resolution, replacement);
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

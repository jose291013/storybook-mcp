import { creditStore } from "./creditStore.js";
import { generationRunStore } from "./generationRunStore.js";
import {
  generationCheckpoint,
  mergeGenerationCheckpoint,
  PREVIEW_RETRY_POLICY_VERSION,
} from "./previewGenerationCheckpoint.js";
import { notifyPreviewMilestone } from "./previewNotification.js";
import { projectStore } from "./projectStore.js";

function intervalMs() {
  const configured = Number.parseInt(process.env.GENERATION_RECOVERY_INTERVAL_MS || "60000", 10) || 60000;
  return Math.max(30000, Math.min(10 * 60 * 1000, configured));
}

function batchSize() {
  const configured = Number.parseInt(process.env.GENERATION_RECOVERY_BATCH_SIZE || "10", 10) || 10;
  return Math.max(1, Math.min(50, configured));
}

export async function recoverAbandonedGenerationRuns(dependencies = {}) {
  const runs = dependencies.runs || generationRunStore;
  const projects = dependencies.projects || projectStore;
  const credits = dependencies.credits || creditStore;
  const notify = dependencies.notify || notifyPreviewMilestone;
  const abandoned = await runs.claimAbandonedRuns({ limit: dependencies.limit || batchSize() });
  const recovered = [];

  for (const run of abandoned) {
    const project = await projects.get(run.projectId);
    if (!project || project.status !== "preview_generating" || project.generationJobId !== run.id) {
      continue;
    }
    const checkpoint = generationCheckpoint(project) || {};
    if (checkpoint.creditReservationId) {
      await credits.releasePreview(checkpoint.creditReservationId).catch(() => null);
    }
    const continuitySnapshot = mergeGenerationCheckpoint(project.continuitySnapshot, {
      ...checkpoint,
      retryPolicyVersion: PREVIEW_RETRY_POLICY_VERSION,
      retryAvailable: true,
      retryExhausted: false,
      failureReason: "preview_interrupted",
      failedAt: new Date().toISOString(),
    });
    const updated = await projects.update(project.id, {
      status: "preview_failed",
      generationJobId: run.id,
      continuitySnapshot,
    });
    recovered.push(updated);

    const notification = updated?.continuitySnapshot?.previewNotification;
    if (notification?.emailRequested === true && typeof projects.getCustomerIdentity === "function") {
      const identity = await projects.getCustomerIdentity(updated.customerId);
      if (identity) {
        await notify({
          project: updated,
          identity,
          event: "generation_failed",
          eventId: `${run.id}:lease_expired`,
          retryAvailable: true,
        }).catch((error) => console.warn("[generation-recovery] notification failed", JSON.stringify({
          runId: run.id,
          projectId: run.projectId,
          error: String(error?.message || error),
        })));
      }
    }
    console.warn("[generation-recovery] abandoned preview recovered", JSON.stringify({
      runId: run.id,
      projectId: run.projectId,
      checkpointPhase: checkpoint.phase || null,
    }));
  }

  return recovered;
}

let recoveryTimer = null;
let recoveryRunning = false;

export function startGenerationRecoveryWorker() {
  if (process.env.GENERATION_RECOVERY_ENABLED === "false" || recoveryTimer) return null;
  const cycle = async () => {
    if (recoveryRunning) return;
    recoveryRunning = true;
    try {
      await recoverAbandonedGenerationRuns();
    } catch (error) {
      console.error("[generation-recovery] cycle failed", JSON.stringify({
        error: String(error?.message || error),
      }));
    } finally {
      recoveryRunning = false;
    }
  };
  recoveryTimer = setInterval(cycle, intervalMs());
  recoveryTimer.unref?.();
  setTimeout(cycle, 1000).unref?.();
  return recoveryTimer;
}

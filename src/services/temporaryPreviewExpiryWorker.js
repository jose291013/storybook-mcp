import { creditStore } from "./creditStore.js";
import { cleanupExpiredPreviewAssets } from "./projectDeletion.js";
import { projectStore } from "./projectStore.js";
import { notifyPreviewMilestone } from "./previewNotification.js";
import {
  markPreviewAssetsExpired,
  markPreviewExpiryWarningSent,
  PREVIEW_EXPIRY_WARNING_HOURS,
  previewAccessState,
} from "./temporaryPreviewAccess.js";

function configuration() {
  return {
    intervalMs: Math.max(60000, Number.parseInt(process.env.PREVIEW_EXPIRY_WORKER_INTERVAL_MS || "300000", 10) || 300000),
  };
}

export async function runTemporaryPreviewExpiryCycle(dependencies = {}) {
  const projects = dependencies.projects || projectStore;
  const credits = dependencies.credits || creditStore;
  const cleanup = dependencies.cleanup || cleanupExpiredPreviewAssets;
  const notify = dependencies.notify || notifyPreviewMilestone;
  const logger = dependencies.logger || console;
  const now = dependencies.now ? new Date(dependencies.now()) : new Date();
  const candidates = await projects.listTemporaryPreviewAccessCandidates();
  const result = { checked: candidates.length, warned: 0, expired: 0, failed: 0 };
  for (const project of candidates) {
    const access = previewAccessState(project, now);
    const identity = await projects.getCustomerIdentity(project.customerId);
    if (!identity) continue;
    if (!access.expired) {
      const warningAt = Date.parse(access.expiresAt) - PREVIEW_EXPIRY_WARNING_HOURS * 3600000;
      if (now.getTime() >= warningAt && !project.productConfiguration?.preview_expiry_warning_sent_at) {
        try {
          await notify({ project, identity, event: "preview_expiring", eventId: access.expiresAt });
          await projects.update(project.id, { productConfiguration: markPreviewExpiryWarningSent(project, now) });
          result.warned += 1;
        } catch (error) {
          result.failed += 1;
          logger.warn?.("[preview-expiry] warning failed", { projectId: project.id, error: String(error?.message || error) });
        }
      }
      continue;
    }
    try {
      if (await credits.hasActiveCheckoutReservation(identity, { projectId: project.id })) continue;
      await cleanup(project, dependencies);
      await credits.expireProjectRebate(identity, { projectId: project.id });
      await projects.update(project.id, {
        status: "preview_expired",
        productConfiguration: markPreviewAssetsExpired(project, now),
        previewResult: null,
        finalBlueprint: null,
        generationJobId: null,
      });
      result.expired += 1;
      logger.info?.("[preview-expiry] temporary preview deleted", { projectId: project.id });
    } catch (error) {
      result.failed += 1;
      logger.error?.("[preview-expiry] cleanup failed", { projectId: project.id, error: String(error?.message || error) });
    }
  }
  return result;
}

export function startTemporaryPreviewExpiryWorker(dependencies = {}) {
  if (String(process.env.PREVIEW_EXPIRY_WORKER_ENABLED || "true").toLowerCase() === "false") {
    return { enabled: false, runNow: async () => ({ checked: 0, warned: 0, expired: 0, failed: 0 }), stop() {} };
  }
  const { intervalMs } = { ...configuration(), ...(dependencies.configuration || {}) };
  let running = false;
  const runNow = async () => {
    if (running) return { skipped: true };
    running = true;
    try { return await runTemporaryPreviewExpiryCycle(dependencies); }
    finally { running = false; }
  };
  const initial = setTimeout(runNow, Math.min(15000, intervalMs));
  const interval = setInterval(runNow, intervalMs);
  initial.unref?.(); interval.unref?.();
  return { enabled: true, runNow, stop() { clearTimeout(initial); clearInterval(interval); } };
}

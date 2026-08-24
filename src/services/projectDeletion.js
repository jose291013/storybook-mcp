import fs from "fs/promises";
import path from "path";
import { commerceOrderStore } from "./commerceOrderStore.js";
import { creditStore } from "./creditStore.js";
import { getDeliveryStorage } from "./deliveryStorage.js";
import { deleteJob, getJob, updateJob } from "./jobStore.js";
import { normalizePhotoRefs, projectStore } from "./projectStore.js";
import { seriesStore } from "./seriesStore.js";

const SAFE_FILENAME = /^[A-Za-z0-9._-]+$/;
const SAFE_REFERENCE_KEY = /^reference-photos\/[A-Za-z0-9._-]+$/;

export class ProjectDeletionError extends Error {
  constructor(message, { code, status = 409 } = {}) {
    super(message);
    this.name = "ProjectDeletionError";
    this.code = code || "project_deletion_blocked";
    this.status = status;
  }
}

function staleAfterMs() {
  const minutes = Number.parseInt(process.env.PREVIEW_STALE_MINUTES || "15", 10) || 15;
  return Math.max(5, Math.min(60, minutes)) * 60000;
}

function activeJob(job, timestamp = Date.now()) {
  if (!job || !["queued", "running"].includes(job.status)) return false;
  const updatedAt = Date.parse(job.updatedAt || job.createdAt || "");
  return Number.isFinite(updatedAt) && timestamp - updatedAt < staleAfterMs();
}

function outputFilenames(value, found = new Set()) {
  if (Array.isArray(value)) value.forEach((item) => outputFilenames(item, found));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => outputFilenames(item, found));
  else if (typeof value === "string") {
    try {
      const pathname = new URL(value, "http://localhost").pathname;
      if (pathname.startsWith("/outputs/")) {
        const filename = decodeURIComponent(path.posix.basename(pathname));
        if (SAFE_FILENAME.test(filename)) found.add(filename);
      }
    } catch { /* Ignore strings that are not asset URLs. */ }
  }
  return [...found];
}

function safeChild(root, filename) {
  if (!SAFE_FILENAME.test(String(filename || ""))) throw new Error("Invalid local project asset filename");
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, filename);
  if (!target.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error("Invalid local project asset path");
  return target;
}

export async function cleanupExpiredPreviewAssets(project, dependencies = {}) {
  const storage = dependencies.storage || getDeliveryStorage();
  const outputsDir = dependencies.outputsDir || path.resolve("data/outputs");
  const jobs = dependencies.jobs || { delete: deleteJob };
  await storage.deletePrefix(`ebooks/previews/${project.id}/`);
  for (const filename of outputFilenames(project.previewResult)) {
    await fs.rm(safeChild(outputsDir, filename), { force: true });
  }
  if (project.generationJobId) jobs.delete(project.generationJobId);
}

async function cleanupAssets(manifest, { storage, outputsDir, uploadsDir, jobs }) {
  await storage.deletePrefix(manifest.previewPrefix);
  for (const key of manifest.referenceStorageKeys || []) await storage.delete(key);
  for (const filename of manifest.outputFilenames || []) await fs.rm(safeChild(outputsDir, filename), { force: true });
  for (const photoId of manifest.legacyPhotoIds || []) await fs.rm(safeChild(uploadsDir, photoId), { force: true });
  if (manifest.jobId) jobs.delete(manifest.jobId);
}

async function cleanupAssetsWithRetries(manifest, dependencies) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try { await cleanupAssets(manifest, dependencies); return; }
    catch (error) { lastError = error; }
  }
  throw lastError;
}

function cleanupWorkerConfiguration() {
  const intervalMs = Math.max(30000, Number.parseInt(process.env.PROJECT_DELETION_CLEANUP_INTERVAL_MS || "60000", 10) || 60000);
  const maxAttempts = Math.max(2, Math.min(20, Number.parseInt(process.env.PROJECT_DELETION_CLEANUP_MAX_ATTEMPTS || "8", 10) || 8));
  const batchSize = Math.max(1, Math.min(50, Number.parseInt(process.env.PROJECT_DELETION_CLEANUP_BATCH_SIZE || "10", 10) || 10));
  return { intervalMs, maxAttempts, batchSize };
}

function cleanupRetryDelayMs(attempt) {
  return Math.min(3600000, 60000 * (2 ** Math.max(0, Math.min(6, Number(attempt || 0)))));
}

function cleanupErrorMessage(error) {
  return String(error?.message || error || "Unknown private cleanup error").slice(0, 500);
}

export async function runPendingProjectDeletionCleanup(dependencies = {}) {
  const projects = dependencies.projects || projectStore;
  const storage = dependencies.storage || getDeliveryStorage();
  const jobs = dependencies.jobs || { delete: deleteJob };
  const outputsDir = dependencies.outputsDir || path.resolve("data/outputs");
  const uploadsDir = dependencies.uploadsDir || path.resolve("data/uploads");
  const logger = dependencies.logger || console;
  const configuration = { ...cleanupWorkerConfiguration(), ...(dependencies.configuration || {}) };
  const deletions = await projects.claimPendingDeletions({
    limit: configuration.batchSize,
    leaseMs: Math.max(120000, configuration.intervalMs * 2),
  });
  const result = { claimed: deletions.length, completed: 0, pending: 0, manualReview: 0 };
  for (const deletion of deletions) {
    try {
      await cleanupAssetsWithRetries(deletion.assetManifest || {}, { storage, outputsDir, uploadsDir, jobs });
      await projects.recordDeletionCleanup(deletion.projectId);
      result.completed += 1;
      logger.info?.("[project-deletion] cleanup completed", {
        projectId: deletion.projectId,
        attempt: Number(deletion.cleanupAttempts || 0) + 1,
      });
    } catch (error) {
      const message = cleanupErrorMessage(error);
      const updated = await projects.recordDeletionCleanup(deletion.projectId, {
        error: message,
        maxAttempts: configuration.maxAttempts,
        retryDelayMs: cleanupRetryDelayMs(Number(deletion.cleanupAttempts || 0)),
      });
      if (updated?.status === "manual_review") {
        result.manualReview += 1;
        logger.error?.("[project-deletion] manual review required", {
          projectId: deletion.projectId,
          attempts: updated.cleanupAttempts,
          error: message,
        });
      } else {
        result.pending += 1;
        logger.warn?.("[project-deletion] cleanup retry scheduled", {
          projectId: deletion.projectId,
          attempt: updated?.cleanupAttempts,
          nextRetryAt: updated?.nextRetryAt,
          error: message,
        });
      }
    }
  }
  return result;
}

export function startProjectDeletionCleanupWorker(dependencies = {}) {
  if (String(process.env.PROJECT_DELETION_CLEANUP_ENABLED || "true").toLowerCase() === "false") {
    return { enabled: false, stop() {}, runNow: async () => ({ claimed: 0, completed: 0, pending: 0, manualReview: 0 }) };
  }
  const configuration = { ...cleanupWorkerConfiguration(), ...(dependencies.configuration || {}) };
  let running = false;
  const runNow = async () => {
    if (running) return { skipped: true };
    running = true;
    try { return await runPendingProjectDeletionCleanup({ ...dependencies, configuration }); }
    catch (error) {
      (dependencies.logger || console).error?.("[project-deletion] cleanup worker failed", { error: cleanupErrorMessage(error) });
      return { failed: true };
    } finally { running = false; }
  };
  const initial = setTimeout(runNow, Math.min(10000, configuration.intervalMs));
  const interval = setInterval(runNow, configuration.intervalMs);
  initial.unref?.();
  interval.unref?.();
  return {
    enabled: true,
    runNow,
    stop() { clearTimeout(initial); clearInterval(interval); },
  };
}

function deletionBlocked(result) {
  if (result?.blockedReason === "purchased") return new ProjectDeletionError("Purchased books cannot be deleted", { code: "purchased_project" });
  if (result?.blockedReason === "series_canon") return new ProjectDeletionError("A creation used in series continuity cannot be deleted", { code: "series_canon" });
  return null;
}

export async function deleteCustomerCreation(projectId, identity, dependencies = {}) {
  const projects = dependencies.projects || projectStore;
  const orders = dependencies.orders || commerceOrderStore;
  const series = dependencies.series || seriesStore;
  const credits = dependencies.credits || creditStore;
  const jobs = dependencies.jobs || { get: getJob, fail: (id) => updateJob(id, { status: "failed", step: "project:deleted", error: "Creation deleted by its owner" }), delete: deleteJob };
  const logger = dependencies.logger || console;
  const id = String(projectId || "");
  if (!id) throw new ProjectDeletionError("Project id is required", { code: "invalid_project", status: 400 });

  const project = await projects.getForCustomer(id, identity);
  let prepared;
  if (project) {
    const job = project.generationJobId ? jobs.get(project.generationJobId) : null;
    if (activeJob(job)) {
      throw new ProjectDeletionError("Wait for the active generation step to finish before deleting this creation", { code: "generation_active" });
    }
    if (job && ["queued", "running"].includes(job.status)) jobs.fail(job.id);

    const [hasPaidPurchase, hasOrderHistory, hasCanon] = await Promise.all([
      orders.hasPaidBookPurchase({ projectId: project.id, customerId: project.customerId }),
      orders.hasAnyProjectOrder({ projectId: project.id, customerId: project.customerId }),
      series.hasFactsForProject(project.id),
    ]);
    if (hasPaidPurchase) throw deletionBlocked({ blockedReason: "purchased" });
    if (hasCanon) throw deletionBlocked({ blockedReason: "series_canon" });

    const photoRefs = normalizePhotoRefs(project.photoRefs);
    const candidateReferenceKeys = [...new Set(photoRefs.map((photo) => photo?.storageKey).filter((key) => SAFE_REFERENCE_KEY.test(String(key || ""))))];
    const sharedKeys = new Set(await projects.photoStorageKeysReferencedElsewhere(project.id, candidateReferenceKeys));
    const assetManifest = {
      previewPrefix: `ebooks/previews/${project.id}/`,
      referenceStorageKeys: candidateReferenceKeys.filter((key) => !sharedKeys.has(key)),
      outputFilenames: outputFilenames(project.previewResult),
      legacyPhotoIds: [...new Set(photoRefs.filter((photo) => !photo?.storageKey).map((photo) => String(photo?.id || "")).filter((value) => SAFE_FILENAME.test(value)))],
      jobId: project.generationJobId || "",
    };
    await credits.releasePreviewForProject(identity, { projectId: project.id });
    await credits.deleteProjectEntitlements(identity, { projectId: project.id });
    prepared = await projects.prepareDeletion(project.id, identity, assetManifest, {
      preserveProjectRecord: hasOrderHistory,
    });
  } else {
    prepared = await projects.prepareDeletion(id, identity, {});
  }

  const blocked = deletionBlocked(prepared);
  if (blocked) throw blocked;
  if (!prepared) return { deleted: true, alreadyDeleted: true, projectId: id };
  const cleanupPending = prepared.deletion?.status !== "completed";
  if (cleanupPending) {
    logger.info?.("[project-deletion] cleanup queued", {
      projectId: id,
      nextRetryAt: prepared.deletion?.nextRetryAt || null,
    });
  }
  return {
    deleted: true,
    alreadyDeleted: Boolean(prepared.alreadyDeleted),
    cleanupPending,
    projectId: id,
  };
}

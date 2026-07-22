import fs from "fs/promises";
import path from "path";
import { commerceOrderStore } from "./commerceOrderStore.js";
import { creditStore } from "./creditStore.js";
import { getDeliveryStorage } from "./deliveryStorage.js";
import { deleteJob, getJob, updateJob } from "./jobStore.js";
import { projectStore } from "./projectStore.js";
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

function deletionBlocked(result) {
  if (result?.blockedReason === "purchased") return new ProjectDeletionError("Purchased books cannot be deleted", { code: "purchased_project" });
  if (result?.blockedReason === "order_exists") return new ProjectDeletionError("A creation linked to an order cannot be deleted", { code: "order_exists" });
  if (result?.blockedReason === "series_canon") return new ProjectDeletionError("A creation used in series continuity cannot be deleted", { code: "series_canon" });
  return null;
}

export async function deleteCustomerCreation(projectId, identity, dependencies = {}) {
  const projects = dependencies.projects || projectStore;
  const orders = dependencies.orders || commerceOrderStore;
  const series = dependencies.series || seriesStore;
  const credits = dependencies.credits || creditStore;
  const storage = dependencies.storage || getDeliveryStorage();
  const jobs = dependencies.jobs || { get: getJob, fail: (id) => updateJob(id, { status: "failed", step: "project:deleted", error: "Creation deleted by its owner" }), delete: deleteJob };
  const outputsDir = dependencies.outputsDir || path.resolve("data/outputs");
  const uploadsDir = dependencies.uploadsDir || path.resolve("data/uploads");
  const id = String(projectId || "");
  if (!id) throw new ProjectDeletionError("Project id is required", { code: "invalid_project", status: 400 });

  const project = await projects.getForCustomer(id, identity);
  let prepared;
  if (project) {
    if (project.status === "purchased") throw deletionBlocked({ blockedReason: "purchased" });
    const job = project.generationJobId ? jobs.get(project.generationJobId) : null;
    if (activeJob(job)) {
      throw new ProjectDeletionError("Wait for the active generation step to finish before deleting this creation", { code: "generation_active" });
    }
    if (job && ["queued", "running"].includes(job.status)) jobs.fail(job.id);

    const [hasOrder, hasCanon] = await Promise.all([
      orders.hasAnyProjectOrder({ projectId: project.id, customerId: project.customerId }),
      series.hasFactsForProject(project.id),
    ]);
    if (hasOrder) throw deletionBlocked({ blockedReason: "order_exists" });
    if (hasCanon) throw deletionBlocked({ blockedReason: "series_canon" });

    const candidateReferenceKeys = [...new Set((project.photoRefs || []).map((photo) => photo?.storageKey).filter((key) => SAFE_REFERENCE_KEY.test(String(key || ""))))];
    const sharedKeys = new Set(await projects.photoStorageKeysReferencedElsewhere(project.id, candidateReferenceKeys));
    const assetManifest = {
      previewPrefix: `ebooks/previews/${project.id}/`,
      referenceStorageKeys: candidateReferenceKeys.filter((key) => !sharedKeys.has(key)),
      outputFilenames: outputFilenames(project.previewResult),
      legacyPhotoIds: [...new Set((project.photoRefs || []).filter((photo) => !photo?.storageKey).map((photo) => String(photo?.id || "")).filter((value) => SAFE_FILENAME.test(value)))],
      jobId: project.generationJobId || "",
    };
    await credits.releasePreviewForProject(identity, { projectId: project.id });
    prepared = await projects.prepareDeletion(project.id, identity, assetManifest);
  } else {
    prepared = await projects.prepareDeletion(id, identity, {});
  }

  const blocked = deletionBlocked(prepared);
  if (blocked) throw blocked;
  if (!prepared) return { deleted: true, alreadyDeleted: true, projectId: id };
  if (prepared.deletion?.status === "completed") return { deleted: true, alreadyDeleted: true, projectId: id };

  try {
    await credits.deleteProjectEntitlements(identity, { projectId: id });
    await cleanupAssetsWithRetries(prepared.deletion.assetManifest || {}, { storage, outputsDir, uploadsDir, jobs });
    await projects.completeDeletion(id, identity);
  } catch (error) {
    await projects.completeDeletion(id, identity, { error: String(error?.message || error) }).catch(() => null);
    throw new ProjectDeletionError("The creation was removed from the library, but private asset cleanup must be retried", {
      code: "cleanup_pending", status: 503,
    });
  }
  return { deleted: true, alreadyDeleted: Boolean(prepared.alreadyDeleted), projectId: id };
}

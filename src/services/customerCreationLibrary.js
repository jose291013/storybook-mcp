import { projectStore } from "./projectStore.js";
import {
  technicalPreviewRetryAvailable,
  technicalPreviewRetryExhausted,
} from "./previewGenerationCheckpoint.js";

const LIBRARY_STATUSES = new Set([
  "preview_generating",
  "preview_failed",
  "preview_ready",
  "preview_repairing",
  "purchased",
]);

function pageCount(project) {
  return Number(
    project?.questionnaire?.page_count
    || project?.productConfiguration?.page_count
    || project?.productConfiguration?.pageCount
    || project?.finalBlueprint?.format?.interior_pages
    || 0
  );
}

export function customerCreationSummary(project) {
  if (!project || !LIBRARY_STATUSES.has(project.status)) return null;
  return {
    id: String(project.id),
    title: String(project.finalBlueprint?.cover?.title || project.title || project.questionnaire?.hero_name || "Calitiki"),
    status: String(project.status),
    locale: String(project.locale || "FR"),
    pageCount: pageCount(project),
    updatedAt: project.updatedAt || null,
    previewReady: Boolean(project.previewResult && ["preview_ready", "preview_repairing", "purchased"].includes(project.status)),
    technicalRetryAvailable: technicalPreviewRetryAvailable(project),
    technicalRetryExhausted: technicalPreviewRetryExhausted(project),
  };
}

export async function listCustomerCreations(identity, store = projectStore) {
  const projects = await store.listForCustomer(identity);
  return projects.map(customerCreationSummary).filter(Boolean);
}


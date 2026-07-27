import { projectStore } from "./projectStore.js";
import { commerceOrderStore } from "./commerceOrderStore.js";
import {
  technicalPreviewRetryAvailable,
  technicalPreviewRetryExhausted,
} from "./previewGenerationCheckpoint.js";

const LIBRARY_STATUSES = new Set([
  "scenario_needs_clarification",
  "scenario_review",
  "preview_generating",
  "preview_quality_review",
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

export function customerCreationSummary(project, { paidPurchase = project?.status === "purchased" } = {}) {
  if (!project || !LIBRARY_STATUSES.has(project.status)) return null;
  return {
    id: String(project.id),
    title: String(project.finalBlueprint?.cover?.title || project.continuitySnapshot?.storyScenario?.title || project.title || project.questionnaire?.hero_name || "Calitiki"),
    status: String(project.status),
    locale: String(project.locale || "FR"),
    pageCount: pageCount(project),
    updatedAt: project.updatedAt || null,
    previewReady: Boolean(project.previewResult && ["preview_quality_review", "preview_ready", "preview_repairing", "purchased"].includes(project.status)),
    qualityReviewRequired: project.status === "preview_quality_review",
    deletable: !paidPurchase,
    technicalRetryAvailable: technicalPreviewRetryAvailable(project),
    technicalRetryExhausted: technicalPreviewRetryExhausted(project),
  };
}

export async function listCustomerCreations(identity, store = projectStore, orders = commerceOrderStore) {
  const projects = await store.listForCustomer(identity);
  return (await Promise.all(projects.map(async (project) => {
    if (project.status !== "purchased") return customerCreationSummary(project, { paidPurchase: false });
    try {
      const paidPurchase = await orders.hasPaidBookPurchase({
        projectId: project.id,
        customerId: project.customerId,
      });
      return customerCreationSummary(project, { paidPurchase });
    } catch {
      // A commerce lookup failure must never make a genuinely purchased book
      // deletable. Keep the historical status as the conservative fallback.
      return customerCreationSummary(project, { paidPurchase: true });
    }
  }))).filter(Boolean);
}


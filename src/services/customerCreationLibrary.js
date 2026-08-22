import { projectStore } from "./projectStore.js";
import { commerceOrderStore } from "./commerceOrderStore.js";
import {
  technicalPreviewRetryAvailable,
  technicalPreviewRetryExhausted,
} from "./previewGenerationCheckpoint.js";
import { publicPreviewFailureReason } from "./providerBillingError.js";

const LIBRARY_STATUSES = new Set([
  "scenario_generating",
  "scenario_generation_failed",
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

export function customerCreationSummary(project, {
  paidPurchase = project?.status === "purchased",
  latestNarration = null,
  activeNarration = null,
} = {}) {
  if (!project || !LIBRARY_STATUSES.has(project.status)) return null;
  const narrationStatus = latestNarration?.paymentStatus === "paid"
    ? String(latestNarration.fulfillmentStatus || "")
    : "";
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
    previewFailureReason: publicPreviewFailureReason(project),
    narrationStatus,
    narrationReady: activeNarration?.paymentStatus === "paid"
      && activeNarration?.fulfillmentStatus === "ready",
  };
}

export async function listCustomerCreations(identity, store = projectStore, orders = commerceOrderStore, { paidProjectIds = null } = {}) {
  const projects = await store.listForCustomer(identity);
  const authoritativePaid = Array.isArray(paidProjectIds) ? new Set(paidProjectIds.map(String)) : null;
  return (await Promise.all(projects.map(async (project) => {
    let paidPurchase = authoritativePaid
      ? authoritativePaid.has(project.id)
      : project.status === "purchased";
    try {
      if (!authoritativePaid && project.status === "purchased") {
        paidPurchase = await orders.hasPaidBookPurchase({
          projectId: project.id,
          customerId: project.customerId,
        });
      }
      const canReadNarrations = paidPurchase
        && typeof orders.findLatestNarration === "function"
        && typeof orders.findReadyNarration === "function";
      const [latestNarration, activeNarration] = canReadNarrations
        ? await Promise.all([
          orders.findLatestNarration({ projectId: project.id, customerId: project.customerId }),
          orders.findReadyNarration({ projectId: project.id, customerId: project.customerId }),
        ])
        : [null, null];
      return customerCreationSummary(project, { paidPurchase, latestNarration, activeNarration });
    } catch {
      // A commerce lookup failure must never make a genuinely purchased book
      // deletable. Keep the historical status as the conservative fallback.
      return customerCreationSummary(project, { paidPurchase });
    }
  }))).filter(Boolean);
}


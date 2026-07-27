import { commerceOrderStore } from "./commerceOrderStore.js";
import { projectStore } from "./projectStore.js";

export async function reconcileProjectAfterBookOrderRevocation(
  { projectId },
  { projects = projectStore, orders = commerceOrderStore } = {}
) {
  const project = await projects.get(String(projectId || ""));
  if (!project || project.status !== "purchased") {
    return { reconciled: false, reason: project ? "status_unchanged" : "project_not_found" };
  }
  const paidPurchase = await orders.hasPaidBookPurchase({
    projectId: project.id,
    customerId: project.customerId,
  });
  if (paidPurchase) return { reconciled: false, reason: "another_paid_order" };
  const restored = await projects.update(project.id, { status: project.previewResult ? "preview_ready" : "preview_failed" });
  return { reconciled: Boolean(restored), reason: restored ? "purchase_revoked" : "project_not_found", project: restored };
}

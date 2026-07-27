import { commerceOrderStore } from "./commerceOrderStore.js";
import { projectStore } from "./projectStore.js";

export function normalizePaidProjectIds(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)))]
    .sort();
}

export async function reconcileCustomerPaidBookPurchases(
  identity,
  paidProjectIds,
  { projects = projectStore, orders = commerceOrderStore } = {}
) {
  const authoritativeIds = normalizePaidProjectIds(paidProjectIds);
  const paid = new Set(authoritativeIds);
  const customer = await projects.ensureCustomer(identity);
  const customerProjects = await projects.listForCustomer(identity);
  const commerce = await orders.reconcilePaidBookPurchases({
    customerId: customer.id,
    paidProjectIds: authoritativeIds,
  });
  let restoredCount = 0;
  for (const project of customerProjects) {
    if (project.status !== "purchased" || paid.has(project.id)) continue;
    const restored = await projects.update(project.id, {
      status: project.previewResult ? "preview_ready" : "preview_failed",
    });
    if (restored) restoredCount += 1;
  }
  return { paidProjectIds: authoritativeIds, restoredCount, revokedCount: Number(commerce?.revokedCount || 0) };
}

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

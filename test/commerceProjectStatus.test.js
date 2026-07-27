import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { JsonCommerceOrderStore } from "../src/services/commerceOrderStore.js";
import {
  normalizePaidProjectIds,
  reconcileCustomerPaidBookPurchases,
  reconcileProjectAfterBookOrderRevocation,
} from "../src/services/commerceProjectStatus.js";
import { JsonProjectStore } from "../src/services/projectStore.js";

test("a cancelled last book order restores the preview while another paid order keeps it purchased", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "storybook-commerce-reconcile-"));
  try {
    const projects = new JsonProjectStore(path.join(directory, "projects.json"));
    const orders = new JsonCommerceOrderStore(path.join(directory, "orders.json"));
    const customer = await projects.ensureCustomer({ wooCustomerId: "42", email: "parent@example.com" });
    const project = await projects.create({
      customerId: customer.id,
      status: "purchased",
      previewResult: { coverPreviewUrl: "/api/assets/cover" },
    });
    const baseOrder = {
      projectId: project.id,
      customerId: customer.id,
      wooCustomerId: "42",
      productType: "ebook",
      pageCount: 24,
      orderTotalCents: 669,
    };
    await orders.recordPaid({ ...baseOrder, orderId: "1001" });
    await orders.recordPaid({ ...baseOrder, orderId: "1002" });
    await orders.recordStatus({ orderId: "1001", projectId: project.id, productType: "ebook", wooCustomerId: "42", status: "refunded" });

    const retained = await reconcileProjectAfterBookOrderRevocation({ projectId: project.id }, { projects, orders });
    assert.equal(retained.reconciled, false);
    assert.equal(retained.reason, "another_paid_order");
    assert.equal((await projects.get(project.id)).status, "purchased");

    await orders.recordStatus({ orderId: "1002", projectId: project.id, productType: "ebook", wooCustomerId: "42", status: "cancelled" });
    const restored = await reconcileProjectAfterBookOrderRevocation({ projectId: project.id }, { projects, orders });
    assert.equal(restored.reconciled, true);
    assert.equal(restored.reason, "purchase_revoked");
    assert.equal((await projects.get(project.id)).status, "preview_ready");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("a signed WooCommerce purchase snapshot revokes stale legacy payment state without touching an active purchase", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "storybook-commerce-snapshot-"));
  try {
    const projects = new JsonProjectStore(path.join(directory, "projects.json"));
    const orders = new JsonCommerceOrderStore(path.join(directory, "orders.json"));
    const identity = { wooCustomerId: "42", email: "parent@example.com" };
    const customer = await projects.ensureCustomer(identity);
    const stale = await projects.create({ customerId: customer.id, status: "purchased", previewResult: { draftPages: [] } });
    const active = await projects.create({ customerId: customer.id, status: "purchased", previewResult: { draftPages: [] } });
    for (const [orderId, project] of [["1001", stale], ["1002", active]]) {
      await orders.recordPaid({
        orderId,
        projectId: project.id,
        customerId: customer.id,
        wooCustomerId: "42",
        productType: "ebook",
        pageCount: 32,
        orderTotalCents: 669,
      });
    }

    const result = await reconcileCustomerPaidBookPurchases(identity, [active.id, active.id, "not-a-project"], { projects, orders });
    assert.deepEqual(result.paidProjectIds, [active.id]);
    assert.equal(result.revokedCount, 1);
    assert.equal(result.restoredCount, 1);
    assert.equal((await projects.get(stale.id)).status, "preview_ready");
    assert.equal((await projects.get(active.id)).status, "purchased");
    assert.equal(await orders.hasPaidBookPurchase({ projectId: stale.id, customerId: customer.id }), false);
    assert.equal(await orders.hasPaidBookPurchase({ projectId: active.id, customerId: customer.id }), true);
    assert.deepEqual(normalizePaidProjectIds([active.id, stale.id]).sort(), [active.id, stale.id].sort());
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("the creator restores the project page count and explains missing legacy preview assets", async () => {
  const [app, index, translations] = await Promise.all([
    fs.readFile("public/app.js", "utf8"),
    fs.readFile("public/index.html", "utf8"),
    fs.readFile("public/i18n.js", "utf8"),
  ]);
  assert.match(app, /project\?\.finalBlueprint\?\.format\?\.interior_pages/);
  assert.match(app, /markPreviewAssetsUnavailable/);
  assert.match(app, /image\.naturalWidth === 0/);
  assert.match(app, /orderedPages\.length < total/);
  assert.match(index, /id="previewAssetsUnavailable"/);
  assert.match(translations, /previewAssetsUnavailableTitle/);
});

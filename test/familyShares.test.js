import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JsonFamilyShareStore } from "../src/services/familyShareStore.js";
import { createFamilyShareSession, verifyFamilyShareSession } from "../src/services/familyShareSession.js";
import { createWooAuthState, verifyWooAuthState } from "../src/services/draftIdentity.js";
import { JsonCommerceOrderStore } from "../src/services/commerceOrderStore.js";

test("family invitations store only token hashes and revoke guest access immediately", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-family-shares-"));
  try {
    const store = new JsonFamilyShareStore(path.join(directory, "shares.json"));
    const created = await store.create({
      projectId: "11111111-1111-4111-8111-111111111111",
      customerId: "22222222-2222-4222-8222-222222222222",
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    assert.match(created.token, /^[A-Za-z0-9_-]{40,128}$/);
    const disk = await fs.readFile(path.join(directory, "shares.json"), "utf8");
    assert.doesNotMatch(disk, new RegExp(created.token));
    assert.equal((await store.list(created.share.projectId, created.share.customerId))[0].tokenHash, undefined);
    assert.equal((await store.exchange(created.token)).accessCount, 1);
    assert.equal((await store.getActive(created.share.id)).id, created.share.id);
    await store.revoke(created.share.id, created.share.projectId, created.share.customerId);
    assert.equal(await store.exchange(created.token), null);
    assert.equal(await store.getActive(created.share.id), null);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test("family guest sessions are signed, expiring and scoped to one share", () => {
  const previous = process.env.FAMILY_SHARE_SIGNING_SECRET;
  process.env.FAMILY_SHARE_SIGNING_SECRET = "f".repeat(64);
  try {
    const share = {
      id: "33333333-3333-4333-8333-333333333333",
      projectId: "11111111-1111-4111-8111-111111111111",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };
    const token = createFamilyShareSession(share);
    assert.deepEqual(verifyFamilyShareSession(token), {
      shareId: share.id, projectId: share.projectId, exp: Math.floor(Date.parse(share.expiresAt) / 1000),
    });
    assert.equal(verifyFamilyShareSession(`${token}x`), null);
  } finally {
    if (previous === undefined) delete process.env.FAMILY_SHARE_SIGNING_SECRET;
    else process.env.FAMILY_SHARE_SIGNING_SECRET = previous;
  }
});

test("family sharing entitlement follows the paid eBook order status", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-family-commerce-"));
  try {
    const store = new JsonCommerceOrderStore(path.join(directory, "orders.json"));
    const purchase = {
      orderId: "family-order-1",
      projectId: "11111111-1111-4111-8111-111111111111",
      customerId: "22222222-2222-4222-8222-222222222222",
      wooCustomerId: "42",
      productType: "ebook",
      pageCount: 24,
      orderTotalCents: 669,
    };
    await store.recordPaid(purchase);
    assert.equal(await store.hasPaidEbookPurchase(purchase), true);
    await store.recordStatus({ ...purchase, status: "cancelled" });
    assert.equal(await store.hasPaidEbookPurchase(purchase), false);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test("WooCommerce authentication can return the owner to family-share management", () => {
  const secret = "w".repeat(64);
  const token = createWooAuthState({ projectId: "project-family", destination: "family_share" }, secret);
  assert.equal(verifyWooAuthState(token, secret).destination, "family_share");
});

test("family reader routes remain private, revocable and outside the service-worker cache", async () => {
  const [route, reader, worker, page] = await Promise.all([
    fs.readFile("src/routes/familyShares.js", "utf8"),
    fs.readFile("public/interactive-reader/app.js", "utf8"),
    fs.readFile("public/interactive-reader/sw.js", "utf8"),
    fs.readFile("public/share-family/index.html", "utf8"),
  ]);
  assert.match(route, /MAX_ACTIVE_SHARES = 3/);
  assert.match(route, /X-Robots-Tag.*noindex, nofollow, noarchive/s);
  assert.match(route, /familyShareStore\.getActive/);
  assert.match(route, /commerceOrderStore\.hasPaidEbookPurchase/);
  assert.match(route, /ebook_purchase_required/);
  assert.match(route, /Referrer-Policy.*no-referrer/s);
  assert.match(reader, /\/api\/shared-books\/\$\{encodeURIComponent\(shareId\)\}\/interactive-book/);
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(page, /robots.*noindex,nofollow,noarchive/);
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { customerCreationSummary } from "../src/services/customerCreationLibrary.js";
import { JsonCreditStore } from "../src/services/creditStore.js";
import { deleteCustomerCreation, ProjectDeletionError, runPendingProjectDeletionCleanup } from "../src/services/projectDeletion.js";
import { JsonProjectStore, normalizePhotoRefs, PostgresProjectStore } from "../src/services/projectStore.js";

function safeDependencies(overrides = {}) {
  return {
    orders: {
      async hasPaidBookPurchase() { return false; },
      async hasAnyProjectOrder() { return false; },
    },
    series: { async hasFactsForProject() { return false; } },
    credits: { async releasePreviewForProject() { return { releasedCount: 1 }; }, async deleteProjectEntitlements() {} },
    storage: { async delete() {}, async deletePrefix() {} },
    jobs: { get() { return null; }, fail() {}, delete() {} },
    ...overrides,
  };
}

test("an unpaid creation is deleted idempotently while shared photos remain private and available", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "storybook-project-deletion-"));
  try {
    const projects = new JsonProjectStore(path.join(directory, "projects.json"));
    const identity = { wooCustomerId: "42", email: "parent@example.com" };
    const customer = await projects.ensureCustomer(identity);
    const outputsDir = path.join(directory, "outputs");
    const uploadsDir = path.join(directory, "uploads");
    await fs.mkdir(outputsDir, { recursive: true });
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.writeFile(path.join(outputsDir, "draft-page-job.png"), "preview");
    await fs.writeFile(path.join(uploadsDir, "legacy-photo.jpg"), "photo");
    const project = await projects.create({
      customerId: customer.id,
      status: "preview_failed",
      generationJobId: "job-delete",
      photoRefs: [
        { id: "unique", storageKey: "reference-photos/unique.jpg" },
        { id: "shared", storageKey: "reference-photos/shared.jpg" },
        { id: "legacy-photo.jpg" },
      ],
      previewResult: { coverPreviewUrl: "/outputs/draft-page-job.png" },
    });
    await projects.create({
      customerId: customer.id,
      status: "draft",
      photoRefs: [{ id: "shared-copy", storageKey: "reference-photos/shared.jpg" }],
    });
    const credits = new JsonCreditStore(path.join(directory, "credits.json"), projects);
    credits.write({
      entries: [{ id: "entry", customerId: customer.id, projectId: project.id, amountCents: -400, entryType: "preview_reserve", idempotencyKey: "entry" }],
      reservations: [{ id: "reservation", customerId: customer.id, projectId: project.id, amountCents: 400, status: "reserved" }],
      redemptions: [{ id: "redemption", customerId: customer.id, projectId: project.id }],
      rebates: [{ id: "rebate", customerId: customer.id, projectId: project.id, reservationId: "captured", amountCents: 400, status: "available" }],
      checkoutReservations: [{ id: "checkout", customerId: customer.id, projectId: project.id, status: "reserved" }],
    });
    const deletedKeys = [];
    const deletedPrefixes = [];
    const deletedJobs = [];
    const dependencies = safeDependencies({
      projects,
      outputsDir,
      uploadsDir,
      credits,
      storage: {
        async delete(key) { deletedKeys.push(key); },
        async deletePrefix(prefix) { deletedPrefixes.push(prefix); },
      },
      jobs: { get() { return { id: "job-delete", status: "failed" }; }, fail() {}, delete(id) { deletedJobs.push(id); } },
    });

    const first = await deleteCustomerCreation(project.id, identity, dependencies);
    const second = await deleteCustomerCreation(project.id, identity, dependencies);

    assert.equal(first.deleted, true);
    assert.equal(first.alreadyDeleted, false);
    assert.equal(first.cleanupPending, true);
    assert.equal(second.alreadyDeleted, true);
    assert.equal(second.cleanupPending, true);
    assert.equal(await projects.get(project.id), null);
    assert.deepEqual(deletedPrefixes, []);
    assert.deepEqual(deletedKeys, []);
    assert.deepEqual(deletedJobs, []);

    const cleanup = await runPendingProjectDeletionCleanup({
      ...dependencies,
      projects,
      configuration: { intervalMs: 30000, maxAttempts: 3, batchSize: 10 },
    });
    assert.deepEqual(cleanup, { claimed: 1, completed: 1, pending: 0, manualReview: 0 });
    assert.deepEqual(deletedPrefixes, [`ebooks/previews/${project.id}/`]);
    assert.deepEqual(deletedKeys, ["reference-photos/unique.jpg"]);
    assert.deepEqual(deletedJobs, ["job-delete"]);
    const creditData = credits.read();
    assert.equal(creditData.entries.length, 2);
    assert.ok(creditData.entries.every((entry) => entry.projectId === null));
    assert.equal(creditData.reservations.length, 0);
    assert.equal(creditData.rebates.length, 0);
    assert.equal(creditData.checkoutReservations.length, 0);
    assert.equal(creditData.redemptions[0].projectId, null);
    await assert.rejects(fs.stat(path.join(outputsDir, "draft-page-job.png")), { code: "ENOENT" });
    await assert.rejects(fs.stat(path.join(uploadsDir, "legacy-photo.jpg")), { code: "ENOENT" });
    const deletion = Object.values(projects.read().deletions).find((item) => item.projectId === project.id);
    assert.equal(deletion.status, "completed");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("pending private cleanup resumes automatically and escalates only after bounded failures", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "storybook-project-cleanup-worker-"));
  try {
    const projects = new JsonProjectStore(path.join(directory, "projects.json"));
    const identity = { wooCustomerId: "42", email: "parent@example.com" };
    const customer = await projects.ensureCustomer(identity);
    const recoverable = await projects.create({ customerId: customer.id, status: "preview_failed" });
    const manual = await projects.create({ customerId: customer.id, status: "preview_failed" });
    const loggerEvents = [];
    const logger = {
      info(message, details) { loggerEvents.push({ level: "info", message, details }); },
      warn(message, details) { loggerEvents.push({ level: "warn", message, details }); },
      error(message, details) { loggerEvents.push({ level: "error", message, details }); },
    };
    const failingStorage = {
      async delete() { throw new Error("private storage delete denied"); },
      async deletePrefix() { throw new Error("private storage delete denied"); },
    };
    for (const project of [recoverable, manual]) {
      const queued = await deleteCustomerCreation(project.id, identity, safeDependencies({ projects, storage: failingStorage, logger }));
      assert.equal(queued.cleanupPending, true);
    }
    const makeDue = (projectId) => {
      const store = projects.read();
      const deletion = Object.values(store.deletions).find((item) => item.projectId === projectId);
      deletion.nextRetryAt = new Date(Date.now() - 1000).toISOString();
      store.deletions[deletion.id] = deletion;
      projects.write(store);
    };
    const hold = projects.read();
    const heldDeletion = Object.values(hold.deletions).find((item) => item.projectId === manual.id);
    heldDeletion.nextRetryAt = new Date(Date.now() + 60000).toISOString();
    hold.deletions[heldDeletion.id] = heldDeletion;
    projects.write(hold);
    makeDue(recoverable.id);
    const recovered = await runPendingProjectDeletionCleanup({
      projects,
      storage: { async delete() {}, async deletePrefix() {} },
      jobs: { delete() {} },
      logger,
      configuration: { intervalMs: 30000, maxAttempts: 3, batchSize: 10 },
      outputsDir: path.join(directory, "outputs"),
      uploadsDir: path.join(directory, "uploads"),
    });
    assert.deepEqual(recovered, { claimed: 1, completed: 1, pending: 0, manualReview: 0 });
    assert.equal(Object.values(projects.read().deletions).find((item) => item.projectId === recoverable.id).status, "completed");

    makeDue(manual.id);
    const firstFailure = await runPendingProjectDeletionCleanup({
      projects,
      storage: failingStorage,
      jobs: { delete() {} },
      logger,
      configuration: { intervalMs: 30000, maxAttempts: 2, batchSize: 10 },
      outputsDir: path.join(directory, "outputs"),
      uploadsDir: path.join(directory, "uploads"),
    });
    assert.deepEqual(firstFailure, { claimed: 1, completed: 0, pending: 1, manualReview: 0 });
    makeDue(manual.id);
    const exhausted = await runPendingProjectDeletionCleanup({
      projects,
      storage: failingStorage,
      jobs: { delete() {} },
      logger,
      configuration: { intervalMs: 30000, maxAttempts: 2, batchSize: 10 },
      outputsDir: path.join(directory, "outputs"),
      uploadsDir: path.join(directory, "uploads"),
    });
    assert.deepEqual(exhausted, { claimed: 1, completed: 0, pending: 0, manualReview: 1 });
    const exhaustedDeletion = Object.values(projects.read().deletions).find((item) => item.projectId === manual.id);
    assert.equal(exhaustedDeletion.status, "manual_review");
    assert.equal(exhaustedDeletion.cleanupAttempts, 2);
    assert.match(exhaustedDeletion.lastError, /delete denied/);
    assert.ok(loggerEvents.some((event) => event.message.includes("manual review required")));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("paid purchases, series canon and active generation block deletion while cancelled order history is tombstoned", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "storybook-project-deletion-blocks-"));
  try {
    const projects = new JsonProjectStore(path.join(directory, "projects.json"));
    const identity = { wooCustomerId: "42", email: "parent@example.com" };
    const customer = await projects.ensureCustomer(identity);
    const purchased = await projects.create({ customerId: customer.id, status: "purchased" });
    const cancelled = await projects.create({ customerId: customer.id, status: "purchased", previewResult: { draftPages: [] } });
    const canonical = await projects.create({ customerId: customer.id, status: "preview_ready" });
    const generating = await projects.create({ customerId: customer.id, status: "preview_generating", generationJobId: "active-job" });

    await assert.rejects(deleteCustomerCreation(purchased.id, identity, safeDependencies({
      projects,
      orders: {
        async hasPaidBookPurchase() { return true; },
        async hasAnyProjectOrder() { return true; },
      },
    })), (error) => error instanceof ProjectDeletionError && error.code === "purchased_project");
    const cancelledDeletion = await deleteCustomerCreation(cancelled.id, identity, safeDependencies({
      projects,
      orders: {
        async hasPaidBookPurchase() { return false; },
        async hasAnyProjectOrder() { return true; },
      },
    }));
    assert.equal(cancelledDeletion.deleted, true);
    assert.equal(await projects.get(cancelled.id), null);
    assert.ok(projects.read().projects[cancelled.id]);
    await assert.rejects(deleteCustomerCreation(canonical.id, identity, safeDependencies({ projects, series: { async hasFactsForProject() { return true; } } })), (error) => error.code === "series_canon");
    await assert.rejects(deleteCustomerCreation(generating.id, identity, safeDependencies({
      projects,
      jobs: { get() { return { id: "active-job", status: "running", updatedAt: new Date().toISOString() }; }, fail() {}, delete() {} },
    })), (error) => error.code === "generation_active");

    assert.ok(await projects.get(purchased.id));
    assert.equal(await projects.get(cancelled.id), null);
    assert.ok(await projects.get(canonical.id));
    assert.ok(await projects.get(generating.id));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("a deletion receipt is an authoritative tombstone for project reads and customer listings", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "storybook-project-tombstone-"));
  try {
    const projects = new JsonProjectStore(path.join(directory, "projects.json"));
    const identity = { wooCustomerId: "42", email: "parent@example.com" };
    const customer = await projects.ensureCustomer(identity);
    const project = await projects.create({ customerId: customer.id, status: "preview_ready" });
    const store = projects.read();
    store.deletions.tombstone = {
      id: "tombstone",
      projectId: project.id,
      customerId: customer.id,
      assetManifest: {},
      status: "completed",
      cleanupAttempts: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    projects.write(store);

    assert.equal(await projects.get(project.id), null);
    assert.equal(await projects.getForCustomer(project.id, identity), null);
    assert.deepEqual(await projects.listForCustomer(identity), []);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("legacy object-shaped photo references remain iterable during PostgreSQL deletion checks", async () => {
  const database = {
    async query() {
      return {
        rows: [
          { photo_refs: { primary: { id: "shared", storageKey: "reference-photos/shared.jpg" } } },
          { photo_refs: { photos: [{ id: "other", storageKey: "reference-photos/other.jpg" }] } },
          { photo_refs: null },
        ],
      };
    },
  };
  const projects = new PostgresProjectStore(database);

  assert.deepEqual(
    normalizePhotoRefs({ primary: { id: "legacy.jpg" }, photos: [{ storageKey: "reference-photos/shared.jpg" }] }),
    [{ id: "legacy.jpg" }, { storageKey: "reference-photos/shared.jpg" }]
  );
  assert.deepEqual(
    await projects.photoStorageKeysReferencedElsewhere("project-to-delete", [
      "reference-photos/shared.jpg",
      "reference-photos/missing.jpg",
    ]),
    ["reference-photos/shared.jpg"]
  );
});

test("customer metadata and the WordPress bridge expose deletion without exposing purchased books", async () => {
  const [bridge, route, migration, queueMigration, storeSource, serverSource] = await Promise.all([
    fs.readFile("wordpress/calitiki-bridge/calitiki-bridge.php", "utf8"),
    fs.readFile("src/routes/commerceCredits.js", "utf8"),
    fs.readFile("db/migrations/008_project_deletions.sql", "utf8"),
    fs.readFile("db/migrations/009_project_deletion_cleanup_queue.sql", "utf8"),
    fs.readFile("src/services/projectStore.js", "utf8"),
    fs.readFile("src/server.js", "utf8"),
  ]);
  assert.equal(customerCreationSummary({ id: "draft", status: "preview_failed" }).deletable, true);
  assert.equal(customerCreationSummary({ id: "paid", status: "purchased" }).deletable, false);
  assert.equal(customerCreationSummary({ id: "orphan", status: "purchased" }, { paidPurchase: false }).deletable, true);
  const narrated = customerCreationSummary({ id: "narrated", status: "purchased" }, {
    latestNarration: { paymentStatus: "paid", fulfillmentStatus: "ready" },
    activeNarration: { paymentStatus: "paid", fulfillmentStatus: "ready" },
  });
  assert.equal(narrated.narrationStatus, "ready");
  assert.equal(narrated.narrationReady, true);
  assert.match(bridge, /Version: 0\.8\.0/);
  assert.match(bridge, /admin_post_calitiki_delete_creation/);
  assert.match(bridge, /check_admin_referer\('calitiki_delete_creation_'/);
  assert.match(bridge, /window\.confirm/);
  assert.match(bridge, /delete-creation\|/);
  assert.match(bridge, /store_creation_deletion_notice/);
  assert.match(bridge, /render_creation_deletion_notice/);
  assert.match(bridge, /'cleanup_pending' => array\('notice'/);
  assert.match(bridge, /!empty\(\$result\['cleanupPending'\]\)/);
  assert.match(bridge, /'http_request_failed' => array\('error'/);
  assert.match(bridge, /Aucune action n’est nécessaire/);
  assert.match(bridge, /woocommerce-info/);
  const deleteHandler = bridge.slice(
    bridge.indexOf("public static function delete_creation"),
    bridge.indexOf("public static function resend_ebook_email")
  );
  assert.doesNotMatch(deleteHandler, /wc_add_notice/);
  assert.match(route, /router\.delete\("\/commerce\/creations\/:id"/);
  assert.match(route, /router\.post\("\/commerce\/creations"/);
  assert.match(route, /reconcileCustomerPaidBookPurchases/);
  assert.match(bridge, /paidProjectIds/);
  assert.match(route, /confirmation !== projectId/);
  assert.match(route, /result\.cleanupPending \? 202 : 200/);
  assert.match(route, /\[project-deletion\] request failed/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS project_deletions/);
  assert.match(queueMigration, /cleanup_attempts/);
  assert.match(queueMigration, /next_retry_at/);
  assert.match(storeSource, /SELECT \* FROM book_projects WHERE id=\$1 AND customer_id=\$2 FOR UPDATE/);
  assert.match(storeSource, /product_type IN \('ebook','print'\) AND payment_status='paid'/);
  assert.match(storeSource, /EXISTS\(SELECT 1 FROM commerce_orders WHERE project_id=\$1\)/);
  assert.match(storeSource, /EXISTS\(SELECT 1 FROM series_continuity_facts WHERE source_project_id=\$1\)/);
  assert.match(storeSource, /FOR UPDATE SKIP LOCKED/);
  assert.match(storeSource, /NOT EXISTS \(SELECT 1 FROM project_deletions/);
  assert.match(serverSource, /startProjectDeletionCleanupWorker\(\)/);
});

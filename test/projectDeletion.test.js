import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { customerCreationSummary } from "../src/services/customerCreationLibrary.js";
import { JsonCreditStore } from "../src/services/creditStore.js";
import { deleteCustomerCreation, ProjectDeletionError } from "../src/services/projectDeletion.js";
import { JsonProjectStore } from "../src/services/projectStore.js";

function safeDependencies(overrides = {}) {
  return {
    orders: { async hasAnyProjectOrder() { return false; } },
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
    assert.equal(second.alreadyDeleted, true);
    assert.equal(await projects.get(project.id), null);
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

test("purchases, order history, series canon and active generation each block deletion", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "storybook-project-deletion-blocks-"));
  try {
    const projects = new JsonProjectStore(path.join(directory, "projects.json"));
    const identity = { wooCustomerId: "42", email: "parent@example.com" };
    const customer = await projects.ensureCustomer(identity);
    const purchased = await projects.create({ customerId: customer.id, status: "purchased" });
    const ordered = await projects.create({ customerId: customer.id, status: "preview_ready" });
    const canonical = await projects.create({ customerId: customer.id, status: "preview_ready" });
    const generating = await projects.create({ customerId: customer.id, status: "preview_generating", generationJobId: "active-job" });

    await assert.rejects(deleteCustomerCreation(purchased.id, identity, safeDependencies({ projects })), (error) => error instanceof ProjectDeletionError && error.code === "purchased_project");
    await assert.rejects(deleteCustomerCreation(ordered.id, identity, safeDependencies({ projects, orders: { async hasAnyProjectOrder() { return true; } } })), (error) => error.code === "order_exists");
    await assert.rejects(deleteCustomerCreation(canonical.id, identity, safeDependencies({ projects, series: { async hasFactsForProject() { return true; } } })), (error) => error.code === "series_canon");
    await assert.rejects(deleteCustomerCreation(generating.id, identity, safeDependencies({
      projects,
      jobs: { get() { return { id: "active-job", status: "running", updatedAt: new Date().toISOString() }; }, fail() {}, delete() {} },
    })), (error) => error.code === "generation_active");

    assert.ok(await projects.get(purchased.id));
    assert.ok(await projects.get(ordered.id));
    assert.ok(await projects.get(canonical.id));
    assert.ok(await projects.get(generating.id));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("customer metadata and the WordPress bridge expose deletion without exposing purchased books", async () => {
  const [bridge, route, migration, storeSource] = await Promise.all([
    fs.readFile("wordpress/calitiki-bridge/calitiki-bridge.php", "utf8"),
    fs.readFile("src/routes/commerceCredits.js", "utf8"),
    fs.readFile("db/migrations/008_project_deletions.sql", "utf8"),
    fs.readFile("src/services/projectStore.js", "utf8"),
  ]);
  assert.equal(customerCreationSummary({ id: "draft", status: "preview_failed" }).deletable, true);
  assert.equal(customerCreationSummary({ id: "paid", status: "purchased" }).deletable, false);
  assert.match(bridge, /Version: 0\.6\.4/);
  assert.match(bridge, /admin_post_calitiki_delete_creation/);
  assert.match(bridge, /check_admin_referer\('calitiki_delete_creation_'/);
  assert.match(bridge, /window\.confirm/);
  assert.match(bridge, /delete-creation\|/);
  assert.match(bridge, /store_creation_deletion_notice/);
  assert.match(bridge, /render_creation_deletion_notice/);
  const deleteHandler = bridge.slice(
    bridge.indexOf("public static function delete_creation"),
    bridge.indexOf("public static function resend_ebook_email")
  );
  assert.doesNotMatch(deleteHandler, /wc_add_notice/);
  assert.match(route, /router\.delete\("\/commerce\/creations\/:id"/);
  assert.match(route, /confirmation !== projectId/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS project_deletions/);
  assert.match(storeSource, /SELECT \* FROM book_projects WHERE id=\$1 AND customer_id=\$2 FOR UPDATE/);
  assert.match(storeSource, /EXISTS\(SELECT 1 FROM commerce_orders WHERE project_id=\$1\)/);
  assert.match(storeSource, /EXISTS\(SELECT 1 FROM series_continuity_facts WHERE source_project_id=\$1\)/);
});

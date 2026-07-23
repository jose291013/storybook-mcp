import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  PREVIEW_MODIFICATION_PRICE_CENTS,
  previewModificationPriceCents,
} from "../src/config/previewModificationPricing.js";
import { eligibleSpreads, fingerprint } from "../src/routes/previewModifications.js";
import { JsonCreditStore } from "../src/services/creditStore.js";
import { JsonPreviewRevisionStore } from "../src/services/previewRevisionStore.js";

function completedProject() {
  return {
    id: "project-1",
    status: "preview_ready",
    finalBlueprint: {
      language: "FR",
      pages: [
        { page_number: 2, page_type: "text", spread_number: 1, scene_title: "Le départ" },
        { page_number: 3, page_type: "image", spread_number: 1, scene_title: "Le départ" },
        { page_number: 4, page_type: "text", spread_number: 2, scene_title: "La rencontre" },
        { page_number: 5, page_type: "image", spread_number: 2, scene_title: "La rencontre" },
      ],
    },
    previewResult: {
      coverPreviewUrl: "/cover.png",
      draftPages: [
        { page_number: 2, page_type: "text", spread_number: 1, text: "Texte un", previewUrl: "/page-2.png" },
        { page_number: 3, page_type: "image", spread_number: 1, previewUrl: "/page-3.png" },
        { page_number: 4, page_type: "text", spread_number: 2, text: "Texte deux", previewUrl: "/page-4.png" },
        { page_number: 5, page_type: "image", spread_number: 2, previewUrl: "/page-5.png" },
      ],
    },
  };
}

test("targeted preview modification quotes are fixed, explicit and additive", () => {
  assert.deepEqual(PREVIEW_MODIFICATION_PRICE_CENTS, {
    text: 50,
    illustration: 100,
    both: 150,
  });
  assert.equal(previewModificationPriceCents("text"), 50);
  assert.equal(previewModificationPriceCents("illustration"), 100);
  assert.equal(previewModificationPriceCents("both"), 150);
  assert.throws(() => previewModificationPriceCents("whole_book"), /Unsupported/);
});

test("only complete narrative spreads can receive a targeted modification", () => {
  const project = completedProject();
  assert.deepEqual(eligibleSpreads(project), [
    {
      spreadNumber: 1,
      textPageNumber: 2,
      imagePageNumber: 3,
      sceneTitle: "Le départ",
      currentText: "Texte un",
    },
    {
      spreadNumber: 2,
      textPageNumber: 4,
      imagePageNumber: 5,
      sceneTitle: "La rencontre",
      currentText: "Texte deux",
    },
  ]);
  const before = fingerprint(project);
  project.previewResult.draftPages[0].text = "Texte modifié";
  assert.notEqual(fingerprint(project), before);
});

test("an active project checkout blocks a competing preview modification", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-modification-checkout-"));
  const previousCodes = process.env.PREVIEW_PROMO_CODES;
  process.env.PREVIEW_PROMO_CODES = "MODIFICATION300:300";
  try {
    const customerStore = {
      async ensureCustomer(identity) { return { id: `customer-${identity.wooCustomerId}` }; },
    };
    const store = new JsonCreditStore(path.join(directory, "credits.json"), customerStore);
    const identity = { wooCustomerId: "42", email: "parent@example.com" };
    await store.redeem(identity, { code: "MODIFICATION300", projectId: "project-1" });
    const preview = await store.reservePreview(identity, {
      projectId: "project-1",
      amountCents: 250,
      idempotencyKey: "preview-project-1",
    });
    await store.capturePreview(preview.id);
    const checkout = await store.reserveProjectRebate(identity, {
      projectId: "project-1",
      idempotencyKey: "checkout-project-1",
    });
    assert.equal(await store.hasActiveCheckoutReservation(identity, { projectId: "project-1" }), true);
    await store.releaseCheckout(checkout.id);
    assert.equal(await store.hasActiveCheckoutReservation(identity, { projectId: "project-1" }), false);
  } finally {
    if (previousCodes === undefined) delete process.env.PREVIEW_PROMO_CODES;
    else process.env.PREVIEW_PROMO_CODES = previousCodes;
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("a candidate revision never overwrites its source before explicit approval", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-preview-revisions-"));
  try {
    const customerStore = {
      async ensureCustomer(identity) { return { id: `customer-${identity.wooCustomerId}` }; },
    };
    const store = new JsonPreviewRevisionStore(path.join(directory, "revisions.json"), customerStore);
    const identity = { wooCustomerId: "42", email: "parent@example.com" };
    const source = completedProject();
    const sourceSnapshot = structuredClone({
      finalBlueprint: source.finalBlueprint,
      previewResult: source.previewResult,
    });
    const created = await store.create(identity, {
      projectId: source.id,
      spreadNumber: 1,
      changeScope: "text",
      instruction: "Rendre le ton plus chaleureux.",
      amountCents: 50,
      sourceFingerprint: fingerprint(source),
      sourceSnapshot,
    });
    assert.equal(created.created, true);
    assert.equal(created.modification.status, "reserved");
    assert.equal((await store.create(identity, {
      projectId: source.id,
      spreadNumber: 2,
      changeScope: "illustration",
      instruction: "Une lumière plus douce.",
      amountCents: 100,
      sourceFingerprint: fingerprint(source),
      sourceSnapshot,
    })).created, false);

    const candidate = structuredClone(sourceSnapshot);
    candidate.previewResult.draftPages[0].text = "Une version plus chaleureuse.";
    await store.update(created.modification.id, {
      status: "awaiting_approval",
      candidateSnapshot: candidate,
    });
    assert.equal(source.previewResult.draftPages[0].text, "Texte un");
    assert.equal((await store.activeForProject(source.id)).status, "awaiting_approval");

    const approved = await store.approve(created.modification.id, candidate);
    assert.equal(approved.modification.status, "approved");
    assert.equal(approved.revision.revisionNumber, 2);
    assert.equal(approved.revision.previewSnapshot.draftPages[0].text, "Une version plus chaleureuse.");
    assert.equal(await store.activeForProject(source.id), null);

    const persisted = JSON.parse(await fs.readFile(path.join(directory, "revisions.json"), "utf8"));
    const revisions = Object.values(persisted.revisions).sort((left, right) => left.revisionNumber - right.revisionNumber);
    assert.equal(revisions.length, 2);
    assert.equal(revisions[0].status, "superseded");
    assert.equal(revisions[0].previewSnapshot.draftPages[0].text, "Texte un");
    assert.equal(revisions[1].status, "current");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("the customer flow separates paid changes from free repairs and blocks checkout while pending", async () => {
  const [route, checkout, html, app, migration, roadmap] = await Promise.all([
    fs.readFile("src/routes/previewModifications.js", "utf8"),
    fs.readFile("src/routes/commerceCheckout.js", "utf8"),
    fs.readFile("public/index.html", "utf8"),
    fs.readFile("public/app.js", "utf8"),
    fs.readFile("db/migrations/010_preview_revisions.sql", "utf8"),
    fs.readFile("docs/product-roadmap.md", "utf8"),
  ]);
  assert.match(route, /creditStore\.reservePreview/);
  assert.match(route, /creditStore\.capturePreview/);
  assert.match(route, /creditStore\.releasePreview/);
  assert.match(route, /status: "awaiting_approval"/);
  assert.match(route, /sourceFingerprint/);
  assert.match(route, /PREVIEW_MODIFICATION_STALE_MINUTES/);
  assert.match(route, /hasActiveCheckoutReservation/);
  assert.doesNotMatch(route, /technicalCheckAt/);
  assert.match(checkout, /activeForProject/);
  assert.match(checkout, /Approve or reject the pending preview modification/);
  assert.match(html, /id="actionRequestChange"/);
  assert.match(html, /id="previewModificationPanel"/);
  assert.match(html, /id="approveModification"/);
  assert.match(html, /id="rejectModification"/);
  assert.match(app, /preview-modifications\/quote/);
  assert.match(app, /refreshLatestModification/);
  assert.match(app, /modificationWorking/);
  assert.match(migration, /preview_modifications_one_active_idx/);
  assert.match(migration, /preview_revisions_one_current_idx/);
  assert.match(roadmap, /targeted modification creates a new revision/i);
});

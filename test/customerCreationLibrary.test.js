import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { listCustomerCreations } from "../src/services/customerCreationLibrary.js";
import { JsonProjectStore } from "../src/services/projectStore.js";

test("customer library exposes safe preview metadata and excludes unpaid drafts", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "storybook-customer-library-"));
  try {
    const store = new JsonProjectStore(path.join(directory, "projects.json"));
    const identity = { wooCustomerId: "42", email: "parent@example.com" };
    const customer = await store.ensureCustomer(identity);
    await store.create({
      customerId: customer.id,
      status: "draft",
      title: "Brouillon sans génération",
      questionnaire: { hero_name: "Noa", page_count: 24 },
    });
    await store.create({
      customerId: customer.id,
      status: "preview_ready",
      title: "Noa et la forêt",
      questionnaire: { hero_name: "Noa", page_count: 36, private_answer: "secret" },
      photoRefs: [{ id: "private-photo", storageKey: "private/key.jpg" }],
      previewResult: { coverPreviewUrl: "/private/cover.png" },
      finalBlueprint: { cover: { title: "Noa et la forêt enchantée" }, format: { interior_pages: 36 } },
    });
    await store.create({
      customerId: customer.id,
      status: "preview_failed",
      title: "Projet à reprendre",
      questionnaire: { page_count: 44 },
      continuitySnapshot: {
        generationCheckpoint: { version: 1, retryAvailable: true, retryExhausted: false },
      },
    });
    await store.create({
      customerId: customer.id,
      status: "scenario_review",
      title: "Scénario de Noa",
      questionnaire: { page_count: 32 },
      continuitySnapshot: { storyScenario: { title: "Noa et le portail", status: "proposed" } },
    });
    const orphanedPurchase = await store.create({
      customerId: customer.id,
      status: "purchased",
      title: "Ancien aperçu sans achat",
      questionnaire: { page_count: 32 },
      previewResult: { draftPages: [] },
    });
    const paidPurchase = await store.create({
      customerId: customer.id,
      status: "purchased",
      title: "Livre réellement acheté",
      questionnaire: { page_count: 24 },
      previewResult: { draftPages: [] },
    });
    const otherCustomer = await store.ensureCustomer({ wooCustomerId: "99", email: "other@example.com" });
    await store.create({
      customerId: otherCustomer.id,
      status: "preview_ready",
      title: "Livre d’une autre famille",
      questionnaire: { page_count: 24 },
      previewResult: { coverPreviewUrl: "/private/other-cover.png" },
    });

    const orders = {
      async hasPaidBookPurchase({ projectId }) {
        return projectId === paidPurchase.id;
      },
    };
    const creations = await listCustomerCreations(identity, store, orders);
    assert.equal(creations.length, 5);
    assert.deepEqual(creations.map((creation) => creation.status).sort(), ["preview_failed", "preview_ready", "purchased", "purchased", "scenario_review"]);
    assert.equal(creations.find((creation) => creation.status === "scenario_review").title, "Noa et le portail");
    assert.equal(creations.find((creation) => creation.status === "preview_ready").title, "Noa et la forêt enchantée");
    assert.equal(creations.find((creation) => creation.status === "preview_ready").pageCount, 36);
    assert.equal(creations.find((creation) => creation.status === "preview_failed").technicalRetryAvailable, true);
    assert.equal(creations.find((creation) => creation.id === orphanedPurchase.id).deletable, true);
    assert.equal(creations.find((creation) => creation.id === paidPurchase.id).deletable, false);
    assert.ok(creations.every((creation) => !Object.hasOwn(creation, "questionnaire")));
    assert.ok(creations.every((creation) => !Object.hasOwn(creation, "photoRefs")));
    assert.ok(creations.every((creation) => !Object.hasOwn(creation, "previewResult")));
    assert.ok(creations.every((creation) => !Object.hasOwn(creation, "customerId")));
    assert.ok(creations.every((creation) => creation.title !== "Livre d’une autre famille"));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

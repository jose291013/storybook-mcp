import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { JsonCommerceOrderStore } from "../src/services/commerceOrderStore.js";
import { JsonProjectStore } from "../src/services/projectStore.js";
import { JsonSeriesStore } from "../src/services/seriesStore.js";
import { createNextAdventure, SeriesPurchaseRequiredError } from "../src/services/seriesService.js";

async function stores() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-series-"));
  return {
    projects: new JsonProjectStore(path.join(root, "projects.json")),
    series: new JsonSeriesStore(path.join(root, "series.json")),
    orders: new JsonCommerceOrderStore(path.join(root, "orders.json")),
  };
}

test("a purchased book creates one idempotent editable next-adventure draft", async () => {
  const data = await stores();
  const customer = await data.projects.ensureCustomer({ wooCustomerId: "291013", email: "family@example.com" });
  const source = await data.projects.create({
    customerId: customer.id, status: "purchased", title: "Noa et Luma", locale: "ES", expiresAt: null,
    questionnaire: { hero_name: "Noa", age: "6", challenge: "Oser demander de l'aide", dream: "Trouver une étoile" },
    photoRefs: [{ id: "photo-noa", storageKey: "reference-photos/noa.jpg", role: "child", story_role: "hero", name: "Noa" }],
    productConfiguration: { page_count: 32, style_id: "gentle_3d", universe_id: "starry_space" },
    continuitySnapshot: { storyScenario: {
      status: "approved",
      title: "Noa et Luma",
      characters: [{ name: "Noa", role: "child", storyRole: "hero" }],
      scenes: [{
        locationBefore: "la maison",
        locationAfter: "la station orbitale",
        transition: { kind: "cross_passage", mechanismId: "portail_stellaire" },
        characterMovements: [],
      }],
    } },
    finalBlueprint: { title: "Noa et Luma" }, previewResult: { jobId: "old-preview" },
  });
  await data.orders.recordPaid({ orderId: "78", projectId: source.id, customerId: customer.id, wooCustomerId: "291013", productType: "ebook", pageCount: 32, orderTotalCents: 892 });

  const first = await createNextAdventure({ sourceProject: source, stores: data });
  const second = await createNextAdventure({ sourceProject: await data.projects.get(source.id), stores: data });
  assert.equal(first.reused, false);
  assert.equal(second.reused, true);
  assert.equal(second.project.id, first.project.id);
  assert.equal(first.project.episodeNumber, 2);
  assert.equal(first.project.sourceProjectId, source.id);
  assert.equal(first.project.questionnaire.challenge, "Oser demander de l'aide");
  assert.deepEqual(first.project.photoRefs, source.photoRefs);
  assert.equal(first.project.finalBlueprint, null);
  assert.equal(first.project.previewResult, null);
  assert.equal(first.project.expiresAt, null);
  assert.equal(first.project.continuitySnapshot.seriesContext.narrativeCanon.passages[0], "portail_stellaire");
  assert.deepEqual(first.project.continuitySnapshot.seriesContext.narrativeCanon.locations, ["la maison", "la station orbitale"]);
  const canonicalSource = await data.projects.get(source.id);
  assert.equal(canonicalSource.episodeNumber, 1);
  assert.equal(canonicalSource.seriesId, first.project.seriesId);
});

test("an unpaid preview never enters series canon", async () => {
  const data = await stores();
  const customer = await data.projects.ensureCustomer({ wooCustomerId: "7" });
  const source = await data.projects.create({ customerId: customer.id, questionnaire: { hero_name: "Léo" }, expiresAt: null });
  await assert.rejects(() => createNextAdventure({ sourceProject: source, stores: data }), SeriesPurchaseRequiredError);
  assert.equal((await data.projects.get(source.id)).seriesId, null);
});

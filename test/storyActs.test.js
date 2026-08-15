import assert from "node:assert/strict";
import test from "node:test";

import { ALLOWED_PAGE_COUNTS } from "../src/config/bookOptions.js";
import { createPagePlan } from "../src/config/bookStructure.js";
import {
  createStoryActContract,
  STORY_ACT_CONTRACT_VERSION,
  storyActContractIssues,
} from "../src/config/storyActs.js";
import { manuscriptBatches } from "../src/services/manuscriptBatches.js";
import { normalizeStoryScenario, validateStoryScenario } from "../src/services/storyScenario.js";
import { scopeAutomaticRepairCandidate } from "../src/services/storyScenarioGeneration.js";

const EXPECTED_BOUNDARIES = new Map([
  [24, [[1, 4], [5, 8], [9, 11]]],
  [28, [[1, 5], [6, 10], [11, 13]]],
  [32, [[1, 6], [7, 12], [13, 15]]],
  [36, [[1, 6], [7, 14], [15, 17]]],
  [40, [[1, 6], [7, 15], [16, 19]]],
  [44, [[1, 6], [7, 16], [17, 21]]],
]);

test("every sellable length has three contiguous server-owned narrative acts", () => {
  for (const pageCount of ALLOWED_PAGE_COUNTS) {
    const pagePlan = createPagePlan(pageCount);
    const contract = createStoryActContract(pagePlan);
    assert.equal(contract.version, STORY_ACT_CONTRACT_VERSION);
    assert.deepEqual(storyActContractIssues(contract), [], `${pageCount} pages`);
    assert.deepEqual(
      contract.acts.map((act) => [act.startsAtScene, act.endsAtScene]),
      EXPECTED_BOUNDARIES.get(pageCount),
      `${pageCount} pages`,
    );
    for (const sceneNumber of contract.acts.flatMap((act) => act.sceneNumbers)) {
      const spread = pagePlan.filter((page) => Number(page.scene_number) === sceneNumber);
      assert.equal(spread.length, 2, `${pageCount} pages, scene ${sceneNumber}`);
      assert.equal(new Set(spread.map((page) => page.act)).size, 1);
    }
  }
});

test("scenario normalization ignores model-authored act boundaries", () => {
  const pagePlan = createPagePlan(44);
  const imagePages = pagePlan.filter((page) => page.page_type === "image");
  const scenario = normalizeStoryScenario({
    title: "Synthetic deterministic arc",
    summary: "Synthetic deterministic arc used only by a unit test.",
    scenes: imagePages.map((page) => ({
      scene_number: page.scene_number,
      story_role: page.story_role,
      act: page.act === 1 ? 3 : 1,
      title: `Scene ${page.scene_number}`,
      location_before: "atelier",
      location_after: "atelier",
      action: `Action ${page.scene_number}`,
      prerequisite_scene_ids: page.scene_number > 1 ? [`scene-${page.scene_number - 1}`] : [],
    })),
  }, { pagePlan });
  assert.equal(scenario.actPlanVersion, STORY_ACT_CONTRACT_VERSION);
  assert.deepEqual(
    scenario.scenes.map((scene) => scene.act),
    imagePages.map((page) => page.act),
  );

  scenario.scenes[0].act = 3;
  assert.ok(validateStoryScenario(scenario).issues.some((issue) => (
    issue === "scene-1.act must match the deterministic story-role boundary"
  )));
});

test("manuscript batching uses the deterministic page plan instead of model act values", () => {
  const pages = createPagePlan(44);
  const approvedScenario = {
    actPlanVersion: STORY_ACT_CONTRACT_VERSION,
    scenes: pages.filter((page) => page.page_type === "image").map((page) => ({
      sceneNumber: page.scene_number,
      storyRole: page.story_role,
      act: 1,
    })),
  };
  const batches = manuscriptBatches({ pages, approvedScenario, heroAge: 9 });
  assert.deepEqual(batches.map((batch) => batch.act), [1, 2, 3]);
  assert.deepEqual(
    batches.map((batch) => batch.pages.filter((page) => page.page_type === "text").map((page) => page.scene_number)),
    [
      [1, 2, 3, 4, 5, 6],
      [7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
      [17, 18, 19, 20, 21],
    ],
  );
});

test("legacy scenarios keep their saved acts until they receive a versioned act contract", () => {
  const pages = createPagePlan(24);
  const approvedScenario = {
    scenes: pages.filter((page) => page.page_type === "image").map((page) => ({
      sceneNumber: page.scene_number,
      act: page.scene_number <= 2 ? 1 : page.scene_number <= 9 ? 2 : 3,
    })),
  };
  const batches = manuscriptBatches({ pages, approvedScenario, heroAge: 8 });
  assert.deepEqual(
    batches.map((batch) => batch.pages.filter((page) => page.page_type === "text").map((page) => page.scene_number)),
    [[1, 2], [3, 4, 5, 6, 7, 8, 9], [10, 11]],
  );

  const scoped = scopeAutomaticRepairCandidate({
    actPlanVersion: STORY_ACT_CONTRACT_VERSION,
    scenes: approvedScenario.scenes,
  }, approvedScenario, {
    publicSummary: { sceneNumbers: [2] },
  });
  assert.equal(Object.hasOwn(scoped, "actPlanVersion"), false);
});

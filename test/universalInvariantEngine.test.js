import assert from "node:assert/strict";
import test from "node:test";

import { createPagePlan } from "../src/config/bookStructure.js";
import {
  compileVisualComposition,
  wholeBookVisualRhythmIssues,
  visualCompositionPlanIssues,
} from "../src/services/visualCompositionPlan.js";
import {
  buildInvariantCounterexampleReport,
  invariantIssueCode,
  NARRATIVE_INVARIANT_DOMAINS,
  UNIVERSAL_INVARIANT_ENGINE_VERSION,
} from "../src/services/universalInvariantEngine.js";

const PAGE_COUNTS = [24, 28, 32, 36, 40, 44];
const TRANSITIONS = ["none", "ordinary_travel", "cross_passage", "return_travel"];
const PHASES = ["start", "during", "end"];
const UNIVERSES = ["forest", "ocean", "space", "dinosaurs", "castle", "everyday"];

function contractsFor(pageCount, transitionScene = 0, transitionKind = "none") {
  let previousCompositionId = "";
  return createPagePlan(pageCount)
    .filter((page) => page.page_type === "image")
    .map((page) => {
      const selectedTransition = Number(page.scene_number) === Number(transitionScene)
        ? transitionKind
        : "none";
      const composition = compileVisualComposition({
        sceneNumber: page.scene_number,
        storyRole: page.story_role,
        transitionKind: selectedTransition,
        visiblePhase: page.story_role === "return_home_and_moral" ? "end" : "during",
        visibleCharacterCount: 4,
        previousCompositionId,
      });
      previousCompositionId = composition.composition_id;
      return { scene_number: page.scene_number, visual_composition: composition };
    });
}

test("climax energy and passage topology compose instead of replacing one another", () => {
  for (const transitionKind of ["cross_passage", "return_travel"]) {
    const composition = compileVisualComposition({
      sceneNumber: 13,
      storyRole: "climax",
      transitionKind,
      visiblePhase: "during",
      visibleCharacterCount: 4,
    });
    assert.equal(composition.composition_id, "climax_low_action");
    assert.equal(composition.energy_level, 5);
    assert.match(composition.depth_plan, /departure side.*passage.*destination side/iu);
    assert.equal(composition.invariant_engine.version, UNIVERSAL_INVARIANT_ENGINE_VERSION);
    assert.equal(composition.invariant_engine.uniquePeakRequired, true);
    assert.equal(composition.invariant_engine.topologyOverlayRequired, true);
    assert.deepEqual(visualCompositionPlanIssues([{
      scene_number: 13,
      visual_composition: composition,
    }]), []);
  }
});

test("every sellable structure accepts every legal single-scene transition position", () => {
  let checkedBooks = 0;
  for (const pageCount of PAGE_COUNTS) {
    const sceneCount = (pageCount - 2) / 2;
    for (let transitionScene = 1; transitionScene <= sceneCount; transitionScene += 1) {
      for (const transitionKind of TRANSITIONS) {
        const contracts = contractsFor(pageCount, transitionScene, transitionKind);
        assert.deepEqual(
          wholeBookVisualRhythmIssues(contracts),
          [],
          `${pageCount} pages, scene ${transitionScene}, ${transitionKind}`,
        );
        checkedBooks += 1;
      }
    }
  }
  assert.equal(checkedBooks, 384);
});

test("every narrative role composes with every transition and visible phase", () => {
  const roles = [...new Set(PAGE_COUNTS.flatMap((pageCount) => (
    createPagePlan(pageCount).filter((page) => page.page_type === "image").map((page) => page.story_role)
  )))];
  let checkedCases = 0;
  for (const storyRole of roles) {
    for (const transitionKind of TRANSITIONS) {
      for (const visiblePhase of PHASES) {
        const composition = compileVisualComposition({
          sceneNumber: 7,
          storyRole,
          transitionKind,
          visiblePhase,
          visibleCharacterCount: 4,
        });
        assert.deepEqual(visualCompositionPlanIssues([{
          scene_number: 7,
          visual_composition: composition,
        }]), [], `${storyRole}, ${transitionKind}, ${visiblePhase}`);
        if (["cross_passage", "return_travel"].includes(transitionKind)
          && !(storyRole === "return_home_and_moral" && visiblePhase === "end")) {
          assert.match(composition.depth_plan, /departure side.*passage.*destination side/iu);
        }
        checkedCases += 1;
      }
    }
  }
  assert.equal(checkedCases, roles.length * TRANSITIONS.length * PHASES.length);
});

test("universe and language changes cannot alter identical mechanical constraints", () => {
  const baseline = compileVisualComposition({
    sceneNumber: 13,
    storyRole: "climax",
    transitionKind: "cross_passage",
    visiblePhase: "during",
    visibleCharacterCount: 3,
  });
  for (const universe of UNIVERSES) {
    for (const language of ["fr", "es", "en"]) {
      const candidate = compileVisualComposition({
        sceneNumber: 13,
        storyRole: "climax",
        transitionKind: "cross_passage",
        visiblePhase: "during",
        visibleCharacterCount: 3,
        universe,
        language,
      });
      assert.deepEqual(candidate, baseline, `${universe}/${language}`);
    }
  }
});

test("the invariant registry covers the independent V3 structural domains", () => {
  assert.deepEqual(NARRATIVE_INVARIANT_DOMAINS, [
    "narrative_role",
    "physical_topology",
    "cast_cardinality",
    "wardrobe_equipment",
    "object_lifecycle",
    "visual_composition",
  ]);
  assert.equal(invariantIssueCode("image contract projection loses visible cast"), "cast_cardinality_conflict");
  assert.equal(invariantIssueCode("scene 4 wardrobe state is invalid"), "wardrobe_equipment_conflict");
  assert.equal(invariantIssueCode("entity changes immutable quantity in scene 8"), "object_lifecycle_conflict");
  assert.equal(invariantIssueCode("scene 5 boundary topology is invalid"), "physical_topology_conflict");
});

test("counterexample memory is stable, reproducible and contains no customer content", () => {
  const contracts = contractsFor(32, 13, "cross_passage");
  const report = buildInvariantCounterexampleReport({
    stage: "storyboard_binding",
    issues: ["whole-book visual climax does not carry the unique peak composition"],
    sceneContracts: contracts,
  });
  const replay = buildInvariantCounterexampleReport({
    stage: "storyboard_binding",
    issues: ["whole-book visual climax does not carry the unique peak composition"],
    sceneContracts: structuredClone(contracts),
  });
  assert.equal(report.fingerprint, replay.fingerprint);
  assert.deepEqual(report.issueCodes, ["visual_peak_conflict"]);
  assert.equal(report.privacy, "structural_only_no_story_text_names_or_assets");
  assert.equal(report.cases.length, 15);
  assert.doesNotMatch(JSON.stringify(report), /Mathéo|Nolan|customer|manuscript|photo|asset_url/iu);
});

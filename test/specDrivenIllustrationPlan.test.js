import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { visualQualityDisposition } from "../src/services/imageQualityGate.js";
import {
  visualCompositionPlanIssues,
  VISUAL_COMPOSITION_PLAN_VERSION,
} from "../src/services/visualCompositionPlan.js";
import {
  bindStoryboardPageTexts,
  compileSpecDrivenIllustrationPlan,
  manuscriptVisualBeatForScene,
  SPEC_DRIVEN_ILLUSTRATION_CONTRACT_SOURCE,
  storyboardAdjacentHandoffIssues,
  storyboardBindingIssues,
  STORYBOARD_FIRST_CONTRACT_VERSION,
} from "../src/services/specDrivenIllustrationPlan.js";

const spec = JSON.parse(fs.readFileSync(
  new URL("../src/contracts/narrativeBookSpec.v1.example.json", import.meta.url),
  "utf8",
));

function blueprintFromSpec() {
  return {
    pages: spec.scenes.flatMap((scene) => ([
      {
        page_number: scene.pageBinding.textPageNumber,
        page_type: "text",
        spread_number: scene.sceneNumber,
        scene_number: scene.sceneNumber,
      },
      {
        page_number: scene.pageBinding.imagePageNumber,
        page_type: "image",
        spread_number: scene.sceneNumber,
        scene_number: scene.sceneNumber,
      },
    ])),
  };
}

test("illustration contracts are compiled without a second narrative model", () => {
  const plan = compileSpecDrivenIllustrationPlan({
    spec,
    blueprint: blueprintFromSpec(),
    pageTexts: { 2: "Bastien et Maman observent l'arche." },
  });
  assert.equal(plan.contractSource, SPEC_DRIVEN_ILLUSTRATION_CONTRACT_SOURCE);
  assert.equal(plan.artifactDigest, spec.validation.artifactDigest);
  assert.equal(plan.compiler.source, "deterministic");
  assert.equal(plan.sceneContracts.length, spec.scenes.length);
  const first = plan.sceneContracts[0];
  assert.deepEqual(first.named_characters.map((entry) => entry.name), ["Bastien", "Marie"]);
  assert.ok(first.forbidden_elements.some((entry) => /Fleur du lien/u.test(entry)));
  assert.ok(first.forbidden_elements.some((entry) => /For.t Fairy|F.e de la For.t/u.test(entry)));
  assert.equal(first.quality_policy.blocking.includes("identity_fusion_or_duplication"), true);
  assert.equal(first.render_snapshot.visible_phase, "after");
  assert.equal(first.render_snapshot.location, "le jardin");
  assert.equal(first.visual_composition.version, VISUAL_COMPOSITION_PLAN_VERSION);
  assert.ok(first.visual_composition.composition_id);
  assert.deepEqual(visualCompositionPlanIssues(plan.sceneContracts), []);
});

test("deterministic compositions vary adjacent scenes without changing their canonical action", () => {
  const plan = compileSpecDrivenIllustrationPlan({ spec, blueprint: blueprintFromSpec() });
  assert.notEqual(
    plan.sceneContracts[0].visual_composition.composition_id,
    plan.sceneContracts[1].visual_composition.composition_id,
  );
  assert.deepEqual(
    plan.sceneContracts.map((contract) => contract.main_action),
    compileSpecDrivenIllustrationPlan({ spec, blueprint: blueprintFromSpec() })
      .sceneContracts.map((contract) => contract.main_action),
  );
});

test("visual beats are sealed before prose and text binding cannot change them", () => {
  const storyboard = compileSpecDrivenIllustrationPlan({
    spec,
    blueprint: blueprintFromSpec(),
    pageTexts: {},
  });
  const firstBefore = manuscriptVisualBeatForScene(storyboard, 1);
  assert.equal(storyboard.storyboardFirstVersion, STORYBOARD_FIRST_CONTRACT_VERSION);
  assert.equal(firstBefore.version, STORYBOARD_FIRST_CONTRACT_VERSION);
  assert.equal(storyboard.sceneContracts[0].source_prose, "");

  const pageNumber = storyboard.sceneContracts[0].text_page_number;
  const texts = Object.fromEntries(storyboard.sceneContracts.map((contract) => ([
    contract.text_page_number,
    contract.text_page_number === pageNumber
      ? "Le texte suit exactement l'image prévue."
      : `Texte canonique de la scène ${contract.scene_number}.`,
  ])));
  const bound = bindStoryboardPageTexts(storyboard, texts);
  assert.deepEqual(manuscriptVisualBeatForScene(bound, 1), firstBefore);
  assert.equal(bound.sceneContracts[0].source_prose, "Le texte suit exactement l'image prévue.");
  assert.equal(storyboard.sceneContracts[0].source_prose, "");
  assert.deepEqual(storyboardBindingIssues(
    bound,
    bound.pageTexts,
    spec.validation.artifactDigest,
  ), []);
});

test("binding integrity rejects visual mutation, stale artifacts and mismatched page text", () => {
  const storyboard = compileSpecDrivenIllustrationPlan({ spec, blueprint: blueprintFromSpec() });
  const texts = Object.fromEntries(storyboard.sceneContracts.map((contract) => ([
    contract.text_page_number,
    `Canonical text for scene ${contract.scene_number}`,
  ])));
  const bound = bindStoryboardPageTexts(storyboard, texts);
  bound.sceneContracts[0].main_action.verb = "invented mutation";
  const issues = storyboardBindingIssues(bound, {
    ...texts,
    [bound.sceneContracts[1].text_page_number]: "different text",
  }, "stale-artifact");
  assert.ok(issues.includes("storyboard artifact digest is stale"));
  assert.ok(issues.includes("scene 1 visual beat integrity failed"));
  assert.ok(issues.includes("scene 2 manuscript binding does not match its text page"));
});

test("current storyboard binding rejects a missing or repeated composition plan", () => {
  const storyboard = compileSpecDrivenIllustrationPlan({ spec, blueprint: blueprintFromSpec() });
  const texts = Object.fromEntries(storyboard.sceneContracts.map((contract) => ([
    contract.text_page_number,
    `Canonical text for scene ${contract.scene_number}`,
  ])));
  const bound = bindStoryboardPageTexts(storyboard, texts);
  bound.sceneContracts[1].visual_composition = structuredClone(bound.sceneContracts[0].visual_composition);
  const issues = storyboardBindingIssues(bound, texts, spec.validation.artifactDigest);
  assert.ok(issues.includes("scene 2 repeats the previous visual composition"));
  assert.ok(issues.includes("scene 2 visual beat integrity failed"));
});

test("adjacent beats hand off exact locations, registries and non-overlapping pages", () => {
  const storyboard = compileSpecDrivenIllustrationPlan({ spec, blueprint: blueprintFromSpec() });
  assert.deepEqual(storyboardAdjacentHandoffIssues(storyboard), []);

  const broken = structuredClone(storyboard);
  broken.sceneContracts[1].causal_frame.before.location = "an unrelated place";
  broken.sceneContracts[1].object_states.pop();
  broken.sceneContracts[1].text_page_number = broken.sceneContracts[0].image_page_number;
  const issues = storyboardAdjacentHandoffIssues(broken);
  assert.ok(issues.includes("scene 1 location does not hand off to scene 2"));
  assert.ok(issues.includes("scene 1 object registry does not hand off to scene 2"));
  assert.ok(issues.includes("scene 1 page binding overlaps scene 2"));
});

test("preview compiles and checkpoints visual beats before manuscript batches", () => {
  const source = fs.readFileSync(new URL("../src/routes/preview.js", import.meta.url), "utf8");
  const storyboardIndex = source.indexOf("phase: \"storyboard:visual-beats\"");
  const manuscriptIndex = source.indexOf("const batches = manuscriptBatches");
  const bindingIndex = source.indexOf("bindStoryboardPageTexts(visualStoryboard");
  const verificationIndex = source.indexOf("storyboardBindingIssues(");
  const imageStepIndex = source.indexOf("updateJob(job.id, { step: \"draft:cover\" }");
  assert.ok(storyboardIndex > 0);
  assert.ok(storyboardIndex < manuscriptIndex);
  assert.ok(bindingIndex > manuscriptIndex);
  assert.ok(verificationIndex > bindingIndex);
  assert.ok(verificationIndex < imageStepIndex);
  assert.match(source, /manuscriptBatches\(\{[\s\S]*visualStoryboard,/u);
});

test("illustration roles distinguish travelers from local supporters", () => {
  const localSpec = structuredClone(spec);
  localSpec.registries.characters.push({
    id: "papa",
    canonicalName: "Papa",
    relationship: "father",
    storyRole: "supporter",
    initialLocationId: localSpec.scenes[0].timeline.locationAfterId,
    familyAddress: "Papa",
    visualIdentityId: "",
    outfitContractId: "",
  });
  localSpec.scenes[0].presences.push({
    characterId: "papa",
    mode: "physical",
    phase: localSpec.scenes[0].timeline.visiblePhase,
    locationId: localSpec.scenes[0].timeline.locationAfterId,
    action: "waves goodbye and remains at the launch location",
  });
  localSpec.scenes[0].illustration.visibleCharacterIds.push("papa");
  const plan = compileSpecDrivenIllustrationPlan({
    spec: localSpec,
    blueprint: blueprintFromSpec(),
  });
  const papa = plan.sceneContracts[0].named_characters.find((character) => character.name === "Papa");
  assert.match(papa.visual_role, /local supporter/);
  assert.doesNotMatch(papa.visual_role, /traveler$/);
});

test("visual severity blocks mechanics but keeps preferences repairable", () => {
  const style = visualQualityDisposition({ styleIssues: ["The watercolor is flatter than the cover."] });
  assert.equal(style.severity, "repairable");
  assert.deepEqual(style.blocking, []);

  const mechanics = visualQualityDisposition({
    sceneIssues: ["Required named character Marie is missing."],
  });
  assert.equal(mechanics.severity, "blocking");
  assert.equal(mechanics.blocking.length, 1);

  const technical = visualQualityDisposition({
    technicalApproved: false,
    technicalIssues: ["The image has a fused human-animal body."],
  });
  assert.equal(technical.severity, "blocking");
});

test("likeness-only findings are advisory while objective identity failures remain blocking", () => {
  const likeness = visualQualityDisposition({
    identityIssues: ["The dog's coat markings differ slightly from the reference portrait."],
  });
  assert.equal(likeness.severity, "advisory");
  assert.deepEqual(likeness.repairable, []);
  assert.equal(likeness.advisory.length, 1);

  const substitution = visualQualityDisposition({
    sceneIssues: ["Required named animal Kovu is missing and replaced by a human child."],
    identityIssues: ["Kovu's coat is different from the reference portrait."],
  });
  assert.equal(substitution.severity, "blocking");
  assert.equal(substitution.blocking.length, 1);
});

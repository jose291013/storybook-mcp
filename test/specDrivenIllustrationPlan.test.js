import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { visualQualityDisposition } from "../src/services/imageQualityGate.js";
import {
  compileSpecDrivenIllustrationPlan,
  SPEC_DRIVEN_ILLUSTRATION_CONTRACT_SOURCE,
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

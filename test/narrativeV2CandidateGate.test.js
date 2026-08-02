import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalGateRepairDirectives,
  canonicalGateValidation,
  compileNarrativeV2Candidate,
} from "../src/services/narrativeV2CandidateGate.js";
import { NarrativeBookSpecCompileError } from "../src/contracts/compileNarrativeBookSpec.js";
import { hasCurrentStoryScenarioAuditEvidence } from "../src/services/storyScenario.js";

function project() {
  return {
    id: "candidate-project",
    locale: "ES",
    questionnaire: {
      age: 8,
      language: "ES",
      page_count: 24,
      universe_id: "cloud_castle",
      child_safety_profile: {
        version: 2,
        category: "general",
        action: "allow",
        restricted: false,
      },
      story_sensitivity_profile: {
        version: 2,
        level: 1,
        category: "everyday_challenge",
        restricted: false,
      },
    },
  };
}

test("the mechanical pre-review gate refreshes stale audit metadata without mutating the proposal", () => {
  const scenario = {
    status: "proposed",
    revision: 0,
    title: "Candidate awaiting editorial audit",
    auditEvidence: {
      version: 1,
      status: "approved",
      digest: "a".repeat(64),
      auditedAt: "2026-07-31T10:00:00.000Z",
    },
  };
  let received = null;
  const result = compileNarrativeV2Candidate({ project: project(), scenario }, {
    now: () => "2026-08-01T10:00:00.000Z",
    compile: (input) => {
      received = input;
      return {
        sourceScenario: { digest: "b".repeat(64) },
        validation: {
          artifactDigest: "c".repeat(64),
          compilerVersion: 1,
          mechanicalValidatorVersion: 1,
        },
      };
    },
  });

  assert.equal(result.valid, true);
  assert.equal(received.scenario.status, "approved");
  assert.equal(received.scenario.revision, 1);
  assert.equal(hasCurrentStoryScenarioAuditEvidence(received.scenario), true);
  assert.notEqual(received.scenario.auditEvidence.digest, scenario.auditEvidence.digest);
  assert.equal(received.book.language, "ES");
  assert.equal(scenario.status, "proposed");
  assert.equal(scenario.auditEvidence.digest, "a".repeat(64));
  assert.equal(result.evidence.artifactDigest, "c".repeat(64));
});

test("compiler failures become bounded internal validation and repair directives", () => {
  const result = compileNarrativeV2Candidate({
    project: project(),
    scenario: { status: "proposed" },
  }, {
    compile: () => {
      throw new NarrativeBookSpecCompileError([{
        code: "object_changed_without_causal_event",
        path: "scenes[3].objectStates[0]",
        message: "The doll changes state without one declared event.",
      }]);
    },
  });
  const validation = canonicalGateValidation(result);
  const directives = canonicalGateRepairDirectives(result);

  assert.equal(result.valid, false);
  assert.equal(validation.valid, false);
  assert.equal(validation.diagnostics[0].sceneNumber, 4);
  assert.equal(directives[0].type, "canonical_compile_repair");
  assert.deepEqual(directives[0].affectedSceneNumbers, [4]);
  assert.match(directives[0].instruction, /doll changes state/);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  NarrativeBookSpecCompileError,
} from "../src/contracts/compileNarrativeBookSpec.js";
import {
  canonicalNarrativeV2Safety,
  compileNarrativeV2Shadow,
  narrativeV2ShadowEnabled,
} from "../src/services/narrativeV2Shadow.js";

function project() {
  return {
    id: "project-shadow-test",
    locale: "FR",
    questionnaire: {
      age: 8,
      language: "FR",
      page_count: 24,
      universe_id: "dinosaur_valley",
      child_safety_profile: {
        version: 2,
        category: "general",
        action: "allow",
        restricted: false,
      },
      story_sensitivity_profile: {
        version: 2,
        level: 2,
        category: "emotional_challenge",
        restricted: false,
      },
    },
  };
}

test("shadow compilation is off unless both observe mode and project allowlist match", () => {
  assert.equal(narrativeV2ShadowEnabled("project-1", {
    mode: "off",
    projectIds: "project-1",
  }), false);
  assert.equal(narrativeV2ShadowEnabled("project-1", {
    mode: "observe",
    projectIds: "",
  }), false);
  assert.equal(narrativeV2ShadowEnabled("project-1", {
    mode: "observe",
    projectIds: "project-2,project-1",
  }), true);
});

test("shadow compilation stores a private canonical artifact and bounded comparison", () => {
  let received = null;
  const result = compileNarrativeV2Shadow({
    project: project(),
    scenario: { auditEvidence: { digest: "a".repeat(64) } },
  }, {
    now: () => "2026-07-31T10:00:00.000Z",
    compile: (input) => {
      received = input;
      return {
        sourceScenario: { digest: "b".repeat(64) },
        validation: {
          artifactDigest: "c".repeat(64),
          compilerVersion: 1,
          mechanicalValidatorVersion: 1,
        },
        scenes: [{ id: "scene_1" }],
        registries: {
          characters: [{ id: "hero" }],
          objects: [],
          passages: [],
        },
      };
    },
  });

  assert.equal(result.status, "compiled");
  assert.equal(result.artifactDigest, "c".repeat(64));
  assert.deepEqual(result.comparison, {
    sceneCount: 1,
    characterCount: 1,
    objectCount: 0,
    passageCount: 0,
  });
  assert.equal(result.spec.validation.artifactDigest, "c".repeat(64));
  assert.equal(received.book.universeId, "dinosaur_valley");
  assert.equal(received.safety.sensitivity.approach, "gentle_action_led");
});

test("shadow compilation records codes and paths without compiler explanations", () => {
  const result = compileNarrativeV2Shadow({
    project: project(),
    scenario: { auditEvidence: { digest: "d".repeat(64) } },
  }, {
    compile: () => {
      throw new NarrativeBookSpecCompileError([{
        code: "object_changed_without_causal_event",
        path: "scenes[2].objectStates[0]",
        message: "Private object and character wording must not be persisted in diagnostics.",
      }]);
    },
  });

  assert.equal(result.status, "rejected");
  assert.deepEqual(result.issues, [{
    code: "object_changed_without_causal_event",
    path: "scenes[2].objectStates[0]",
  }]);
  assert.equal(JSON.stringify(result).includes("Private object"), false);
});

test("canonical safety refuses missing profiles instead of fabricating an allow decision", () => {
  assert.throws(
    () => canonicalNarrativeV2Safety({ questionnaire: {} }),
    /child_safety_profile_missing_or_restricted/,
  );
});

test("scenario approval hook remains fail-open and shadow-gated", async () => {
  const route = await import("node:fs/promises").then((fs) => (
    fs.readFile("src/routes/storyScenario.js", "utf8")
  ));
  assert.match(route, /narrativeV2ShadowEnabled\(project\.id\)/);
  assert.match(route, /compileNarrativeV2Shadow\(\{ project, scenario: approved \}\)/);
  assert.match(route, /status: "ready_for_preview"/);
});

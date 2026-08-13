import assert from "node:assert/strict";
import test from "node:test";
import {
  runCanonicalCandidateGate,
  runScenarioQualityDialogue,
} from "../src/services/storyScenarioGeneration.js";

const policy = {
  editorCalls: 1,
  structuralRepairCalls: 1,
  editorialRepairCalls: 1,
  finalAuditCalls: 1,
};

test("a structural repair never consumes the independent editorial repair", async () => {
  const calls = [];
  const result = await runScenarioQualityDialogue({
    initialScenario: { revision: "architect" },
    initialValidation: { valid: false, issues: ["mechanical contradiction"] },
    policy,
    repairStructural: async ({ attempt }) => {
      calls.push(`structural:${attempt}`);
      return {
        scenario: { revision: "structurally-repaired" },
        validation: { valid: true, issues: [] },
        repairDirectives: [],
      };
    },
    auditEditorial: async ({ scenario, attempt, final }) => {
      calls.push(`${final ? "final" : "editor"}:${attempt}:${scenario.revision}`);
      return final
        ? {
          scenario: { revision: "audited" },
          validation: { valid: true, issues: [] },
          repairDirectives: [],
        }
        : {
          scenario,
          validation: { valid: false, issues: ["repeated acquisition"] },
          repairDirectives: [{ code: "remove_repeated_acquisition" }],
        };
    },
    repairEditorial: async ({ repairDirectives, attempt }) => {
      calls.push(`editorial:${attempt}:${repairDirectives[0].code}`);
      return {
        scenario: { revision: "editorially-repaired" },
        validation: { valid: true, issues: [] },
        repairDirectives,
      };
    },
  });

  assert.deepEqual(calls, [
    "structural:1",
    "editor:1:structurally-repaired",
    "editorial:1:remove_repeated_acquisition",
    "final:2:editorially-repaired",
  ]);
  assert.equal(result.validation.valid, true);
  assert.equal(result.scenario.revision, "audited");
});

test("the publication gate reserves an editorial repair after mechanical repair", async () => {
  const calls = [];
  const result = await runScenarioQualityDialogue({
    initialScenario: { revision: "architect" },
    initialValidation: { valid: false, issues: ["mechanical contradiction"] },
    policy,
    repairBudget: { remaining: 1 },
    editorialRepairBudget: { remaining: 1 },
    repairStructural: async () => {
      calls.push("structural-repair");
      return {
        scenario: { revision: "structurally-repaired" },
        validation: { valid: true, issues: [] },
        repairDirectives: [],
      };
    },
    auditEditorial: async ({ scenario, final }) => {
      calls.push("editor");
      if (final) {
        return {
          scenario: { revision: "audited" },
          validation: { valid: true, issues: [] },
          repairDirectives: [],
        };
      }
      return {
        scenario,
        validation: { valid: false, issues: ["semantic contradiction"] },
        repairDirectives: [{ code: "semantic_repair" }],
      };
    },
    repairEditorial: async () => {
      calls.push("editorial-repair");
      return {
        scenario: { revision: "editorially-repaired" },
        validation: { valid: true, issues: [] },
        repairDirectives: [],
      };
    },
  });

  assert.deepEqual(calls, ["structural-repair", "editor", "editorial-repair", "editor"]);
  assert.equal(result.validation.valid, true);
});

test("the canonical contract receives the shared repair before editorial review", async () => {
  const calls = [];
  const repairBudget = { remaining: 1 };
  const result = await runScenarioQualityDialogue({
    initialScenario: { revision: "architect" },
    initialValidation: { valid: true, issues: [] },
    policy,
    repairBudget,
    repairStructural: async () => assert.fail("structural repair must not run"),
    beforeEditorial: async ({ scenario, validation }) => {
      calls.push("canonical-preflight");
      const gated = await runCanonicalCandidateGate({
        scenario,
        validation,
        policy: { canonicalRepairCalls: 1, canonicalFinalAuditCalls: 1 },
        repairBudget,
        check: (candidate) => candidate.revision === "canonical"
          ? { valid: true, evidence: { artifactDigest: "digest" } }
          : {
            valid: false,
            validation: { valid: false, issues: ["ambiguous object events"] },
            repairDirectives: [{ code: "canonical_object_repair" }],
          },
        repair: async () => {
          calls.push("canonical-repair");
          return {
            scenario: { revision: "repaired" },
            validation: { valid: true, issues: [] },
          };
        },
        finalAudit: async () => {
          calls.push("final-audit");
          return {
            scenario: { revision: "canonical" },
            validation: { valid: true, issues: [] },
          };
        },
      });
      return { ...gated, skipEditorial: gated.finalAuditAttempted };
    },
    auditEditorial: async () => assert.fail("the canonical final audit already reviewed the repair"),
    repairEditorial: async () => assert.fail("editorial repair must not run"),
  });

  assert.deepEqual(calls, ["canonical-preflight", "canonical-repair", "final-audit"]);
  assert.equal(repairBudget.remaining, 0);
  assert.equal(result.validation.valid, true);
  assert.equal(result.beforeEditorialResult.evidence.artifactDigest, "digest");
});

test("an editorial repair cannot be accepted without its final audit", async () => {
  const result = await runScenarioQualityDialogue({
    initialScenario: { revision: "architect" },
    initialValidation: { valid: true, issues: [] },
    policy: { ...policy, finalAuditCalls: 0 },
    repairStructural: async () => assert.fail("structural repair must not run"),
    auditEditorial: async ({ final }) => {
      assert.equal(final, false);
      return {
        scenario: { revision: "rejected" },
        validation: { valid: false, issues: ["semantic contradiction"] },
        repairDirectives: [{ code: "semantic_repair" }],
      };
    },
    repairEditorial: async () => ({
      scenario: { revision: "repaired" },
      validation: { valid: true, issues: [] },
      repairDirectives: [],
    }),
  });

  assert.equal(result.validation.valid, false);
  assert.deepEqual(result.validation.issues, [
    "scenario final semantic audit is required after editorial repair",
  ]);
});

test("a failed final audit remains blocking after the bounded editorial repair", async () => {
  let auditCalls = 0;
  const result = await runScenarioQualityDialogue({
    initialScenario: { revision: "architect" },
    initialValidation: { valid: true, issues: [] },
    policy,
    repairStructural: async () => assert.fail("structural repair must not run"),
    auditEditorial: async ({ scenario }) => {
      auditCalls += 1;
      return auditCalls === 1
        ? {
          scenario,
          validation: { valid: false, issues: ["semantic contradiction"] },
          repairDirectives: [{ code: "semantic_repair" }],
        }
        : {
          scenario,
          validation: { valid: false, issues: ["semantic contradiction remains"] },
          repairDirectives: [],
        };
    },
    repairEditorial: async () => ({
      scenario: { revision: "repaired" },
      validation: { valid: true, issues: [] },
      repairDirectives: [],
    }),
  });

  assert.equal(auditCalls, 2);
  assert.equal(result.validation.valid, false);
  assert.deepEqual(result.validation.issues, ["semantic contradiction remains"]);
});

test("the canonical pre-review gate repairs internally and never delegates mechanics to the creator", async () => {
  const calls = [];
  const result = await runCanonicalCandidateGate({
    scenario: { revision: "audited" },
    validation: { valid: true, issues: [] },
    policy: { canonicalRepairCalls: 1, canonicalFinalAuditCalls: 1 },
    check: (scenario) => scenario.revision === "final"
      ? { valid: true, evidence: { artifactDigest: "digest" } }
      : {
        valid: false,
        validation: { valid: false, issues: ["canonical object contradiction"] },
        repairDirectives: [{ code: "canonical_object_repair" }],
      },
    repair: async ({ repairDirectives }) => {
      calls.push(`repair:${repairDirectives[0].code}`);
      return {
        scenario: { revision: "repaired" },
        validation: { valid: true, issues: [] },
      };
    },
    finalAudit: async () => {
      calls.push("final-audit");
      return {
        scenario: { revision: "final" },
        validation: { valid: true, issues: [] },
      };
    },
  });

  assert.deepEqual(calls, ["repair:canonical_object_repair", "final-audit"]);
  assert.equal(result.evidence.artifactDigest, "digest");
});

test("a repaired canonical candidate preserves a final semantic rejection instead of reporting a compiler failure", async () => {
  const result = await runCanonicalCandidateGate({
    scenario: { revision: "audited" },
    validation: { valid: true, issues: [] },
    policy: { canonicalRepairCalls: 1, canonicalFinalAuditCalls: 1 },
    check: (scenario) => scenario.revision === "repaired"
      ? { valid: true, evidence: { artifactDigest: "digest" } }
      : {
        valid: false,
        issues: [{
          code: "ambiguous_passage_endpoints",
          path: "registries.passages",
          sceneNumber: 0,
        }],
        validation: { valid: false, issues: ["hidden mechanical defect"] },
        repairDirectives: [{ code: "repair_passage" }],
      },
    repair: async () => ({
      scenario: { revision: "repaired" },
      validation: { valid: true, issues: [] },
    }),
    finalAudit: async ({ scenario }) => ({
      scenario,
      validation: {
        valid: false,
        issues: ["scene-7: guide_action: The guide resolves the climax"],
        diagnostics: [{ code: "guide_action", sceneNumber: 7 }],
      },
    }),
  });

  assert.equal(result.semanticAuditRejected, true);
  assert.equal(result.evidence, null);
  assert.equal(result.validation.valid, false);
  assert.deepEqual(result.validation.issues, [
    "scene-7: guide_action: The guide resolves the climax",
  ]);
});

test("an exhausted shared repair budget prevents a later canonical repair call", async () => {
  await assert.rejects(() => runCanonicalCandidateGate({
    scenario: { revision: "audited" },
    validation: { valid: true, issues: [] },
    policy: { canonicalRepairCalls: 1, canonicalFinalAuditCalls: 1 },
    repairBudget: { remaining: 0 },
    check: () => ({
      valid: false,
      issues: [{ code: "passage_discovery_missing", path: "scenes[10].transition", sceneNumber: 11 }],
      validation: { valid: false, issues: ["hidden"] },
    }),
    repair: async () => assert.fail("canonical repair must not run"),
    finalAudit: async () => assert.fail("final audit must not run"),
  }), (error) => {
    assert.equal(error.code, "scenario_contract_invalid");
    assert.equal(error.canonicalDiagnostics.repairAttempted, false);
    assert.equal(error.canonicalDiagnostics.repairBlockedByBudget, true);
    assert.match(error.message, /shared repair budget was already exhausted/);
    return true;
  });
});

test("an unresolved canonical defect fails internally instead of producing red creator cards", async () => {
  await assert.rejects(() => runCanonicalCandidateGate({
    scenario: { revision: "audited" },
    validation: { valid: true, issues: [] },
    policy: { canonicalRepairCalls: 0, canonicalFinalAuditCalls: 0 },
    check: () => ({ valid: false, validation: { valid: false, issues: ["hidden"] } }),
    repair: async () => assert.fail("repair disabled"),
    finalAudit: async () => assert.fail("audit disabled"),
  }), (error) => {
    assert.equal(error.code, "scenario_contract_invalid");
    assert.deepEqual(error.canonicalDiagnostics, {
      version: 1,
      repairAttempted: false,
      finalAuditAttempted: false,
      initialIssues: [],
      finalIssues: [],
    });
    return true;
  });
});

test("canonical diagnostics retain only bounded technical coordinates", async () => {
  await assert.rejects(() => runCanonicalCandidateGate({
    scenario: { revision: "audited" },
    validation: { valid: true, issues: [] },
    policy: { canonicalRepairCalls: 0, canonicalFinalAuditCalls: 0 },
    check: () => ({
      valid: false,
      validation: { valid: false, issues: ["private story prose"] },
      issues: [{
        code: "unknown character!",
        path: "scenes[4].presences[0] / private name",
        sceneNumber: 5,
        explanation: "This private sentence must never be persisted.",
      }],
    }),
    repair: async () => assert.fail("repair disabled"),
    finalAudit: async () => assert.fail("audit disabled"),
  }), (error) => {
    assert.deepEqual(error.canonicalDiagnostics.finalIssues, [{
      code: "unknown_character_",
      path: "scenes[4].presences[0]_private_name",
      sceneNumber: 5,
    }]);
    assert.equal(JSON.stringify(error.canonicalDiagnostics).includes("private sentence"), false);
    return true;
  });
});

test("a canonical repair that breaks semantic validation still fails privately", async () => {
  await assert.rejects(() => runCanonicalCandidateGate({
    scenario: { revision: "audited" },
    validation: { valid: true, issues: [] },
    policy: { canonicalRepairCalls: 1, canonicalFinalAuditCalls: 1 },
    check: () => ({
      valid: false,
      validation: { valid: false, issues: ["mechanical defect"] },
      issues: [{ code: "unknown_location", path: "scenes[2].locationId", sceneNumber: 3 }],
      repairDirectives: [{ code: "repair_location" }],
    }),
    repair: async () => ({
      scenario: { revision: "semantically-broken" },
      validation: { valid: false, issues: ["private semantic defect"] },
    }),
    finalAudit: async () => assert.fail("invalid repair must not receive final audit"),
  }), (error) => {
    assert.equal(error.code, "scenario_contract_invalid");
    assert.equal(error.canonicalDiagnostics.repairAttempted, true);
    assert.equal(error.canonicalDiagnostics.finalAuditAttempted, false);
    return true;
  });
});

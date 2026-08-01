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

test("one shared repair budget prevents structural and editorial repair cascades", async () => {
  const calls = [];
  const result = await runScenarioQualityDialogue({
    initialScenario: { revision: "architect" },
    initialValidation: { valid: false, issues: ["mechanical contradiction"] },
    policy,
    repairBudget: { remaining: 1 },
    repairStructural: async () => {
      calls.push("structural-repair");
      return {
        scenario: { revision: "structurally-repaired" },
        validation: { valid: true, issues: [] },
        repairDirectives: [],
      };
    },
    auditEditorial: async ({ scenario }) => {
      calls.push("editor");
      return {
        scenario,
        validation: { valid: false, issues: ["semantic contradiction"] },
        repairDirectives: [{ code: "semantic_repair" }],
      };
    },
    repairEditorial: async () => assert.fail("the shared budget is exhausted"),
  });

  assert.deepEqual(calls, ["structural-repair", "editor"]);
  assert.equal(result.validation.valid, false);
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

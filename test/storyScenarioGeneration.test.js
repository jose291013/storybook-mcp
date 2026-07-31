import assert from "node:assert/strict";
import test from "node:test";
import { runScenarioQualityDialogue } from "../src/services/storyScenarioGeneration.js";

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

import test from "node:test";
import assert from "node:assert/strict";
import {
  BLUEPRINT_QA_CHECKPOINT_VERSION,
  blueprintQaCheckpoint,
  blueprintQaIssueCodes,
  isBlueprintProviderInterruption,
  tagBlueprintProviderInterruption,
} from "../src/services/blueprintQaCheckpoint.js";

test("blueprint QA diagnostics persist only bounded issue families", () => {
  const qa = {
    qa: {
      status: "fix_needed",
      issues: [
        "A named companion is physically present but missing from cast_present.",
        "Underwater breathing protection is missing.",
      ],
      fixes: [
        { path: "/pages/4/image_prompt", instruction: "Respect gravity and buoyancy." },
        { path: "/pages/4/image_prompt", instruction: "Respect gravity and buoyancy." },
      ],
    },
  };

  assert.deepEqual(blueprintQaIssueCodes(qa), [
    "character_cast",
    "underwater_safety",
    "world_physics",
  ]);
  assert.deepEqual(blueprintQaCheckpoint({
    status: "repairing",
    attempt: 2,
    qa,
    now: "2026-08-22T10:00:00.000Z",
  }), {
    version: BLUEPRINT_QA_CHECKPOINT_VERSION,
    status: "repairing",
    attempt: 2,
    issueCodes: ["character_cast", "underwater_safety", "world_physics"],
    updatedAt: "2026-08-22T10:00:00.000Z",
  });
});

test("blueprint provider timeouts become recoverable preview interruptions", () => {
  const timeout = new Error("Request timed out.");
  assert.equal(isBlueprintProviderInterruption(timeout), true);
  assert.equal(tagBlueprintProviderInterruption(timeout, "blueprint_repair"), timeout);
  assert.equal(timeout.code, "preview_interrupted");
  assert.equal(timeout.artifactType, "blueprint_repair");

  const durableTimeout = Object.assign(new Error("durable wait exceeded"), {
    code: "scenario_background_timeout",
  });
  assert.equal(isBlueprintProviderInterruption(durableTimeout), true);

  const contractError = Object.assign(new Error("Blueprint contract invalid"), {
    code: "blueprint_contract_invalid",
  });
  tagBlueprintProviderInterruption(contractError);
  assert.equal(contractError.code, "blueprint_contract_invalid");

  const quotaError = Object.assign(new Error("quota"), {
    status: 429,
    error: { code: "insufficient_quota" },
  });
  assert.equal(isBlueprintProviderInterruption(quotaError), false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { modelRoute } from "../src/services/modelRouting.js";

const VARIABLES = [
  "TEXT_MODEL",
  "STORY_ARCHITECT_MODEL",
  "STORY_ARCHITECT_REASONING_EFFORT",
  "STORY_EDITOR_MODEL",
  "STORY_EDITOR_REASONING_EFFORT",
  "STORY_REPAIR_MODEL",
  "STORY_REPAIR_REASONING_EFFORT",
  "STORY_AUDITOR_MODEL",
  "STORY_AUDITOR_REASONING_EFFORT",
  "MANUSCRIPT_EDITOR_MODEL",
  "MANUSCRIPT_EDITOR_REASONING_EFFORT",
];

function withCleanEnvironment(callback) {
  const previous = Object.fromEntries(VARIABLES.map((name) => [name, process.env[name]]));
  for (const name of VARIABLES) delete process.env[name];
  try {
    callback();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("quality-first defaults separate architect and editor from legacy text calls", () => {
  withCleanEnvironment(() => {
    assert.deepEqual(modelRoute("story_architect"), {
      role: "story_architect",
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      api: "responses",
    });
    assert.equal(modelRoute("story_editor").model, "gpt-5.6-sol");
    assert.deepEqual(modelRoute("story_repair"), {
      role: "story_repair",
      model: "gpt-5.6-terra",
      reasoningEffort: "medium",
      api: "responses",
    });
    assert.deepEqual(modelRoute("story_auditor"), {
      role: "story_auditor",
      model: "gpt-5.6-terra",
      reasoningEffort: "high",
      api: "responses",
    });
    assert.equal(modelRoute("").model, "gpt-4.1-mini");
    assert.equal(modelRoute("").api, "chat_completions");
  });
});

test("Render can override a narrative role without changing source code", () => {
  withCleanEnvironment(() => {
    process.env.STORY_ARCHITECT_MODEL = "custom-story-model";
    process.env.STORY_ARCHITECT_REASONING_EFFORT = "xhigh";
    assert.equal(modelRoute("story_architect").model, "custom-story-model");
    assert.equal(modelRoute("story_architect").reasoningEffort, "xhigh");
    process.env.STORY_ARCHITECT_REASONING_EFFORT = "unsupported";
    assert.equal(modelRoute("story_architect").reasoningEffort, "high");
    process.env.STORY_AUDITOR_MODEL = "custom-auditor";
    process.env.STORY_AUDITOR_REASONING_EFFORT = "medium";
    assert.equal(modelRoute("story_auditor").model, "custom-auditor");
    assert.equal(modelRoute("story_auditor").reasoningEffort, "medium");
    process.env.MANUSCRIPT_EDITOR_MODEL = "custom-language-editor";
    assert.equal(modelRoute("manuscript_editor").model, "custom-language-editor");
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import { modelRoute } from "../src/services/modelRouting.js";

const VARIABLES = [
  "TEXT_MODEL",
  "STORY_ARCHITECT_MODEL",
  "STORY_ARCHITECT_REASONING_EFFORT",
  "STORY_EDITOR_MODEL",
  "STORY_EDITOR_REASONING_EFFORT",
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
  });
});

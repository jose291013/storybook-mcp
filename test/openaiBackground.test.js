import assert from "node:assert/strict";
import test from "node:test";
import { runBackgroundResponse } from "../src/services/openai.js";

function executionFixture(initial = null) {
  let checkpoint = initial ? structuredClone(initial) : null;
  const writes = [];
  return {
    async getCheckpoint() {
      return checkpoint ? structuredClone(checkpoint) : null;
    },
    async saveCheckpoint(next) {
      checkpoint = structuredClone(next);
      writes.push(structuredClone(next));
    },
    current() {
      return checkpoint ? structuredClone(checkpoint) : null;
    },
    writes,
  };
}

const settings = {
  pollMs: 1,
  maxWaitMs: 60000,
  maxRetrieveErrors: 5,
};

test("background response persists its id and polls until completion", async () => {
  const execution = executionFixture();
  const retrieved = [
    { id: "resp_1", status: "in_progress" },
    { id: "resp_1", status: "completed", output_text: "{\"ok\":true}" },
  ];
  let createCalls = 0;
  const client = {
    responses: {
      async create(request) {
        createCalls += 1;
        assert.equal(request.background, true);
        assert.equal(request.store, false);
        return { id: "resp_1", status: "queued" };
      },
      async retrieve(id) {
        assert.equal(id, "resp_1");
        return retrieved.shift();
      },
    },
  };

  const response = await runBackgroundResponse({
    client,
    request: { model: "test-model", input: "private input" },
    execution,
    sleep: async () => {},
    settings,
  });

  assert.equal(createCalls, 1);
  assert.equal(response.status, "completed");
  assert.equal(execution.writes[0].responseId, "resp_1");
  assert.equal(execution.current().status, "completed");
});

test("background response resumes a persisted provider id without creating again", async () => {
  const execution = executionFixture({
    responseId: "resp_existing",
    status: "in_progress",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  let createCalls = 0;
  let retrieveCalls = 0;
  const client = {
    responses: {
      async create() {
        createCalls += 1;
        throw new Error("must not create");
      },
      async retrieve(id) {
        retrieveCalls += 1;
        assert.equal(id, "resp_existing");
        return {
          id,
          status: "completed",
          output_text: "{\"resumed\":true}",
        };
      },
    },
  };

  const response = await runBackgroundResponse({
    client,
    request: { model: "test-model" },
    execution,
    sleep: async () => {},
    settings,
  });

  assert.equal(createCalls, 0);
  assert.equal(retrieveCalls, 1);
  assert.equal(response.output_text, "{\"resumed\":true}");
});

test("background response survives an application interruption after id persistence", async () => {
  const execution = executionFixture();
  let createCalls = 0;
  const client = {
    responses: {
      async create() {
        createCalls += 1;
        return { id: "resp_restart", status: "queued" };
      },
      async retrieve(id) {
        assert.equal(id, "resp_restart");
        return {
          id,
          status: "completed",
          output_text: "{\"recovered\":true}",
        };
      },
    },
  };

  await assert.rejects(
    runBackgroundResponse({
      client,
      request: { model: "test-model" },
      execution,
      sleep: async () => {
        throw new Error("simulated process interruption");
      },
      settings,
    }),
    /simulated process interruption/,
  );
  assert.equal(execution.current().responseId, "resp_restart");

  const recovered = await runBackgroundResponse({
    client,
    request: { model: "test-model" },
    execution,
    sleep: async () => {},
    settings,
  });

  assert.equal(createCalls, 1);
  assert.equal(recovered.output_text, "{\"recovered\":true}");
});

test("background response retries transient retrieval without starting a second response", async () => {
  const execution = executionFixture();
  let createCalls = 0;
  let retrieveCalls = 0;
  const client = {
    responses: {
      async create() {
        createCalls += 1;
        return { id: "resp_transient", status: "queued" };
      },
      async retrieve() {
        retrieveCalls += 1;
        if (retrieveCalls === 1) {
          const error = new Error("The service is temporarily unavailable");
          error.status = 500;
          throw error;
        }
        return {
          id: "resp_transient",
          status: "completed",
          output_text: "{\"ok\":true}",
        };
      },
    },
  };

  const response = await runBackgroundResponse({
    client,
    request: { model: "test-model" },
    execution,
    sleep: async () => {},
    settings,
  });

  assert.equal(createCalls, 1);
  assert.equal(retrieveCalls, 2);
  assert.equal(response.status, "completed");
});

test("background response exposes a terminal provider failure without recreating", async () => {
  const execution = executionFixture();
  const client = {
    responses: {
      async create() {
        return {
          id: "resp_failed",
          status: "failed",
          error: { message: "Provider failed" },
        };
      },
      async retrieve() {
        throw new Error("not expected");
      },
    },
  };

  await assert.rejects(
    runBackgroundResponse({
      client,
      request: { model: "test-model" },
      execution,
      sleep: async () => {},
      settings,
    }),
    (error) => {
      assert.equal(error.code, "scenario_background_failed");
      assert.equal(error.providerResponseId, "resp_failed");
      return true;
    },
  );
  assert.equal(execution.current().status, "failed");
});

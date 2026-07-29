// src/services/openai.js
import { createOpenAIClient } from "./openaiClient.js";
import { modelRoute } from "./modelRouting.js";
import { parseJsonSafe } from "./parseJsonSafe.js";

const BACKGROUND_PENDING_STATUSES = new Set(["queued", "in_progress"]);
const BACKGROUND_SUCCESS_STATUS = "completed";

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function jsonInput(value) {
  return `Return one valid JSON object.\n\n${String(value || "")}`;
}

function backgroundSettings() {
  return {
    pollMs: boundedInteger(
      process.env.OPENAI_SCENARIO_BACKGROUND_POLL_MS,
      2000,
      500,
      10000,
    ),
    maxWaitMs: boundedInteger(
      process.env.OPENAI_SCENARIO_BACKGROUND_MAX_WAIT_MS,
      1800000,
      60000,
      3600000,
    ),
    maxRetrieveErrors: 5,
  };
}

function transientRetrieveError(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || error || "");
  return status === 408
    || status === 409
    || status === 429
    || status >= 500
    || /timed out|timeout|network|connection|temporarily unavailable/i.test(message);
}

function backgroundError(response) {
  const status = String(response?.status || "unknown");
  const detail = response?.error?.message
    || response?.incomplete_details?.reason
    || `Background response ended with status ${status}`;
  const error = new Error(String(detail));
  error.code = status === "incomplete"
    ? "scenario_background_incomplete"
    : "scenario_background_failed";
  error.providerResponseId = response?.id || "";
  error.providerStatus = status;
  return error;
}

/**
 * Start or resume one durable Responses API call. Only provider identifiers and
 * bounded status metadata are persisted by the caller; prompt and output content
 * remain outside the generation-run metadata.
 */
export async function runBackgroundResponse({
  client,
  request,
  execution,
  sleep = wait,
  nowMs = () => Date.now(),
  settings = backgroundSettings(),
}) {
  if (!execution?.getCheckpoint || !execution?.saveCheckpoint) {
    throw new Error("Background response execution checkpoint is required");
  }
  let checkpoint = await execution.getCheckpoint();
  let response = null;
  let startedAt = checkpoint?.startedAt || new Date(nowMs()).toISOString();
  const retrieve = async (responseId) => {
    let errorCount = 0;
    while (true) {
      try {
        return await client.responses.retrieve(responseId);
      } catch (error) {
        errorCount += 1;
        if (!transientRetrieveError(error)
          || errorCount > settings.maxRetrieveErrors) {
          throw error;
        }
        await sleep(settings.pollMs);
      }
    }
  };

  if (checkpoint?.responseId) {
    response = await retrieve(checkpoint.responseId);
  } else {
    response = await client.responses.create({
      ...request,
      background: true,
      store: false,
    });
    if (!response?.id) {
      throw new Error("Background response did not return an identifier");
    }
    checkpoint = {
      responseId: response.id,
      status: String(response.status || "queued"),
      startedAt,
      updatedAt: new Date(nowMs()).toISOString(),
    };
    await execution.saveCheckpoint(checkpoint);
  }

  while (BACKGROUND_PENDING_STATUSES.has(String(response?.status || ""))) {
    if ((nowMs() - Date.parse(startedAt || 0)) >= settings.maxWaitMs) {
      const error = new Error("Background response exceeded its durable wait limit");
      error.code = "scenario_background_timeout";
      error.providerResponseId = response?.id || checkpoint?.responseId || "";
      throw error;
    }
    await sleep(settings.pollMs);
    response = await retrieve(response.id);
    if (String(response?.status || "") !== String(checkpoint?.status || "")) {
      checkpoint = {
        ...checkpoint,
        responseId: response.id,
        status: String(response.status || ""),
        updatedAt: new Date(nowMs()).toISOString(),
      };
      await execution.saveCheckpoint(checkpoint);
    }
  }

  checkpoint = {
    ...checkpoint,
    responseId: response?.id || checkpoint?.responseId || "",
    status: String(response?.status || "unknown"),
    updatedAt: new Date(nowMs()).toISOString(),
    completedAt: new Date(nowMs()).toISOString(),
  };
  await execution.saveCheckpoint(checkpoint);
  if (response?.status !== BACKGROUND_SUCCESS_STATUS) {
    throw backgroundError(response);
  }
  return response;
}

export async function chatJson({
  system,
  user,
  temperature = 0.2,
  clientKind = "request",
  modelRole = "",
  backgroundExecution = null,
}) {
  const route = modelRoute(modelRole);
  const client = createOpenAIClient({ kind: clientKind });
  if (route.api === "responses") {
    const request = {
      model: route.model,
      instructions: system,
      input: jsonInput(user),
      reasoning: { effort: route.reasoningEffort },
      text: { format: { type: "json_object" } },
      store: false,
    };
    const resp = backgroundExecution
      ? await runBackgroundResponse({
        client,
        request,
        execution: backgroundExecution,
      })
      : await client.responses.create(request);
    const raw = String(resp.output_text || "").trim();
    const data = parseJsonSafe(raw);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return { __json_ok: true, data, raw };
    }
    return {
      __json_ok: false,
      raw,
      finishReason: resp.incomplete_details?.reason || resp.status || "",
    };
  }

  const resp = await client.chat.completions.create({
    model: route.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: jsonInput(user) },
    ],
    // JSON mode prevents Markdown fences and most malformed/truncated structures.
    response_format: { type: "json_object" },
    temperature,
  });

  const raw = resp.choices?.[0]?.message?.content?.trim() || "";
  const data = parseJsonSafe(raw);
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return { __json_ok: true, data, raw };
  }
  return { __json_ok: false, raw, finishReason: resp.choices?.[0]?.finish_reason || "" };
}

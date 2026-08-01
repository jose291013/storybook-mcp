import crypto from "node:crypto";
import { getDatabasePool } from "./database.js";
import { currentOpenAICostContext, inferAttemptKind } from "./openaiCostContext.js";
import { calculateOpenAICost, extractBillableUsage } from "./openaiPricing.js";

const memoryEvents = [];

function clean(value, maximum = 200) {
  return String(value || "").trim().slice(0, maximum);
}

function responseIdentifier(response) {
  return clean(response?.id || "", 200);
}

function requestIdentifier(response) {
  return clean(response?._request_id || response?.request_id || "", 200);
}

function modelFrom(request, response) {
  return clean(response?.model || request?.model || "", 120);
}

function endpointWorkflow(endpoint, context) {
  if (/images\.(generate|edit)/.test(endpoint)) return "illustration";
  if (/audio\.speech/.test(endpoint)) return "narration";
  if (context.workflow === "scenario") return "scenario";
  if (/qa|audit|fidelity|check/i.test(context.stage)) return "quality_control";
  if (/text|writer|manuscript/i.test(context.stage)) return "manuscript";
  return context.workflow || "book_generation";
}

export async function recordOpenAIResponse({ endpoint, request, response }) {
  const context = currentOpenAICostContext();
  if (!context?.projectId || !response?.usage) return null;
  const usage = extractBillableUsage(response);
  const model = modelFrom(request, response);
  const serviceTier = clean(response?.service_tier || request?.service_tier || "standard", 40);
  const pricing = calculateOpenAICost({ model, endpoint, serviceTier, usage });
  const stage = clean(context.stage || endpoint, 160);
  const event = {
    id: crypto.randomUUID(),
    projectId: context.projectId,
    runId: clean(context.runId, 160),
    workflow: endpointWorkflow(endpoint, context),
    stage,
    attemptKind: inferAttemptKind(stage, context.attemptKind),
    endpoint: clean(endpoint, 120),
    providerResponseId: responseIdentifier(response),
    providerRequestId: requestIdentifier(response),
    model,
    serviceTier,
    priceVersion: pricing.priceVersion,
    usage,
    costUsdMicros: pricing.costUsdMicros,
    pricingComplete: pricing.pricingComplete,
    createdAt: new Date().toISOString(),
  };
  const database = getDatabasePool();
  if (!database) {
    if (event.providerResponseId && memoryEvents.some((item) => (
      item.projectId === event.projectId
      && item.endpoint === event.endpoint
      && item.providerResponseId === event.providerResponseId
    ))) return null;
    memoryEvents.push(event);
    return event;
  }
  const { rows } = await database.query(
    `INSERT INTO openai_cost_events
      (id,project_id,run_id,workflow,stage,attempt_kind,endpoint,provider_response_id,provider_request_id,
       model,service_tier,price_version,usage,cost_usd_micros,pricing_complete,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16)
     ON CONFLICT (project_id,endpoint,provider_response_id)
       WHERE provider_response_id <> ''
     DO NOTHING
     RETURNING id`,
    [
      event.id, event.projectId, event.runId, event.workflow, event.stage, event.attemptKind,
      event.endpoint, event.providerResponseId, event.providerRequestId, event.model, event.serviceTier,
      event.priceVersion, JSON.stringify(event.usage), event.costUsdMicros, event.pricingComplete, event.createdAt,
    ],
  );
  return rows.length ? event : null;
}

export async function safelyRecordOpenAIResponse(payload) {
  try {
    return await recordOpenAIResponse(payload);
  } catch (error) {
    console.warn("[cost-ledger] usage record failed", JSON.stringify({
      projectId: currentOpenAICostContext()?.projectId || "",
      endpoint: clean(payload?.endpoint, 120),
      error: clean(error?.message || error, 300),
    }));
    return null;
  }
}

function memorySummary(projectId = "") {
  const events = memoryEvents.filter((event) => !projectId || event.projectId === projectId);
  const groups = new Map();
  for (const event of events) {
    const current = groups.get(event.projectId) || {
      projectId: event.projectId,
      title: "",
      status: "",
      pageCount: 0,
      totalCostUsdMicros: 0,
      normalCostUsdMicros: 0,
      reworkCostUsdMicros: 0,
      requestCount: 0,
      pricingComplete: true,
      lastActivityAt: event.createdAt,
    };
    current.totalCostUsdMicros += event.costUsdMicros;
    current.requestCount += 1;
    current.pricingComplete = current.pricingComplete && event.pricingComplete;
    current.lastActivityAt = current.lastActivityAt > event.createdAt ? current.lastActivityAt : event.createdAt;
    if (event.attemptKind === "normal") current.normalCostUsdMicros += event.costUsdMicros;
    else current.reworkCostUsdMicros += event.costUsdMicros;
    groups.set(event.projectId, current);
  }
  return [...groups.values()].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
}

function summaryRow(row) {
  return {
    projectId: String(row.project_id),
    title: row.title || "",
    status: row.status || "deleted",
    pageCount: Number(row.page_count || 0),
    totalCostUsdMicros: Number(row.total_cost_usd_micros || 0),
    normalCostUsdMicros: Number(row.normal_cost_usd_micros || 0),
    reworkCostUsdMicros: Number(row.rework_cost_usd_micros || 0),
    requestCount: Number(row.request_count || 0),
    pricingComplete: row.pricing_complete === true,
    lastActivityAt: row.last_activity_at?.toISOString?.() || row.last_activity_at || null,
  };
}

export async function listBookCostSummaries({ projectId = "", limit = 100 } = {}) {
  const database = getDatabasePool();
  if (!database) return memorySummary(projectId).slice(0, limit);
  const { rows } = await database.query(
    `SELECT
       event.project_id,
       project.title,
       project.status,
       COALESCE(
         (project.questionnaire->>'page_count')::integer,
         (project.product_configuration->>'page_count')::integer,
         (project.product_configuration->>'pageCount')::integer,
         0
       ) AS page_count,
       SUM(event.cost_usd_micros)::bigint AS total_cost_usd_micros,
       SUM(CASE WHEN event.attempt_kind='normal' THEN event.cost_usd_micros ELSE 0 END)::bigint AS normal_cost_usd_micros,
       SUM(CASE WHEN event.attempt_kind<>'normal' THEN event.cost_usd_micros ELSE 0 END)::bigint AS rework_cost_usd_micros,
       COUNT(*)::integer AS request_count,
       BOOL_AND(event.pricing_complete) AS pricing_complete,
       MAX(event.created_at) AS last_activity_at
     FROM openai_cost_events AS event
     LEFT JOIN book_projects AS project ON project.id=event.project_id
     WHERE ($1::uuid IS NULL OR event.project_id=$1::uuid)
     GROUP BY event.project_id,project.title,project.status,project.questionnaire,project.product_configuration
     ORDER BY MAX(event.created_at) DESC
     LIMIT $2`,
    [projectId || null, Math.max(1, Math.min(500, Number(limit) || 100))],
  );
  return rows.map(summaryRow);
}

export async function getBookCostDetails(projectId) {
  const summaries = await listBookCostSummaries({ projectId, limit: 1 });
  const database = getDatabasePool();
  if (!database) {
    return {
      summary: summaries[0] || null,
      breakdown: memoryEvents.filter((event) => event.projectId === projectId),
    };
  }
  const { rows } = await database.query(
    `SELECT workflow,stage,attempt_kind,model,endpoint,
       SUM(cost_usd_micros)::bigint AS cost_usd_micros,
       COUNT(*)::integer AS request_count,
       BOOL_AND(pricing_complete) AS pricing_complete
     FROM openai_cost_events
     WHERE project_id=$1
     GROUP BY workflow,stage,attempt_kind,model,endpoint
     ORDER BY MIN(created_at),workflow,stage`,
    [projectId],
  );
  return {
    summary: summaries[0] || null,
    breakdown: rows.map((row) => ({
      workflow: row.workflow,
      stage: row.stage,
      attemptKind: row.attempt_kind,
      model: row.model,
      endpoint: row.endpoint,
      costUsdMicros: Number(row.cost_usd_micros || 0),
      requestCount: Number(row.request_count || 0),
      pricingComplete: row.pricing_complete === true,
    })),
  };
}

export async function currentBookCostUsdMicros(projectId) {
  const cleanProjectId = clean(projectId, 80);
  if (!cleanProjectId) return 0;
  const database = getDatabasePool();
  if (!database) {
    return memoryEvents
      .filter((event) => event.projectId === cleanProjectId)
      .reduce((total, event) => total + Number(event.costUsdMicros || 0), 0);
  }
  const { rows } = await database.query(
    `SELECT COALESCE(SUM(cost_usd_micros),0)::bigint AS total
     FROM openai_cost_events
     WHERE project_id=$1`,
    [cleanProjectId],
  );
  return Number(rows[0]?.total || 0);
}

export function resetMemoryCostLedgerForTests() {
  memoryEvents.splice(0, memoryEvents.length);
}

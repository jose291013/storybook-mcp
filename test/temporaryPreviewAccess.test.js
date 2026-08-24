import assert from "node:assert/strict";
import test from "node:test";

import {
  grantPermanentDigitalAccess,
  previewAccessState,
  startTemporaryPreviewAccess,
} from "../src/services/temporaryPreviewAccess.js";
import { runTemporaryPreviewExpiryCycle } from "../src/services/temporaryPreviewExpiryWorker.js";

const identity = { wooCustomerId: "42", email: "parent@example.com" };

function projectAt(startedAt = "2026-08-24T10:00:00.000Z") {
  const base = {
    id: "project-v1",
    customerId: "customer-42",
    status: "preview_ready",
    title: "Le livre de Noa",
    updatedAt: startedAt,
    questionnaire: { page_count: 24, pricing_version: "digital_ttc_037_v1" },
    productConfiguration: { pricing_version: "digital_ttc_037_v1" },
    previewResult: { coverPreviewUrl: "/outputs/cover.png", pages: [] },
    finalBlueprint: { pages: [] },
    generationJobId: "job-1",
  };
  return { ...base, productConfiguration: startTemporaryPreviewAccess(base, startedAt) };
}

function memoryProjects(project) {
  return {
    current: structuredClone(project),
    async listTemporaryPreviewAccessCandidates() { return [structuredClone(this.current)]; },
    async getCustomerIdentity() { return identity; },
    async update(id, patch) {
      assert.equal(id, this.current.id);
      this.current = { ...this.current, ...patch };
      return structuredClone(this.current);
    },
  };
}

test("a V1 generation opens exactly one 72-hour interactive preview", () => {
  const project = projectAt();
  const access = previewAccessState(project, "2026-08-27T09:59:59.000Z");
  assert.equal(access.temporary, true);
  assert.equal(access.allowed, true);
  assert.equal(access.expiresAt, "2026-08-27T10:00:00.000Z");
  assert.equal(previewAccessState(project, "2026-08-27T10:00:00.000Z").expired, true);
});

test("a paid digital edition permanently preserves reader access", () => {
  const temporary = projectAt();
  const purchased = {
    ...temporary,
    status: "purchased",
    productConfiguration: grantPermanentDigitalAccess(temporary, "2026-08-25T10:00:00.000Z"),
  };
  const access = previewAccessState(purchased, "2030-01-01T00:00:00.000Z");
  assert.equal(access.permanent, true);
  assert.equal(access.allowed, true);
  assert.equal(access.expiresAt, null);
});

test("the expiry worker sends one warning 24 hours before deletion", async () => {
  const projects = memoryProjects(projectAt());
  const notifications = [];
  const result = await runTemporaryPreviewExpiryCycle({
    projects,
    credits: { async hasActiveCheckoutReservation() { return false; } },
    notify: async (payload) => notifications.push(payload),
    now: () => new Date("2026-08-26T10:00:00.000Z"),
    logger: {},
  });
  assert.deepEqual(result, { checked: 1, warned: 1, expired: 0, failed: 0 });
  assert.equal(notifications[0].event, "preview_expiring");
  assert.equal(projects.current.productConfiguration.preview_expiry_warning_sent_at, "2026-08-26T10:00:00.000Z");

  const second = await runTemporaryPreviewExpiryCycle({
    projects,
    credits: { async hasActiveCheckoutReservation() { return false; } },
    notify: async (payload) => notifications.push(payload),
    now: () => new Date("2026-08-26T11:00:00.000Z"),
    logger: {},
  });
  assert.equal(second.warned, 0);
  assert.equal(notifications.length, 1);
});

test("expiry deletes generated assets and the generation rebate but preserves the draft", async () => {
  const projects = memoryProjects(projectAt());
  const calls = [];
  const result = await runTemporaryPreviewExpiryCycle({
    projects,
    credits: {
      async hasActiveCheckoutReservation() { return false; },
      async expireProjectRebate(receivedIdentity, options) { calls.push(["rebate", receivedIdentity, options]); },
    },
    cleanup: async (project) => calls.push(["cleanup", project.id]),
    now: () => new Date("2026-08-27T10:00:01.000Z"),
    logger: {},
  });
  assert.equal(result.expired, 1);
  assert.equal(projects.current.status, "preview_expired");
  assert.equal(projects.current.previewResult, null);
  assert.equal(projects.current.finalBlueprint, null);
  assert.equal(projects.current.generationJobId, null);
  assert.equal(projects.current.questionnaire.page_count, 24);
  assert.deepEqual(calls.map(([name]) => name), ["cleanup", "rebate"]);
});

test("an active checkout reservation postpones destructive expiry", async () => {
  const projects = memoryProjects(projectAt());
  let cleaned = false;
  const result = await runTemporaryPreviewExpiryCycle({
    projects,
    credits: { async hasActiveCheckoutReservation() { return true; } },
    cleanup: async () => { cleaned = true; },
    now: () => new Date("2026-08-28T10:00:00.000Z"),
    logger: {},
  });
  assert.equal(result.expired, 0);
  assert.equal(cleaned, false);
  assert.equal(projects.current.status, "preview_ready");
});

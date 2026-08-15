import assert from "node:assert/strict";
import test from "node:test";

import { manuscriptReviewFidelityIssues } from "../src/agents/manuscriptEditor.js";
import { applyManuscriptCorrections } from "../src/services/manuscriptBatches.js";
import { STORYBOARD_FIRST_CONTRACT_VERSION } from "../src/services/specDrivenIllustrationPlan.js";

function storyboard() {
  return {
    storyboardFirstVersion: STORYBOARD_FIRST_CONTRACT_VERSION,
    sceneContracts: [
      { text_page_number: 2, visual_beat_digest: "beat-1", named_characters: [{ name: "Noa" }] },
      { text_page_number: 4, visual_beat_digest: "beat-2", named_characters: [{ name: "Papa" }] },
    ],
  };
}

test("the existing editor call must attest every signed visual beat", () => {
  const review = {
    status: "corrected",
    pages: [{ page_number: 4, text: "Papa attend au lieu de départ." }],
    fidelity: [
      { page_number: 2, visual_beat_digest: "beat-1", status: "aligned" },
      { page_number: 4, visual_beat_digest: "beat-2", status: "corrected" },
    ],
  };
  assert.deepEqual(manuscriptReviewFidelityIssues(review, storyboard()), []);
});

test("missing, stale and unresolved fidelity evidence stops before illustration", () => {
  const issues = manuscriptReviewFidelityIssues({
    pages: [],
    fidelity: [
      { page_number: 2, visual_beat_digest: "wrong", status: "rejected" },
    ],
  }, storyboard());
  assert.ok(issues.includes("manuscript fidelity digest is invalid for page 2"));
  assert.ok(issues.includes("manuscript fidelity is unresolved for page 2"));
  assert.ok(issues.includes("manuscript fidelity is missing for page 4"));
});

test("unexpected fidelity evidence and unapplied corrections are rejected", () => {
  const issues = manuscriptReviewFidelityIssues({
    pages: [{ page_number: 4, text: "Papa attend au lieu de départ." }],
    fidelity: [
      { page_number: 2, visual_beat_digest: "beat-1", status: "aligned" },
      { page_number: 4, visual_beat_digest: "beat-2", status: "corrected" },
      { page_number: 6, visual_beat_digest: "unknown", status: "aligned" },
    ],
  }, storyboard(), new Map([
    [2, "Noa regarde le départ."],
    [4, "Il attend au lieu de départ."],
  ]));
  assert.ok(issues.includes("manuscript fidelity page 6 is unexpected"));
  assert.ok(issues.includes("manuscript fidelity correction was not applied for page 4"));
});

test("legacy storyboard reviews remain compatible without new evidence", () => {
  assert.deepEqual(manuscriptReviewFidelityIssues({}, {
    storyboardFirstVersion: STORYBOARD_FIRST_CONTRACT_VERSION - 1,
  }), []);
});

test("a fidelity correction may introduce only a character authorized by that visual beat", () => {
  const review = { pages: [{ page_number: 4, text: "Papa attend au lieu de départ." }] };
  const canonicalCharacters = [{ name: "Papa" }];
  const blocked = new Map([[4, "Il attend au lieu de départ."]]);
  applyManuscriptCorrections(blocked, review, [4], canonicalCharacters);
  assert.equal(blocked.get(4), "Il attend au lieu de départ.");

  const allowed = new Map([[4, "Il attend au lieu de départ."]]);
  applyManuscriptCorrections(allowed, review, [4], canonicalCharacters, {
    allowedIntroductionsByPage: new Map([[4, ["Papa"]]]),
  });
  assert.equal(allowed.get(4), "Papa attend au lieu de départ.");
});

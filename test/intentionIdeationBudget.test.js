import test from "node:test";
import assert from "node:assert/strict";
import {
  claimIntentionIdeationRound,
  completeIntentionIdeationRound,
  intentionIdeationFingerprint,
  releaseIntentionIdeationRound,
  resetIntentionIdeationBudgetsForTests,
  reserveIntentionIdeationRound,
} from "../src/services/intentionIdeationBudget.js";

test.beforeEach(() => resetIntentionIdeationBudgetsForTests());

test("one anonymous intention fingerprint receives exactly three ideation rounds", async () => {
  const inputFingerprint = intentionIdeationFingerprint({
    creatorSituation: "Il hésite quand une activité paraît difficile.",
    childAge: 7,
    locale: "FR",
  });
  const rounds = [];
  for (let index = 0; index < 4; index += 1) {
    rounds.push(await claimIntentionIdeationRound({ ownerHash: "owner-a", inputFingerprint }));
  }
  assert.deepEqual(rounds.map((item) => item.allowed), [true, true, true, false]);
  assert.deepEqual(rounds.slice(0, 3).map((item) => item.roundNumber), [1, 2, 3]);
  assert.equal(rounds[3].roundsRemaining, 0);
});

test("the intention budget resets for a changed input fingerprint but not whitespace", async () => {
  const first = intentionIdeationFingerprint({
    creatorSituation: "  Il hésite   souvent ", childAge: 7, locale: "fr",
  });
  const equivalent = intentionIdeationFingerprint({
    creatorSituation: "il hésite souvent", childAge: 7, locale: "FR",
  });
  const changed = intentionIdeationFingerprint({
    creatorSituation: "il hésite souvent", childAge: 8, locale: "FR",
  });
  assert.equal(first, equivalent);
  assert.notEqual(first, changed);
  assert.equal((await claimIntentionIdeationRound({ ownerHash: "owner-a", inputFingerprint: first })).roundNumber, 1);
  assert.equal((await claimIntentionIdeationRound({ ownerHash: "owner-a", inputFingerprint: changed })).roundNumber, 1);
  assert.equal((await claimIntentionIdeationRound({ ownerHash: "owner-b", inputFingerprint: first })).roundNumber, 1);
});

test("the same wording receives a fresh allowance in a new creation session", () => {
  const first = intentionIdeationFingerprint({
    creatorSituation: "il hésite souvent", childAge: 7, locale: "FR", intentionSessionId: "creation-session-a",
  });
  const nextBook = intentionIdeationFingerprint({
    creatorSituation: "il hésite souvent", childAge: 7, locale: "FR", intentionSessionId: "creation-session-b",
  });
  assert.notEqual(first, nextBook);
});

test("a failed or interrupted batch releases its round instead of consuming it", async () => {
  const identity = { ownerHash: "owner-a", inputFingerprint: "session-fingerprint", requestId: "request-one" };
  const reserved = await reserveIntentionIdeationRound(identity);
  assert.equal(reserved.roundNumber, 1);
  assert.equal(reserved.completedRounds, 0);
  await releaseIntentionIdeationRound(identity);
  const retry = await reserveIntentionIdeationRound({ ...identity, requestId: "request-two" });
  assert.equal(retry.roundNumber, 1);
  const completed = await completeIntentionIdeationRound({ ...identity, requestId: "request-two" });
  assert.equal(completed.completedRounds, 1);
});

test("only one perspective batch may be reserved for one creation at a time", async () => {
  const base = { ownerHash: "owner-a", inputFingerprint: "session-fingerprint" };
  assert.equal((await reserveIntentionIdeationRound({ ...base, requestId: "request-one" })).allowed, true);
  const competing = await reserveIntentionIdeationRound({ ...base, requestId: "request-two" });
  assert.equal(competing.allowed, false);
  assert.equal(competing.busy, true);
});

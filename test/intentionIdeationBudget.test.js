import test from "node:test";
import assert from "node:assert/strict";
import {
  claimIntentionIdeationRound,
  intentionIdeationFingerprint,
  resetIntentionIdeationBudgetsForTests,
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

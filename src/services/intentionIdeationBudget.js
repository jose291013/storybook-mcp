import crypto from "node:crypto";
import { getDatabasePool } from "./database.js";

export const MAX_INTENTION_IDEATION_ROUNDS = 3;

const memoryBudgets = new Map();

function normalizedText(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function intentionIdeationFingerprint({ creatorSituation, childAge, locale } = {}) {
  const canonical = JSON.stringify({
    creatorSituation: normalizedText(creatorSituation),
    childAge: Number(childAge),
    locale: String(locale || "FR").toUpperCase(),
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function result(roundCount) {
  const count = Math.max(0, Number(roundCount || 0));
  return {
    allowed: count > 0 && count <= MAX_INTENTION_IDEATION_ROUNDS,
    roundNumber: Math.min(count, MAX_INTENTION_IDEATION_ROUNDS),
    roundsRemaining: Math.max(0, MAX_INTENTION_IDEATION_ROUNDS - count),
    maximumRounds: MAX_INTENTION_IDEATION_ROUNDS,
  };
}

export async function claimIntentionIdeationRound({ ownerHash, inputFingerprint } = {}) {
  if (!ownerHash || !inputFingerprint) throw new Error("Missing intention ideation budget identity");
  const database = getDatabasePool();
  if (!database) {
    const key = `${ownerHash}:${inputFingerprint}`;
    const current = Number(memoryBudgets.get(key) || 0);
    if (current >= MAX_INTENTION_IDEATION_ROUNDS) {
      return { ...result(current), allowed: false };
    }
    const next = current + 1;
    memoryBudgets.set(key, next);
    return result(next);
  }
  const { rows } = await database.query(
    `INSERT INTO intention_ideation_budgets
       (owner_hash,input_fingerprint,round_count,created_at,updated_at)
     VALUES ($1,$2,1,now(),now())
     ON CONFLICT (owner_hash,input_fingerprint)
     DO UPDATE SET
       round_count=intention_ideation_budgets.round_count+1,
       updated_at=now()
     WHERE intention_ideation_budgets.round_count < $3
     RETURNING round_count`,
    [ownerHash, inputFingerprint, MAX_INTENTION_IDEATION_ROUNDS],
  );
  if (rows.length) return result(rows[0].round_count);
  const current = await database.query(
    `SELECT round_count FROM intention_ideation_budgets
     WHERE owner_hash=$1 AND input_fingerprint=$2`,
    [ownerHash, inputFingerprint],
  );
  return { ...result(current.rows[0]?.round_count), allowed: false };
}

export function resetIntentionIdeationBudgetsForTests() {
  memoryBudgets.clear();
}

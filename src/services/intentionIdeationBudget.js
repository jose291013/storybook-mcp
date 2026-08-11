import crypto from "node:crypto";
import { getDatabasePool } from "./database.js";

export const MAX_INTENTION_IDEATION_ROUNDS = 3;
const RESERVATION_TTL_MS = 10 * 60 * 1000;

const memoryBudgets = new Map();

function normalizedText(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function intentionIdeationFingerprint({ creatorSituation, childAge, locale, intentionSessionId = "legacy" } = {}) {
  const canonical = JSON.stringify({
    creatorSituation: normalizedText(creatorSituation),
    childAge: Number(childAge),
    locale: String(locale || "FR").toUpperCase(),
    intentionSessionId: String(intentionSessionId || "legacy").trim().slice(0, 80),
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function result(roundCount, { allowed, roundNumber = 0, busy = false, resumed = false } = {}) {
  const completed = Math.max(0, Math.min(MAX_INTENTION_IDEATION_ROUNDS, Number(roundCount || 0)));
  const proposedRound = Math.max(0, Math.min(MAX_INTENTION_IDEATION_ROUNDS, Number(roundNumber || completed)));
  return {
    allowed: Boolean(allowed),
    busy: Boolean(busy),
    resumed: Boolean(resumed),
    roundNumber: proposedRound,
    completedRounds: completed,
    roundsRemaining: Math.max(0, MAX_INTENTION_IDEATION_ROUNDS - completed),
    maximumRounds: MAX_INTENTION_IDEATION_ROUNDS,
  };
}

function memoryRecord(key) {
  const existing = memoryBudgets.get(key);
  if (existing) return existing;
  const created = { roundCount: 0, reservation: null };
  memoryBudgets.set(key, created);
  return created;
}

export async function reserveIntentionIdeationRound({ ownerHash, inputFingerprint, requestId } = {}) {
  if (!ownerHash || !inputFingerprint || !requestId) throw new Error("Missing intention ideation reservation identity");
  const database = getDatabasePool();
  if (!database) {
    const record = memoryRecord(`${ownerHash}:${inputFingerprint}`);
    if (record.reservation && Date.now() - record.reservation.reservedAt > RESERVATION_TTL_MS) record.reservation = null;
    if (record.reservation) {
      return result(record.roundCount, {
        allowed: record.reservation.requestId === requestId,
        busy: record.reservation.requestId !== requestId,
        resumed: record.reservation.requestId === requestId,
        roundNumber: record.reservation.roundNumber,
      });
    }
    if (record.roundCount >= MAX_INTENTION_IDEATION_ROUNDS) {
      return result(record.roundCount, { allowed: false, roundNumber: record.roundCount });
    }
    record.reservation = { requestId, roundNumber: record.roundCount + 1, reservedAt: Date.now() };
    return result(record.roundCount, { allowed: true, roundNumber: record.reservation.roundNumber });
  }

  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO intention_ideation_budgets (owner_hash,input_fingerprint,round_count,created_at,updated_at)
       VALUES ($1,$2,0,now(),now())
       ON CONFLICT (owner_hash,input_fingerprint) DO NOTHING`,
      [ownerHash, inputFingerprint],
    );
    const { rows } = await client.query(
      `SELECT round_count,reserved_request_id,reserved_round,reserved_at
       FROM intention_ideation_budgets
       WHERE owner_hash=$1 AND input_fingerprint=$2
       FOR UPDATE`,
      [ownerHash, inputFingerprint],
    );
    const row = rows[0];
    const stale = row.reserved_at && Date.now() - new Date(row.reserved_at).getTime() > RESERVATION_TTL_MS;
    if (row.reserved_request_id && !stale) {
      await client.query("COMMIT");
      return result(row.round_count, {
        allowed: row.reserved_request_id === requestId,
        busy: row.reserved_request_id !== requestId,
        resumed: row.reserved_request_id === requestId,
        roundNumber: row.reserved_round,
      });
    }
    if (Number(row.round_count) >= MAX_INTENTION_IDEATION_ROUNDS) {
      await client.query("COMMIT");
      return result(row.round_count, { allowed: false, roundNumber: row.round_count });
    }
    const roundNumber = Number(row.round_count) + 1;
    await client.query(
      `UPDATE intention_ideation_budgets
       SET reserved_request_id=$3,reserved_round=$4,reserved_at=now(),updated_at=now()
       WHERE owner_hash=$1 AND input_fingerprint=$2`,
      [ownerHash, inputFingerprint, requestId, roundNumber],
    );
    await client.query("COMMIT");
    return result(row.round_count, { allowed: true, roundNumber });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function completeIntentionIdeationRound({ ownerHash, inputFingerprint, requestId } = {}) {
  const database = getDatabasePool();
  if (!database) {
    const record = memoryRecord(`${ownerHash}:${inputFingerprint}`);
    if (record.reservation?.requestId !== requestId) throw new Error("Intention ideation reservation is no longer active");
    record.roundCount = Math.max(record.roundCount, record.reservation.roundNumber);
    record.reservation = null;
    return result(record.roundCount, { allowed: true, roundNumber: record.roundCount });
  }
  const { rows } = await database.query(
    `UPDATE intention_ideation_budgets
     SET round_count=GREATEST(round_count,reserved_round),reserved_request_id=NULL,reserved_round=NULL,reserved_at=NULL,updated_at=now()
     WHERE owner_hash=$1 AND input_fingerprint=$2 AND reserved_request_id=$3
     RETURNING round_count`,
    [ownerHash, inputFingerprint, requestId],
  );
  if (!rows.length) throw new Error("Intention ideation reservation is no longer active");
  return result(rows[0].round_count, { allowed: true, roundNumber: rows[0].round_count });
}

export async function releaseIntentionIdeationRound({ ownerHash, inputFingerprint, requestId } = {}) {
  const database = getDatabasePool();
  if (!database) {
    const record = memoryRecord(`${ownerHash}:${inputFingerprint}`);
    if (record.reservation?.requestId === requestId) record.reservation = null;
    return result(record.roundCount, { allowed: false, roundNumber: record.roundCount });
  }
  const { rows } = await database.query(
    `UPDATE intention_ideation_budgets
     SET reserved_request_id=NULL,reserved_round=NULL,reserved_at=NULL,updated_at=now()
     WHERE owner_hash=$1 AND input_fingerprint=$2 AND reserved_request_id=$3
     RETURNING round_count`,
    [ownerHash, inputFingerprint, requestId],
  );
  return result(rows[0]?.round_count || 0, { allowed: false, roundNumber: rows[0]?.round_count || 0 });
}

// Backward-compatible helper for unit callers that want one immediately
// successful batch without modelling the reservation lifecycle.
export async function claimIntentionIdeationRound({ ownerHash, inputFingerprint } = {}) {
  const requestId = crypto.randomUUID();
  const reserved = await reserveIntentionIdeationRound({ ownerHash, inputFingerprint, requestId });
  if (!reserved.allowed) return reserved;
  return completeIntentionIdeationRound({ ownerHash, inputFingerprint, requestId });
}

export function resetIntentionIdeationBudgetsForTests() {
  memoryBudgets.clear();
}

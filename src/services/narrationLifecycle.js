export const NARRATION_ACTION = Object.freeze({
  PURCHASE: "purchase",
  REPLACE: "replace",
  WAIT: "wait",
  RETRY: "retry",
});

export function narrationNextAction(record) {
  if (!record || record.paymentStatus !== "paid") return NARRATION_ACTION.PURCHASE;
  if (["queued", "generating"].includes(record.fulfillmentStatus)) return NARRATION_ACTION.WAIT;
  if (record.fulfillmentStatus === "failed") return NARRATION_ACTION.RETRY;
  if (record.fulfillmentStatus === "ready") return NARRATION_ACTION.REPLACE;
  return NARRATION_ACTION.PURCHASE;
}

export function narrationCheckoutAllowed(record) {
  return [NARRATION_ACTION.PURCHASE, NARRATION_ACTION.REPLACE].includes(narrationNextAction(record));
}

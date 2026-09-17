const BOUNDED_PAGE_REPAIR_CODE = "preview_page_repair_required";

function validPendingPageNumbers(repairQueue) {
  if (!Array.isArray(repairQueue?.pendingPageNumbers)) return [];
  return [...new Set(repairQueue.pendingPageNumbers
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0))];
}

/**
 * A bounded page-repair checkpoint is an intermediate manufacturing state,
 * not a customer-facing generation failure. Defer the failure notification
 * only when the persisted queue is complete enough to resume safely. Any
 * malformed or exhausted queue remains a genuine notification event.
 */
export function shouldNotifyPreviewGenerationFailure({
  errorCode = "",
  repairQueue = null,
  retryAvailable = false,
} = {}) {
  if (String(errorCode || "") !== BOUNDED_PAGE_REPAIR_CODE) return true;

  const pendingPageNumbers = validPendingPageNumbers(repairQueue);
  const pendingPageCount = Number(repairQueue?.pendingPageCount || 0);
  const hasResumableQueue = repairQueue?.version === 1
    && repairQueue?.status === "awaiting_retry"
    && repairQueue?.retryAvailable === true
    && retryAvailable === true
    && pendingPageNumbers.length > 0
    && pendingPageCount === pendingPageNumbers.length;

  return !hasResumableQueue;
}

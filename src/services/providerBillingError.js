const PROVIDER_BILLING_CODES = new Set([
  "billing_hard_limit_reached",
  "billing_not_active",
  "insufficient_quota",
  "payment_required",
]);

function providerErrorCode(error) {
  return String(
    error?.code
    || error?.error?.code
    || error?.cause?.code
    || error?.response?.data?.error?.code
    || ""
  ).trim().toLowerCase();
}

function providerErrorText(error) {
  return [
    error?.message,
    error?.error?.message,
    error?.cause?.message,
    error?.response?.data?.error?.message,
  ].filter(Boolean).join(" ");
}

export function isProviderBillingUnavailable(error) {
  const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
  if (status === 402) return true;
  if (PROVIDER_BILLING_CODES.has(providerErrorCode(error))) return true;
  return /(no credits? remaining|add credits? to continue using the api|exceeded your current quota|insufficient quota|billing hard limit|billing is not active)/iu
    .test(providerErrorText(error));
}

export function tagProviderBillingUnavailable(error) {
  if (!isProviderBillingUnavailable(error)) return error;
  error.code = "preview_provider_billing_unavailable";
  error.artifactType = String(error.artifactType || "provider_billing");
  return error;
}

export function publicPreviewFailureReason(project) {
  const reason = String(project?.continuitySnapshot?.generationCheckpoint?.failureReason || "");
  return reason === "preview_provider_billing_unavailable" ? reason : "";
}

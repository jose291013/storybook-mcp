import { isProviderBillingUnavailable } from "./providerBillingError.js";

export function isTransientOpenAIError(error) {
  if (isProviderBillingUnavailable(error)) return false;
  const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
  if ([408, 409, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  const code = String(error?.code || error?.cause?.code || "").trim();
  if (/^(?:ETIMEDOUT|ECONNRESET|ECONNABORTED|ECONNREFUSED|EAI_AGAIN|ENETUNREACH)$/iu.test(code)) return true;
  return /(server had an error processing your request|internal server error|server_error|service_auth_failure|unable to verify model access(?: right now)?|temporar(?:y|ily) unavailable|service unavailable|overloaded|rate limit|too many requests|request timed out|timed out|timeout|connection (?:reset|closed|aborted)|bad gateway|gateway timeout)/iu
    .test([
      error?.message,
      error?.type,
      error?.error?.type,
      error?.headers?.["x-openai-ide-error-code"],
      error?.headers?.["x-openai-ide-root-error-code"],
    ].filter(Boolean).join(" "));
}

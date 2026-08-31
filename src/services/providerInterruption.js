import { isTransientOpenAIError } from "./openaiErrorPolicy.js";
import { isProviderBillingUnavailable } from "./providerBillingError.js";

export function isPreviewProviderInterruption(error) {
  if (isProviderBillingUnavailable(error)) return false;
  return isTransientOpenAIError(error);
}

export function tagPreviewProviderInterruption(error, artifactType = "provider_request") {
  if (!isPreviewProviderInterruption(error)) return error;
  const tagged = error instanceof Error
    ? error
    : new Error(String(error?.message || "The generation provider is temporarily unavailable."));
  tagged.code = "preview_interrupted";
  tagged.artifactType = String(tagged.artifactType || artifactType);
  return tagged;
}

export const SUPPORTED_LANGUAGES = Object.freeze(["FR", "ES", "EN"]);

export function normalizeSupportedLanguage(value) {
  const language = String(value || "")
    .trim()
    .replace("_", "-")
    .split("-")[0]
    .toUpperCase();
  return SUPPORTED_LANGUAGES.includes(language) ? language : "";
}

export function detectBrowserLanguage(languages = []) {
  const candidates = Array.isArray(languages) ? languages : [languages];
  for (const candidate of candidates) {
    const language = normalizeSupportedLanguage(candidate);
    if (language) return language;
  }
  return "";
}

export function initialCreatorLanguage({
  queryLanguage = "",
  referrerLanguage = "",
  storedLanguage = "",
  browserLanguages = [],
} = {}) {
  return normalizeSupportedLanguage(queryLanguage)
    || normalizeSupportedLanguage(referrerLanguage)
    || normalizeSupportedLanguage(storedLanguage)
    || detectBrowserLanguage(browserLanguages)
    || "FR";
}

export function defaultNewBookLanguage({ queryBookLanguage = "", interfaceLanguage = "" } = {}) {
  return normalizeSupportedLanguage(queryBookLanguage)
    || normalizeSupportedLanguage(interfaceLanguage)
    || "FR";
}

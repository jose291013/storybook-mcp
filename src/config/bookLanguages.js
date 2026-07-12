export const BOOK_LANGUAGES = {
  FR: { code: "FR", name: "French", nativeName: "français" },
  ES: { code: "ES", name: "Spanish", nativeName: "español" },
  EN: { code: "EN", name: "English", nativeName: "English" },
};

export function normalizeBookLanguage(value, fallback = "FR") {
  const code = String(value || "").trim().toUpperCase();
  return BOOK_LANGUAGES[code]?.code || BOOK_LANGUAGES[fallback]?.code || "FR";
}

export function bookLanguageInstruction(value) {
  const language = BOOK_LANGUAGES[normalizeBookLanguage(value)];
  return `AUTHORITATIVE OUTPUT LANGUAGE: ${language.code} (${language.name} / ${language.nativeName}). The creator may answer the questionnaire in another language. Never infer the book language from those answers. Translate their meaning and write every reader-visible word exclusively in ${language.name}.`;
}

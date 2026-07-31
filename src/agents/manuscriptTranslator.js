import { bookLanguageInstruction, normalizeBookLanguage } from "../config/bookLanguages.js";
import { runAgent } from "../services/agentRunner.js";

const SYSTEM = `You are a precision translator for a completed children's book.
Translate every supplied reader-visible page into the authoritative output language.
Preserve exactly the events, chronology, locations, character names, relationships, dialogue speakers,
object states, paragraph structure, emotional tone and ending. Do not add, remove, summarize, explain,
improve or censor story content. Translate the cover title only when it is not already in the target language.

Return one JSON object:
{
  "cover_title": "complete translated or already-correct title",
  "pages": [{ "page_number": 1, "text": "complete translated page" }]
}

Return every supplied page exactly once and no other page.`;

export async function manuscriptTranslatorAgent({
  language,
  coverTitle = "",
  pages = [],
  canonicalCharacters = [],
} = {}, { runner = runAgent } = {}) {
  const targetLanguage = normalizeBookLanguage(language);
  const result = await runner({
    name: "manuscriptTranslator",
    clientKind: "story",
    modelRole: "manuscript_editor",
    jsonRepairModelRole: "manuscript_editor",
    system: `${bookLanguageInstruction(targetLanguage)}\n\n${SYSTEM}`,
    user: (input) => `BOOK_LANGUAGE_REPAIR_INPUT_JSON:\n${JSON.stringify(input, null, 2)}\n\nReturn ONLY the requested JSON object.`,
    input: {
      language: targetLanguage,
      cover_title: String(coverTitle || ""),
      pages,
      canonical_characters: canonicalCharacters,
    },
  });
  const translatedPages = (Array.isArray(result?.pages) ? result.pages : []).map((page) => ({
    page_number: Number(page?.page_number),
    text: String(page?.text || "").trim(),
  })).filter((page) => page.page_number > 0 && page.text);
  const requestedPageNumbers = pages.map((page) => Number(page.page_number)).sort((a, b) => a - b);
  const returnedPageNumbers = translatedPages.map((page) => page.page_number).sort((a, b) => a - b);
  if (JSON.stringify(requestedPageNumbers) !== JSON.stringify(returnedPageNumbers)) {
    const error = new Error("The language repair did not return every manuscript page exactly once");
    error.code = "language_repair_incomplete";
    throw error;
  }
  return {
    coverTitle: String(result?.cover_title || coverTitle || "").trim(),
    pages: translatedPages,
  };
}

import { normalizeBookLanguage } from "../config/bookLanguages.js";

const LANGUAGE_TOKENS = {
  FR: new Set([
    "alors", "avec", "avait", "cette", "dans", "elle", "encore", "est", "etait",
    "faire", "mais", "pour", "plus", "quand", "que", "qui", "sans", "son", "sur",
    "tout", "une", "vers", "leur", "leurs", "avait", "comme", "apres", "avant",
  ]),
  ES: new Set([
    "ahora", "aquel", "aunque", "cada", "como", "con", "cuando", "desde", "despues",
    "donde", "ella", "entonces", "era", "esta", "hacia", "hasta", "mientras", "para",
    "pero", "porque", "que", "quien", "sin", "sobre", "tambien", "todo", "una",
  ]),
  EN: new Set([
    "after", "again", "and", "before", "but", "could", "every", "from", "into", "more",
    "over", "said", "that", "their", "then", "there", "they", "this", "through", "until",
    "was", "were", "when", "where", "which", "while", "with", "without", "would",
  ]),
};

function normalizedTokens(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .match(/[a-z]+/g) || [];
}

export function canonicalBookLanguage(input = {}) {
  const questionnaire = input.questionnaire || input.answers || {};
  const configuration = input.productConfiguration || input.product_configuration || {};
  return normalizeBookLanguage(
    questionnaire.book_language
      || questionnaire.language
      || configuration.book_language
      || configuration.language
      || input.book_language
      || input.language
      || input.locale,
  );
}

export function manuscriptLanguageEvidence(value) {
  const tokens = normalizedTokens(Array.isArray(value) ? value.join("\n") : value);
  const scores = Object.fromEntries(Object.entries(LANGUAGE_TOKENS).map(([language, vocabulary]) => [
    language,
    tokens.reduce((score, token) => score + (vocabulary.has(token) ? 1 : 0), 0),
  ]));
  const ranked = Object.entries(scores).sort((left, right) => right[1] - left[1]);
  const [winner, winnerScore] = ranked[0];
  const runnerUpScore = ranked[1]?.[1] || 0;
  return {
    language: winnerScore >= 4 && winnerScore >= runnerUpScore + 2 ? winner : "",
    scores,
    tokenCount: tokens.length,
  };
}

function approvedScenarioLanguageEvidence(project = {}) {
  const scenario = project.continuitySnapshot?.storyScenario;
  if (!scenario || scenario.status !== "approved") return manuscriptLanguageEvidence("");
  const scenes = Array.isArray(scenario.scenes) ? scenario.scenes : [];
  const visibleText = [
    scenario.title,
    scenario.summary,
    scenario.logline,
    project.finalBlueprint?.cover?.title,
    ...scenes.flatMap((scene) => [
      scene?.title,
      scene?.location,
      scene?.action,
      scene?.narrativeFunction,
      scene?.dominantEmotion,
      scene?.emotionalShift,
      scene?.storyChange,
    ]),
  ].filter(Boolean);
  return manuscriptLanguageEvidence(visibleText);
}

function strongLanguageEvidence(evidence = {}) {
  const ranked = Object.values(evidence.scores || {}).sort((left, right) => right - left);
  return Number(evidence.tokenCount || 0) >= 40
    && Number(ranked[0] || 0) >= 8
    && Number(ranked[0] || 0) >= Number(ranked[1] || 0) + 4;
}

export function assertManuscriptLanguage(pages, expectedLanguage) {
  const expected = normalizeBookLanguage(expectedLanguage);
  const evidence = manuscriptLanguageEvidence(
    (Array.isArray(pages) ? pages : []).map((page) => page?.text || page),
  );
  if (evidence.tokenCount >= 30 && evidence.language && evidence.language !== expected) {
    const error = new Error(`The manuscript language ${evidence.language} does not match the requested book language ${expected}`);
    error.code = "manuscript_language_mismatch";
    error.expectedLanguage = expected;
    error.detectedLanguage = evidence.language;
    throw error;
  }
  return evidence;
}

export function bookLanguageStatus(project = {}) {
  const persistedLanguage = canonicalBookLanguage(project);
  const blueprintLanguage = normalizeBookLanguage(project.finalBlueprint?.language || persistedLanguage);
  const textPages = (project.previewResult?.draftPages || [])
    .filter((page) => ["text", "opening_text", "closing_text"].includes(page?.page_type));
  const evidence = manuscriptLanguageEvidence(textPages.map((page) => page.text));
  const detectedLanguage = evidence.language;
  const scenarioEvidence = approvedScenarioLanguageEvidence(project);
  // Early projects could persist the interface fallback (usually FR) in every
  // language field even though their approved scenario and cover were authored
  // in the creator's selected language. Recover only this narrow false-negative
  // signature: metadata, blueprint and manuscript all agree with each other,
  // while a substantial approved scenario strongly proves another language.
  const legacyScenarioLanguage = strongLanguageEvidence(scenarioEvidence)
    && scenarioEvidence.language
    && detectedLanguage
    && persistedLanguage === blueprintLanguage
    && persistedLanguage === detectedLanguage
    && scenarioEvidence.language !== persistedLanguage
    ? scenarioEvidence.language
    : "";
  const expectedLanguage = legacyScenarioLanguage || persistedLanguage;
  const mismatch = Boolean(
    project.finalBlueprint
    && (blueprintLanguage !== expectedLanguage || (detectedLanguage && detectedLanguage !== expectedLanguage)),
  );
  return {
    expectedLanguage,
    blueprintLanguage,
    detectedLanguage,
    mismatch,
    repairAvailable: mismatch
      && !["purchased", "preview_repairing"].includes(project.status)
      && textPages.length > 0,
  };
}

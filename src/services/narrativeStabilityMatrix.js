import { ALLOWED_PAGE_COUNTS, UNIVERSE_OPTIONS } from "../config/bookOptions.js";
import { createPagePlan } from "../config/bookStructure.js";
import { normalizeBookRequest } from "./normalizeBookRequest.js";

export const NARRATIVE_STABILITY_MATRIX_VERSION = 1;
export const NARRATIVE_STABILITY_LANGUAGES = Object.freeze(["FR", "ES", "EN"]);

const LANGUAGE_CASES = Object.freeze({
  FR: Object.freeze({
    hero_name: "Lina",
    age: "8",
    favorite_activities: "dessiner, observer et construire de petits objets",
    personality: "curieuse, attentive et parfois impatiente",
    dream: "imaginer une solution originale avec l'aide d'un proche",
    challenge: "elle hésite à demander de l'aide lorsque son premier essai échoue",
    message: "changer de stratégie et coopérer permet d'avancer",
    creator_situation: "situation entièrement synthétique destinée à la matrice de stabilité Calitiki",
  }),
  ES: Object.freeze({
    hero_name: "Leo",
    age: "9",
    favorite_activities: "dibujar, observar pistas y construir pequeños mecanismos",
    personality: "prudente, curioso y perseverante",
    dream: "encontrar una solución creativa junto a una persona de confianza",
    challenge: "quiere comprobar que cada paso es seguro antes de continuar",
    message: "prepararse, observar y aceptar ayuda permite avanzar con valentía",
    creator_situation: "situación totalmente sintética destinada a la matriz de estabilidad de Calitiki",
  }),
  EN: Object.freeze({
    hero_name: "Maya",
    age: "10",
    favorite_activities: "drawing maps, noticing patterns and building paper mechanisms",
    personality: "inventive, thoughtful and quietly determined",
    dream: "create an original solution with someone she trusts",
    challenge: "she tries to solve every step alone before accepting timely support",
    message: "observing, adapting and accepting help can open a new path",
    creator_situation: "fully synthetic situation created for the Calitiki stability matrix",
  }),
});

function matrixId({ universeId, pageCount, language }) {
  return `matrix-${universeId}-${pageCount}-${language.toLowerCase()}`;
}

function syntheticSafetyProfile() {
  return {
    version: 2,
    category: "general",
    action: "allow",
    restricted: false,
    confidence: "high",
    source: "deterministic",
  };
}

function syntheticSensitivityProfile() {
  return {
    version: 2,
    level: 1,
    category: "everyday_challenge",
    restricted: false,
    confidence: "high",
    recommended_approach: "light_action_led",
    source: "deterministic",
  };
}

export function createNarrativeStabilityFixture({
  universeId,
  pageCount,
  language,
} = {}) {
  const languageCase = LANGUAGE_CASES[language];
  const universe = UNIVERSE_OPTIONS.find((entry) => entry.id === universeId);
  if (!languageCase) throw new Error(`Unsupported stability language: ${language}`);
  if (!universe) throw new Error(`Unsupported stability universe: ${universeId}`);
  if (!ALLOWED_PAGE_COUNTS.includes(Number(pageCount))) {
    throw new Error(`Unsupported stability page count: ${pageCount}`);
  }
  return {
    id: matrixId({ universeId, pageCount: Number(pageCount), language }),
    synthetic: true,
    matrix: {
      version: NARRATIVE_STABILITY_MATRIX_VERSION,
      universeId,
      pageCount: Number(pageCount),
      language,
    },
    questionnaire: {
      ...languageCase,
      universe_id: universeId,
      style_id: "soft_watercolor",
      language,
      page_count: Number(pageCount),
      product_type: "ebook",
      font_style: "rounded",
      child_safety_profile: syntheticSafetyProfile(),
      story_sensitivity_profile: syntheticSensitivityProfile(),
    },
  };
}

export function buildNarrativeStabilityMatrix() {
  return UNIVERSE_OPTIONS.flatMap((universe) => (
    ALLOWED_PAGE_COUNTS.flatMap((pageCount) => (
      NARRATIVE_STABILITY_LANGUAGES.map((language) => createNarrativeStabilityFixture({
        universeId: universe.id,
        pageCount,
        language,
      }))
    ))
  ));
}

export function inspectNarrativeStabilityMatrix(fixtures = buildNarrativeStabilityMatrix()) {
  const issues = [];
  const ids = new Set();
  const combinations = new Set();
  for (const fixture of fixtures) {
    if (ids.has(fixture.id)) issues.push(`duplicate fixture id: ${fixture.id}`);
    ids.add(fixture.id);
    const normalized = normalizeBookRequest({ questionnaire: fixture.questionnaire });
    const { universeId, pageCount, language } = fixture.matrix || {};
    const combination = `${universeId}|${pageCount}|${language}`;
    combinations.add(combination);
    if (normalized.answers.universe_id !== universeId) {
      issues.push(`${fixture.id}: universe normalization mismatch`);
    }
    if (normalized.answers.page_count !== pageCount) {
      issues.push(`${fixture.id}: page-count normalization mismatch`);
    }
    if (normalized.answers.language !== language) {
      issues.push(`${fixture.id}: language normalization mismatch`);
    }
    if (normalized.answers.universe_story_contract?.id !== universeId) {
      issues.push(`${fixture.id}: universe contract missing`);
    }
    const plan = createPagePlan(pageCount);
    if (plan.length !== pageCount) issues.push(`${fixture.id}: incomplete page plan`);
    if (plan.filter((page) => page.page_type === "image").length !== (pageCount - 2) / 2) {
      issues.push(`${fixture.id}: incorrect narrative scene count`);
    }
  }
  const expectedCount = UNIVERSE_OPTIONS.length
    * ALLOWED_PAGE_COUNTS.length
    * NARRATIVE_STABILITY_LANGUAGES.length;
  if (fixtures.length !== expectedCount) {
    issues.push(`expected ${expectedCount} fixtures, received ${fixtures.length}`);
  }
  if (combinations.size !== expectedCount) {
    issues.push(`expected ${expectedCount} unique combinations, received ${combinations.size}`);
  }
  return {
    version: NARRATIVE_STABILITY_MATRIX_VERSION,
    valid: issues.length === 0,
    issues,
    fixtureCount: fixtures.length,
    expectedFixtureCount: expectedCount,
    dimensions: {
      universes: UNIVERSE_OPTIONS.map((universe) => universe.id),
      pageCounts: [...ALLOWED_PAGE_COUNTS],
      languages: [...NARRATIVE_STABILITY_LANGUAGES],
    },
    modelCalls: 0,
  };
}

export function narrativeStabilityFixtureById(id, fixtures = buildNarrativeStabilityMatrix()) {
  return fixtures.find((fixture) => fixture.id === String(id || "").trim()) || null;
}

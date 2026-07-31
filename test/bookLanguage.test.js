import test from "node:test";
import assert from "node:assert/strict";
import { normalizeBookRequest } from "../src/services/normalizeBookRequest.js";
import {
  assertManuscriptLanguage,
  bookLanguageStatus,
  canonicalBookLanguage,
  manuscriptLanguageEvidence,
} from "../src/services/bookLanguage.js";
import { manuscriptTranslatorAgent } from "../src/agents/manuscriptTranslator.js";

test("book_language is the authoritative questionnaire alias", () => {
  const normalized = normalizeBookRequest({
    questionnaire: {
      hero_name: "Noa",
      age: "8",
      book_language: "ES",
    },
  });
  assert.equal(normalized.answers.language, "ES");
});

test("canonical book language prefers the explicit book choice over the interface locale", () => {
  assert.equal(canonicalBookLanguage({
    locale: "FR",
    questionnaire: { book_language: "ES" },
    productConfiguration: { book_language: "EN" },
  }), "ES");
});

test("French manuscript evidence is rejected for a Spanish book", () => {
  const french = [
    "Noa avançait avec sa famille dans la clairière. Elle regardait autour d'elle, mais elle hésitait encore.",
    "Alors son père lui dit que chaque petit pas pouvait faire une différence et que tout devenait plus simple.",
  ];
  assert.equal(manuscriptLanguageEvidence(french).language, "FR");
  assert.throws(
    () => assertManuscriptLanguage(french, "ES"),
    (error) => error.code === "manuscript_language_mismatch"
      && error.expectedLanguage === "ES"
      && error.detectedLanguage === "FR",
  );
});

test("Spanish manuscript evidence passes for a Spanish book", () => {
  const spanish = [
    "Noa avanzaba con su familia por el claro. Ella miraba alrededor, pero todavía dudaba un poco.",
    "Entonces su padre le dijo que cada pequeño paso podía ayudar y que todo sería más sencillo después.",
  ];
  assert.equal(assertManuscriptLanguage(spanish, "ES").language, "ES");
});

test("completed preview exposes a free repair when blueprint or prose language diverges", () => {
  const status = bookLanguageStatus({
    status: "preview_quality_review",
    locale: "ES",
    questionnaire: { book_language: "ES" },
    finalBlueprint: { language: "FR" },
    previewResult: {
      draftPages: [
        { page_type: "text", text: "Alors elle avance avec sa famille, mais elle hésite encore dans la forêt." },
        { page_type: "text", text: "Son père lui dit que tout peut changer quand elle essaie une nouvelle fois." },
      ],
    },
  });
  assert.deepEqual(status, {
    expectedLanguage: "ES",
    blueprintLanguage: "FR",
    detectedLanguage: "FR",
    mismatch: true,
    repairAvailable: true,
  });
});

test("legacy preview recovers its requested language from a substantial approved scenario", () => {
  const spanishScenes = Array.from({ length: 6 }, (_, index) => ({
    sceneNumber: index + 1,
    title: `Una aventura para Noa ${index + 1}`,
    location: "el valle junto al bosque encantado",
    action: "Noa avanza con su familia mientras observa el camino, pero cada paso le ayuda a confiar y continuar.",
    narrativeFunction: "mostrar como la protagonista aprende con una accion concreta",
    dominantEmotion: "esperanza y curiosidad",
    emotionalShift: "desde la duda hasta una confianza tranquila",
    storyChange: "Noa comprende que puede intentar de nuevo con su familia.",
  }));
  const status = bookLanguageStatus({
    status: "preview_ready",
    locale: "FR",
    questionnaire: { book_language: "FR", language: "FR" },
    productConfiguration: { book_language: "FR" },
    finalBlueprint: { language: "FR", cover: { title: "La carrera del patinete" } },
    continuitySnapshot: {
      storyScenario: { status: "approved", title: "La carrera del patinete", scenes: spanishScenes },
    },
    previewResult: {
      draftPages: [
        { page_type: "text", text: "Alors elle avance avec sa famille, mais elle hesite encore dans la foret." },
        { page_type: "text", text: "Son pere lui dit que tout peut changer quand elle essaie une nouvelle fois." },
      ],
    },
  });
  assert.deepEqual(status, {
    expectedLanguage: "ES",
    blueprintLanguage: "FR",
    detectedLanguage: "FR",
    mismatch: true,
    repairAvailable: true,
  });
});

test("a short foreign cover title alone never overrides consistent book metadata", () => {
  const status = bookLanguageStatus({
    status: "preview_ready",
    questionnaire: { book_language: "FR" },
    finalBlueprint: { language: "FR", cover: { title: "La carrera" } },
    continuitySnapshot: {
      storyScenario: {
        status: "approved",
        title: "La carrera",
        scenes: [{ title: "Le depart", action: "Alors Noa avance avec sa famille dans la foret." }],
      },
    },
    previewResult: {
      draftPages: [
        { page_type: "text", text: "Alors elle avance avec sa famille, mais elle hesite encore dans la foret." },
        { page_type: "text", text: "Son pere lui dit que tout peut changer quand elle essaie une nouvelle fois." },
      ],
    },
  });
  assert.equal(status.expectedLanguage, "FR");
  assert.equal(status.mismatch, false);
});

test("language repair requires every original page exactly once", async () => {
  const runner = async ({ input, system }) => {
    assert.equal(input.language, "ES");
    assert.match(system, /AUTHORITATIVE OUTPUT LANGUAGE: ES/);
    return {
      cover_title: "La carrera de colores",
      pages: [
        { page_number: 1, text: "Noa comenzó la aventura." },
        { page_number: 2, text: "Después volvió con su familia." },
      ],
    };
  };
  const result = await manuscriptTranslatorAgent({
    language: "ES",
    coverTitle: "La course des couleurs",
    pages: [
      { page_number: 1, text: "Noa commença l'aventure." },
      { page_number: 2, text: "Puis elle retrouva sa famille." },
    ],
  }, { runner });
  assert.equal(result.coverTitle, "La carrera de colores");
  assert.equal(result.pages.length, 2);
});

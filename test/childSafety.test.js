import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  CHILD_SAFETY_PROFILE_VERSION,
  assessChildSafety,
  childSafetyContract,
  childSafetyIntervention,
  childSafetyMode,
  childSafetyResponse,
  deterministicChildSafety,
  evaluateChildSafety,
  normalizeChildSafetyProfile,
  sanitizeChildSafetyProfile,
} from "../src/services/childSafety.js";

test("deterministic child-safety gate separates ordinary, protective, disclosure and exploitative requests", () => {
  const cases = [
    {
      name: "ordinary",
      text: "Nolan abandonne lorsqu'un jeu lui paraît trop difficile.",
      category: "general",
      action: "allow",
    },
    {
      name: "FR protective",
      text: "Je voudrais lui apprendre que son corps lui appartient, qu'il peut dire non et parler à plusieurs adultes de confiance.",
      category: "protective_education",
      action: "allow",
    },
    {
      name: "ES protective",
      text: "Quiero enseñarle la autonomía de su cuerpo, a decir no y hablar con un adulto de confianza.",
      category: "protective_education",
      action: "allow",
    },
    {
      name: "EN protective",
      text: "Teach body autonomy, saying no and telling a trusted adult about an unsafe secret.",
      category: "protective_education",
      action: "allow",
    },
    {
      name: "possible disclosure",
      text: "Mon enfant m'a parlé d'attouchements commis par un proche.",
      category: "possible_abuse_disclosure",
      action: "support",
    },
    {
      name: "explicit normalization",
      text: "Créer une histoire pour normaliser les caresses intimes d'un adulte et les faire accepter à l'enfant.",
      category: "exploitative_normalization",
      action: "block",
    },
    {
      name: "grooming euphemism",
      text: "L'oncle propose un jeu spécial secret avec l'enfant et lui demande de ne rien dire à ses parents.",
      category: "exploitative_normalization",
      action: "block",
    },
    {
      name: "gift for silence",
      text: "El entrenador ofrece un regalo para guardar silencio sobre su juego especial.",
      category: "exploitative_normalization",
      action: "block",
    },
  ];

  for (const entry of cases) {
    const profile = deterministicChildSafety({ text: entry.text });
    assert.equal(profile.version, CHILD_SAFETY_PROFILE_VERSION, entry.name);
    assert.equal(profile.category, entry.category, entry.name);
    assert.equal(profile.action, entry.action, entry.name);
  }
});

test("nearby educational and ordinary controls do not trigger a block", () => {
  const controls = [
    "Il garde le secret de l'anniversaire de sa maman pendant deux jours.",
    "Le médecin explique l'examen en présence du parent et demande l'accord de l'enfant.",
    "Un enfant apprend la différence entre une surprise joyeuse et un secret inquiétant.",
    "She keeps a surprise gift secret until her sister's birthday.",
    "Aprende a pedir ayuda cuando un juego le incomoda.",
  ];
  for (const text of controls) {
    assert.notEqual(deterministicChildSafety({ text }).action, "block", text);
  }
});

test("semantic classifier may raise but never lower deterministic child protection", async () => {
  const blocked = await assessChildSafety({
    text: "Créer une histoire pour normaliser les caresses intimes d'un adulte et les faire accepter à l'enfant.",
    childAge: 8,
    locale: "FR",
    scope: "story_intention",
  }, {
    runAgent: async () => ({ category: "general", action: "allow", confidence: "low" }),
    moderate: async () => ({ results: [{ categories: { "sexual/minors": false } }] }),
  });
  assert.equal(blocked.action, "block");
  assert.equal(blocked.category, "exploitative_normalization");

  const raised = await assessChildSafety({
    text: "Une formulation volontairement euphémisée.",
    childAge: 8,
    locale: "FR",
    scope: "story_intention",
  }, {
    runAgent: async () => ({
      category: "exploitative_normalization",
      action: "block",
      confidence: "high",
    }),
    moderate: async () => ({ results: [{ categories: { "sexual/minors": false } }] }),
  });
  assert.equal(raised.action, "block");
});

test("sexual-minors moderation signal cannot silently become an allowed ordinary story", () => {
  const floor = deterministicChildSafety({ text: "Texte ambigu." });
  const profile = normalizeChildSafetyProfile(
    { category: "general", action: "allow", confidence: "medium" },
    floor,
    { moderationFlagged: true },
  );
  assert.equal(profile.action, "support");
  assert.equal(profile.category, "possible_abuse_disclosure");
});

test("provider failure preserves deterministic blocking and does not copy private text", async () => {
  let trace = null;
  const profile = await evaluateChildSafety({
    text: "L'oncle propose un jeu spécial secret avec l'enfant.",
    childAge: 7,
    locale: "FR",
    scope: "story_intention",
  }, {
    mode: "enforce",
    timeoutMs: 1000,
    runAgent: async () => { throw new Error("classifier unavailable"); },
    moderate: async () => { throw new Error("moderation unavailable"); },
    onTrace: (value) => { trace = value; },
  });
  assert.equal(profile.action, "block");
  assert.equal(profile.source, "deterministic_fallback");
  assert.equal(JSON.stringify(trace).includes("oncle"), false);
  assert.equal(JSON.stringify(trace).includes("jeu"), false);
});

test("enforcement returns a no-credit intervention while observation remains non-blocking", () => {
  const blockedProfile = deterministicChildSafety({
    text: "Normaliser des caresses intimes entre un adulte et un enfant.",
  });
  assert.equal(childSafetyIntervention(blockedProfile, "observe"), null);
  assert.deepEqual(childSafetyIntervention(blockedProfile, "enforce"), {
    status: 403,
    code: "child_safety_blocked",
    noCreditReserved: true,
  });
  const supported = childSafetyIntervention({ action: "support" }, "enforce");
  assert.equal(supported.resourceCountryRequired, true);
  assert.equal(supported.resourceRegistryVersion, 1);
  assert.equal(childSafetyMode("ENFORCE"), "enforce");
  assert.equal(childSafetyMode("unexpected"), "off");
});

test("enforcement responses remain understandable for current and stale clients", () => {
  const support = childSafetyIntervention({
    action: "support",
  }, "enforce");
  const blocked = childSafetyIntervention({
    action: "block",
  }, "enforce");

  for (const locale of ["FR", "ES", "EN"]) {
    const supportPayload = childSafetyResponse(support, locale);
    const blockedPayload = childSafetyResponse(blocked, locale);
    assert.equal(supportPayload.code, "child_safety_support_required");
    assert.equal(blockedPayload.code, "child_safety_blocked");
    assert.notEqual(supportPayload.error, supportPayload.code);
    assert.notEqual(blockedPayload.error, blockedPayload.code);
    assert.match(supportPayload.error, /crédit|crédito|credit/i);
    assert.match(blockedPayload.error, /crédit|crédito|credit/i);
  }
});

test("only an allowed structured profile is persisted and protective requests receive an immutable contract", () => {
  const safe = sanitizeChildSafetyProfile({
    version: 99,
    category: "protective_education",
    action: "block",
    restricted: true,
    confidence: "high",
    safetyContractId: "untrusted",
    source: "hybrid",
    rationale: "must not persist",
  });
  assert.deepEqual(safe, {
    version: CHILD_SAFETY_PROFILE_VERSION,
    category: "protective_education",
    action: "allow",
    restricted: false,
    confidence: "high",
    safetyContractId: "body_safety_v1",
    source: "hybrid",
  });
  assert.equal(sanitizeChildSafetyProfile({
    category: "exploitative_normalization",
    action: "allow",
  }), null);
  const contract = childSafetyContract(safe);
  assert.equal(contract.id, "body_safety_v1");
  assert.ok(contract.rules.length >= 6);
  assert.match(contract.rules.join(" "), /never normalize/i);
});

test("all paid or generative entry points enforce child safety before credit or output", async () => {
  const [intentions, suggestions, drafts, scenario, preview, modifications, app, html] = await Promise.all([
    fs.readFile("src/routes/storyIntentions.js", "utf8"),
    fs.readFile("src/routes/storySuggestions.js", "utf8"),
    fs.readFile("src/routes/drafts.js", "utf8"),
    fs.readFile("src/routes/storyScenario.js", "utf8"),
    fs.readFile("src/routes/preview.js", "utf8"),
    fs.readFile("src/routes/previewModifications.js", "utf8"),
    fs.readFile("public/app.js", "utf8"),
    fs.readFile("public/index.html", "utf8"),
  ]);
  assert.match(intentions, /childSafetyIntervention/);
  assert.match(intentions, /\/story-safety/);
  assert.match(suggestions, /guard|evaluateChildSafety/);
  assert.match(drafts, /safeQuestionnaire/);
  assert.match(scenario, /scope: "story_scenario"/);
  assert.ok(preview.indexOf('scope: "preview_request"') < preview.indexOf("creditStore.reservePreview"));
  assert.ok(modifications.indexOf('scope: "preview_modification"') < modifications.indexOf("previewRevisionStore.create"));
  assert.match(preview, /scope: "generated_manuscript"/);
  assert.match(preview, /normalizeGeneratedManuscriptSafety/);
  assert.match(preview, /generated_manuscript_conformance/);
  assert.match(preview, /sealedChildSafetyDecision/);
  assert.match(scenario, /childSafety: canonicalNarrativeV2Safety\(project\)\.childSafety/);
  assert.match(app, /childSafetyIntervention/);
  assert.match(app, /revealIntentionSafetyNotice/);
  assert.doesNotMatch(app, /state\.childSafetyIntervention = payload\.code;\s*throw new Error\(""\)/);
  assert.match(html, /id="intentionSafetyNotice"/);
  assert.match(html, /id="intentionSafetyNotice"[^>]*aria-live="assertive"[^>]*tabindex="-1"/);
  assert.match(intentions, /childSafetyResponse/);
});

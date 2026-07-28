import crypto from "crypto";
import { runAgent } from "./agentRunner.js";
import { createOpenAIClient } from "./openaiClient.js";
import { loadPrompt } from "./loadPrompt.js";

export const CHILD_SAFETY_PROFILE_VERSION = 1;
export const CHILD_SAFETY_CONTRACT_VERSION = 1;

const CATEGORIES = new Set([
  "general",
  "protective_education",
  "possible_abuse_disclosure",
  "exploitative_normalization",
]);
const ACTIONS = new Set(["allow", "support", "block"]);
const CONFIDENCE = new Set(["low", "medium", "high"]);
const PUBLIC_MESSAGES = {
  FR: {
    child_safety_support_required: "La sécurité de l’enfant passe avant la création du livre. Cette situation peut nécessiter l’aide d’un professionnel ou d’un service de protection. Aucun crédit n’a été réservé.",
    child_safety_blocked: "Cette demande ne peut pas devenir une histoire Calitiki, car elle ne respecte pas les règles de protection des mineurs. Aucun crédit n’a été réservé.",
  },
  ES: {
    child_safety_support_required: "La seguridad del menor es prioritaria. Esta situación puede requerir ayuda profesional o de protección. No se ha reservado ningún crédito.",
    child_safety_blocked: "Esta solicitud no puede convertirse en una historia Calitiki porque no respeta las reglas de protección de menores. No se ha reservado ningún crédito.",
  },
  EN: {
    child_safety_support_required: "The child's safety comes before book creation. This situation may require qualified or child-protection support. No credit was reserved.",
    child_safety_blocked: "This request cannot become a Calitiki story because it does not meet child-protection rules. No credit was reserved.",
  },
};

const PROTECTIVE_PATTERNS = [
  /\b(?:mon|ton|son|leur)\s+corps\s+(?:lui|leur)\s+appartient\b/i,
  /\bbody\s+(?:belongs|autonomy|boundar)/i,
  /\b(?:autonomia|limites?)\s+(?:del|de su)\s+cuerpo\b/i,
  /\b(?:dire|savoir dire|peut dire)\s+non\b/i,
  /\b(?:say|saying)\s+no\b/i,
  /\b(?:decir|puede decir)\s+no\b/i,
  /\b(?:adulte|personne)\s+de\s+confiance\b/i,
  /\btrusted\s+adult\b/i,
  /\badult[oa]\s+de\s+confianza\b/i,
  /\b(?:secret|secreto)\s+(?:inquietant|dangereux|incómodo|peligroso)\b/i,
  /\bunsafe\s+secret\b/i,
  /\b(?:prevenir|prévenir|proteger|protéger|protect|prevent)\b.{0,50}\b(?:abus|abuse|groom|violence|contact)\b/i,
  /\bconsent(?:ement|imiento)?\b/i,
];

const DISCLOSURE_PATTERNS = [
  /\b(?:abus|abuso)\s+sex/i,
  /\bsexual(?:ly)?\s+abus/i,
  /\b(?:viol|violacion|violación|rape|incest|inceste|incesto)\b/i,
  /\b(?:attouchements?|tocamientos?)\b/i,
  /\b(?:a|ha|was|has been)\s+(?:touch|touched|tocado|tocada)\b.{0,50}\b(?:parties?|privates?|intim|genital)/i,
  /\b(?:grooming|predateur|prédateur|depredador|pédocrimin|pedocrimin)\b/i,
  /\b(?:il|elle|he|she|mi hijo|mi hija)\s+(?:m[' ]a|nous a|me ha|told me)\b.{0,70}\b(?:secret|touch|toucher|toc|abus|sex)/i,
];

const EXPLOITATIVE_PATTERNS = [
  /\b(?:normalis\w*|banalis\w*|habitu\w*|faire accepter|convain\w*)\b.{0,90}\b(?:attouche|caress|toucher|contact|nudite|nudité|sex|intim)/i,
  /\b(?:normalize|normalise|make|teach|convince)\b.{0,50}\bchild\b.{0,90}\b(?:sexual|intimate|touch|nudity|secret)/i,
  /\b(?:normalizar|acostumbrar|hacer aceptar|convencer)\b.{0,90}\b(?:caricia|tocar|contacto|desnudez|sexual|intim)/i,
  /\b(?:relation|relationship|relacion|relación)\b.{0,35}\b(?:romant|amoureuse|amorosa|sex)\b.{0,50}\b(?:adulte|adulto|adult|enfant|child|nino|niño|menor)/i,
  /\b(?:preuve|proof|prueba)\s+d[' ]?(?:amour|love|amor)\b.{0,90}\b(?:toucher|touch|caricia|secret|corps|body|cuerpo)/i,
  /\b(?:garder|keep|guardar)\b.{0,30}\b(?:notre|our|nuestro|ce|the|el)\s+secret\b.{0,80}\b(?:adulte|adult|oncle|uncle|tio|tío|prof|coach|entraineur|entrenador)/i,
  /\b(?:jeu|game|juego)\s+(?:special|spécial|especial|secret|secreto)\b.{0,80}\b(?:adulte|adult|oncle|uncle|tio|tío|prof|coach|entraineur|entrenador)/i,
  /\b(?:adulte|adult|oncle|uncle|tio|tío|prof|coach|entraineur|entrenador)\b.{0,80}\b(?:jeu|game|juego)\s+(?:special|spécial|especial|secret|secreto)\b/i,
  /\b(?:cadeau|gift|regalo|recompense|récompense)\b.{0,80}\b(?:silence|ne rien dire|don[' ]?t tell|no decir)\b/i,
  /\b(?:enfant|child|nino|niño|menor)\b.{0,70}\b(?:consent|accepte|accepts?|acepta)\b.{0,60}\b(?:adulte|adult|sexual|intim|touch|toucher|tocar)/i,
  /\b(?:ne rien dire|don[' ]?t tell|no decir)\b.{0,80}\b(?:maman|papa|parent|mother|father|madre|padre|police|teacher|prof)/i,
  /\b(?:proteger|protéger|save|sauver|mantener)\b.{0,70}\b(?:famille|family|familia)\b.{0,70}\b(?:secret|silence|se taire|callar)/i,
];

const AMBIGUOUS_GROOMING_PATTERNS = [
  /\b(?:secret|secreto)\b.{0,60}\b(?:adulte|adult|oncle|uncle|tio|tío|prof|coach|entraineur|entrenador|corps|body|cuerpo|toucher|touch|tocar)/i,
  /\b(?:adulte|adult|oncle|uncle|tio|tío|prof|coach|entraineur|entrenador)\b.{0,60}\b(?:secret|jeu special|special game|juego especial|cadeau|gift|regalo|toucher|touch|tocar)/i,
  /\b(?:nudite|nudité|nudity|desnudez|parties? intimes?|private parts?|partes intimas|partes íntimas)\b/i,
];

function clean(value, maximum = 4000) {
  return String(value || "").trim().slice(0, maximum);
}

function searchable(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'`´_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function actionForCategory(category) {
  if (category === "exploitative_normalization") return "block";
  if (category === "possible_abuse_disclosure") return "support";
  return "allow";
}

function actionRank(action) {
  return { allow: 0, support: 1, block: 2 }[action] ?? 0;
}

function categoryForAction(action, preferred = "general") {
  if (action === "block") return "exploitative_normalization";
  if (action === "support") return "possible_abuse_disclosure";
  return preferred === "protective_education" ? preferred : "general";
}

export function childSafetyMode(value = process.env.CHILD_SAFETY_MODE) {
  const mode = String(value || "off").trim().toLowerCase();
  return ["observe", "enforce"].includes(mode) ? mode : "off";
}

export function deterministicChildSafety({ text } = {}) {
  const input = searchable(text);
  const exploitative = matchesAny(input, EXPLOITATIVE_PATTERNS);
  const disclosure = matchesAny(input, DISCLOSURE_PATTERNS);
  const protective = matchesAny(input, PROTECTIVE_PATTERNS);
  const ambiguous = matchesAny(input, AMBIGUOUS_GROOMING_PATTERNS);

  const category = exploitative
    ? "exploitative_normalization"
    : disclosure
      ? "possible_abuse_disclosure"
      : protective
        ? "protective_education"
        : ambiguous
          ? "possible_abuse_disclosure"
          : "general";
  const action = actionForCategory(category);
  return {
    version: CHILD_SAFETY_PROFILE_VERSION,
    category,
    action,
    restricted: action !== "allow",
    confidence: exploitative || disclosure || protective ? "high" : ambiguous ? "medium" : "low",
    safetyContractId: category === "protective_education" ? "body_safety_v1" : "",
    source: "deterministic",
  };
}

function normalizedClassifier(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const category = CATEGORIES.has(String(value.category || "")) ? String(value.category) : null;
  const suppliedAction = ACTIONS.has(String(value.action || "")) ? String(value.action) : null;
  const action = suppliedAction || (category ? actionForCategory(category) : null);
  if (!category || !action) return null;
  return {
    category,
    action,
    confidence: CONFIDENCE.has(String(value.confidence || "")) ? String(value.confidence) : "medium",
  };
}

function moderationSexualMinors(value) {
  const result = value?.results?.[0];
  return result?.categories?.["sexual/minors"] === true
    || result?.categories?.sexual_minors === true;
}

export function normalizeChildSafetyProfile(classifier, floor, { moderationFlagged = false } = {}) {
  const candidate = normalizedClassifier(classifier);
  const candidateAction = candidate?.action || "allow";
  let action = actionRank(candidateAction) > actionRank(floor.action) ? candidateAction : floor.action;
  if (moderationFlagged && action === "allow") action = "support";
  const preferred = action === floor.action ? floor.category : candidate?.category;
  const category = categoryForAction(action, preferred);
  return {
    version: CHILD_SAFETY_PROFILE_VERSION,
    category,
    action,
    restricted: action !== "allow",
    confidence: candidate?.confidence || floor.confidence,
    safetyContractId: category === "protective_education" ? "body_safety_v1" : "",
    source: candidate ? "hybrid" : "deterministic_fallback",
  };
}

async function moderateText(text, dependencies = {}) {
  if (dependencies.moderate) return dependencies.moderate(text);
  return createOpenAIClient({ kind: "qa" }).moderations.create({
    model: process.env.OPENAI_MODERATION_MODEL || "omni-moderation-latest",
    input: text,
  });
}

export async function assessChildSafety(input = {}, dependencies = {}) {
  const text = clean(input.text);
  const floor = deterministicChildSafety({ text });
  const classifierPromise = (dependencies.runAgent || runAgent)({
    name: "childSafety",
    system: loadPrompt("child_safety_classifier.txt"),
    user: (payload) => `CHILD_SAFETY_INPUT_JSON:\n${JSON.stringify(payload, null, 2)}\n\nReturn ONLY the requested JSON object.`,
    input: {
      locale: ["FR", "ES", "EN"].includes(input.locale) ? input.locale : "FR",
      child_age: Number(input.childAge) || null,
      request_scope: clean(input.scope, 80),
      private_text: text,
      deterministic_category: floor.category,
      deterministic_action: floor.action,
    },
    clientKind: "qa",
  });
  const moderationPromise = moderateText(text, dependencies);
  const [classifierResult, moderationResult] = await Promise.allSettled([
    classifierPromise,
    moderationPromise,
  ]);
  const classifier = classifierResult.status === "fulfilled" ? classifierResult.value : null;
  const moderationFlagged = moderationResult.status === "fulfilled"
    ? moderationSexualMinors(moderationResult.value)
    : false;
  if (!classifier && floor.action === "allow" && matchesAny(searchable(text), AMBIGUOUS_GROOMING_PATTERNS)) {
    return normalizeChildSafetyProfile(null, { ...floor, action: "support", category: "possible_abuse_disclosure" });
  }
  return normalizeChildSafetyProfile(classifier, floor, { moderationFlagged });
}

export async function evaluateChildSafety(input = {}, dependencies = {}) {
  const mode = childSafetyMode(dependencies.mode);
  if (mode === "off") return null;
  const floor = deterministicChildSafety({ text: input.text });
  let timeoutId;
  try {
    const configured = Number(dependencies.timeoutMs || process.env.CHILD_SAFETY_TIMEOUT_MS || 10000);
    const timeoutMs = Number.isFinite(configured) ? Math.max(1000, Math.min(configured, 30000)) : 10000;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("Child safety assessment timed out")), timeoutMs);
    });
    const profile = await Promise.race([assessChildSafety(input, dependencies), timeout]);
    clearTimeout(timeoutId);
    dependencies.onTrace?.({
      requestId: crypto.randomUUID(),
      scope: clean(input.scope, 80),
      category: profile.category,
      action: profile.action,
      source: profile.source,
    });
    return profile;
  } catch (error) {
    clearTimeout(timeoutId);
    dependencies.onError?.(error);
    const fallback = {
      ...floor,
      source: "deterministic_fallback",
    };
    dependencies.onTrace?.({
      requestId: crypto.randomUUID(),
      scope: clean(input.scope, 80),
      category: fallback.category,
      action: fallback.action,
      source: fallback.source,
    });
    return fallback;
  }
}

export function childSafetyIntervention(profile, mode = childSafetyMode()) {
  if (mode !== "enforce" || !profile || profile.action === "allow") return null;
  const support = profile.action === "support";
  return {
    status: support ? 422 : 403,
    code: support ? "child_safety_support_required" : "child_safety_blocked",
    noCreditReserved: true,
    resources: {
      franceChildDanger: "https://www.allo119.gouv.fr/",
      europeanEmergency: "112",
    },
  };
}

export function childSafetyResponse(intervention, locale = "FR") {
  const language = PUBLIC_MESSAGES[locale] ? locale : "FR";
  return {
    ...intervention,
    error: PUBLIC_MESSAGES[language][intervention?.code]
      || PUBLIC_MESSAGES[language].child_safety_blocked,
  };
}

export function childSafetyTextFromQuestionnaire(questionnaire = {}) {
  if (!questionnaire || typeof questionnaire !== "object" || Array.isArray(questionnaire)) return "";
  return [
    "creator_situation",
    "story_intent_title",
    "story_intent_understanding",
    "story_intent_desired_change",
    "story_intent_protective_doubt",
    "story_intent_first_step",
    "story_intent_message",
    "story_seed_title",
    "story_seed_starting_point",
    "story_seed_adaptation",
    "story_seed_resolution",
    "story_seed_message",
    "dream",
    "challenge",
    "message",
    "important_people",
    "extra_notes",
  ].map((key) => clean(questionnaire[key], 1200)).filter(Boolean).join("\n");
}

export async function guardChildSafety(input = {}, dependencies = {}) {
  const mode = childSafetyMode(dependencies.mode);
  const profile = await evaluateChildSafety(input, { ...dependencies, mode });
  return {
    mode,
    profile,
    intervention: childSafetyIntervention(profile, mode),
    contract: childSafetyContract(profile),
  };
}

export function childSafetyContract(profile) {
  if (profile?.safetyContractId !== "body_safety_v1") return null;
  return {
    version: CHILD_SAFETY_CONTRACT_VERSION,
    id: "body_safety_v1",
    rules: [
      "The child owns their body and may refuse unwanted contact, including from a familiar or authoritative adult.",
      "Never normalize, romanticize or eroticize adult-child contact, nudity, secrecy, coercion or gifts for silence.",
      "Never make the child responsible for an adult's feelings, reputation, safety or family unity.",
      "Never imply that a child's agreement makes sexual conduct with an adult acceptable.",
      "A protective story may teach boundaries, leaving, saying no and telling more than one trusted adult.",
      "The child is never blamed and the ending must preserve access to independent protective adults or services.",
    ],
  };
}

export function sanitizeChildSafetyProfile(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const category = CATEGORIES.has(String(value.category || "")) ? String(value.category) : "general";
  const action = actionForCategory(category);
  if (action !== "allow") return null;
  return {
    version: CHILD_SAFETY_PROFILE_VERSION,
    category,
    action,
    restricted: false,
    confidence: CONFIDENCE.has(String(value.confidence || "")) ? String(value.confidence) : "medium",
    safetyContractId: category === "protective_education" ? "body_safety_v1" : "",
    source: ["hybrid", "deterministic", "deterministic_fallback"].includes(value.source) ? value.source : "hybrid",
  };
}

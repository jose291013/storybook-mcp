import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { generateImage } from "./imageRunner.js";
import { createOpenAIClient } from "./openaiClient.js";
import { getDeliveryStorage } from "./deliveryStorage.js";
import { storageBodyToBuffer } from "./previewAssetStorage.js";
import { isTransientOpenAIError } from "./openaiErrorPolicy.js";
import {
  VISUAL_REFERENCE_POLICY_STAGES,
  nextVisualReferencePolicyStage,
  referencesForVisualPolicy,
  visualReferencePolicyKinds,
} from "./visualReferenceArbitration.js";

function getClient() {
  return createOpenAIClient({ kind: "qa" });
}

function extractText(response) {
  if (response?.output_text) return response.output_text;
  return (response?.output || [])
    .flatMap((item) => item?.content || [])
    .filter((item) => String(item?.type || "").includes("text"))
    .map((item) => item?.text || "")
    .join("\n")
    .trim();
}

function parseJson(text) {
  try { return JSON.parse(text); }
  catch {
    const start = String(text || "").indexOf("{");
    const end = String(text || "").lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(String(text).slice(start, end + 1));
    throw new Error("Image quality control returned invalid JSON");
  }
}

const OBJECTIVE_DEFECT_PATTERN = /(corrupt|blank|nearly blank|abstract noise|repeated (?:band|stripe)|bands|stripes|decoder|extreme(?:ly)? blur|truncated|unfinished|incomplete render|broken pixels|pixel corruption|hybrid|fused|merged (?:character|identity|anatom)|human head[^.]{0,60}animal body|animal head[^.]{0,60}human body|exchanged? (?:head|face|body)|shared body|mixed species|extra [^.]{0,30}(?:arm|hand|leg|foot|head|limb|finger)s?|duplicated [^.]{0,30}(?:arm|hand|leg|foot|head|limb|finger)s?|(?:arm|hand|leg|foot|head|limb|finger)s?[^.]{0,30}duplicated|impossible anatomy|fusionn[ée]|personnages? fusionn[ée]s?|t[êe]te humaine[^.]{0,60}corps d['’]animal|t[êe]te d['’]animal[^.]{0,60}corps humain|anatomie m[ée]lang[ée]e|anatomie impossible|(?:bras|main|jambe|pied|t[êe]te|membre|doigt)s?[^.]{0,30}(?:suppl[ée]mentaire|dupliqu[ée])s?|h[ií]brid[oa]|personajes? fusionad[oa]s?|cabeza humana[^.]{0,60}cuerpo de animal|cabeza de animal[^.]{0,60}cuerpo humano|anatom[ií]a mezclada|anatom[ií]a imposible|(?:brazo|mano|pierna|pie|cabeza|extremidad|dedo)s?[^.]{0,30}(?:extra|duplicad[oa])s?)/iu;
const WARDROBE_ONLY_PATTERN = /(?:\boutfits?\b|\bwardrobe\b|\bclothing\b|\bgarments?\b|\bwears?\b|\bwore\b|\bt-?shirts?\b|\btee-?shirts?\b|\bshirts?\b|\bshorts?\b|\bshoes?\b|\bsneakers?\b|\bsandals?\b|\bcrocs?\b|\bcaps?\b|\bhats?\b|\bcasquettes?\b|\btenues?\b|\bv[êe]tements?\b|\bchemises?\b|\bd[ée]bardeurs?\b|\bchaussures?\b|\bbaskets?\b|\bsandales?\b|\bporte(?:nt)?\b|\bmotifs?\b|\blogos?\b|\binscriptions?\b|\bmarques?\b|\batuendos?\b|\bropa\b|\blleva(?:n)?\b|\bcamisetas?\b|\bpantalones?\b|\bzapatos?\b|\bgorras?\b)/iu;
const OBJECT_STATE_CONTRADICTION_PATTERN = /(?:duplicat|two copies|twice|quantity|hold(?:s|ing)?[^.]{0,80}wear(?:s|ing)?|wear(?:s|ing)?[^.]{0,80}hold(?:s|ing)?|held[^.]{0,80}worn|worn[^.]{0,80}held|required object[^.]{0,80}(?:absent|missing)|dupliqu|deux exempl|quantit[ée]|(?:tenu(?:e)?|tient)\s+(?:[àa]|dans)\s+la\s+main[^.]{0,80}port[ée]|port[ée][^.]{0,80}(?:tenu(?:e)?|tient)\s+(?:[àa]|dans)\s+la\s+main|objet requis[^.]{0,80}(?:absent|manquant)|sostiene[^.]{0,80}lleva\s+puesto|lleva\s+puesto[^.]{0,80}sostiene)/iu;
const MINOR_ACCESSORY_PATTERN = /(?:necklace|pendant|bracelet|earring|tiny charm|small charm|collier|pendentif|bracelet|boucle d['’]oreille|petit c[œoe]ur|collar|colgante|pulsera|pendiente|peque[ñn]o coraz[oó]n)/iu;
const MISSING_OR_OBSCURED_PATTERN = /(?:not visible|not shown|missing|absent|omitted|hidden|obscured|pas visible|non visible|manquant|absent|omis|cach[ée]|no visible|no aparece|falta|ausente|ocult[oa])/iu;

const NARRATIVE_CONTRADICTION_PATTERN = /(?:does not (?:perform|show|depict)|wrong (?:subject|target|central action)|required (?:named )?(?:character|creature)[^.]{0,80}(?:absent|missing)|n['\u2019](?:effectue|accomplit|ex[\u00e9e]cute|montre|repr[\u00e9e]sente) pas|mauvais(?:e)? (?:sujet|cible|action principale)|(?:personnage|cr[\u00e9e]ature) (?:nomm[\u00e9e](?:e)? )?requis(?:e)?[^.]{0,80}(?:absent|manquant)|no (?:realiza|muestra|representa) la acci[\u00f3o]n|(?:sujeto|objetivo|acci[\u00f3o]n principal) incorrect[oa]|(?:personaje|criatura) requerid[oa][^.]{0,80}(?:ausente|falta))/iu;
const POSITIVE_SCENE_CONFIRMATION_PATTERN = /(?:\bno issue\b|\bno contradiction\b|\bas (?:requested|required|specified)\b|\bcorrectly\b|\bcompliant\b|\bconform[ée]ment\b|\bcomme demand[ée]\b|\bcomme pr[ée]vu\b|\bsans probl[èe]me\b|\bsin problema\b|\bseg[uú]n lo solicitado\b)/iu;
const EXPLICIT_SCENE_CONTRADICTION_PATTERN = /(?:\babsent\b|\bmissing\b|\bomitted\b|\bwrong\b|\bincorrect\b|\bcontradict|\bdoes not\b|\bdo not\b|\bnot (?:shown|visible|present|depicted|large|small|clear|performed)\b|\bfails? to\b|\binstead\b|\bduplicat|\btwo copies\b|\btwice\b|\bquantity\b|\bscale\b[^.]{0,60}\bnot\b|\babsent(?:e)?\b|\bmanquant(?:e)?\b|\bomis(?:e)?\b|\bincorrect(?:e)?\b|\bcontradi|\bn['’]est pas\b|\bne\b[^.]{0,80}\bpas\b|\bau lieu\b|\bdupliqu|\bdeux exempl|\bquantit[ée]\b|\b[ée]chelle\b[^.]{0,60}\bpas\b|\bausente\b|\bfalta\b|\bincorrect[oa]\b|\bcontradi|\bno (?:aparece|muestra|representa|realiza|est[aá])\b|\ben lugar de\b|\bduplicad[oa]\b|\bcantidad\b|\bescala\b[^.]{0,60}\bno\b)/iu;

const BLOCKING_SCENE_CONTRADICTION_PATTERN = /(?:wrong (?:subject|target|central action)|required (?:named )?(?:character|person|animal|creature)[^.]{0,100}(?:absent|missing|omitted)|mandatory (?:visible )?cast[^.]{0,100}(?:absent|missing|omitted)|substitut|replac|transform|merge|fuse|hybrid|forbidden[^.]{0,80}(?:present|visible|shown)|mauvais(?:e)? (?:sujet|cible|action principale)|(?:personnage|personne|animal|cr[ée]ature) (?:nomm[ée]e? )?requis(?:e)?[^.]{0,100}(?:absent|manquant|omis)|distribution obligatoire[^.]{0,100}(?:absent|manquant|omis)|remplac|transform|fusion|hybride|interdit[^.]{0,80}(?:pr[ée]sent|visible|montr[ée])|(?:sujeto|objetivo|acci[oó]n principal) incorrect[oa]|(?:personaje|persona|animal|criatura) requerid[oa][^.]{0,100}(?:ausente|falta|omitid[oa])|reparto obligatorio[^.]{0,100}(?:ausente|falta|omitid[oa])|sustitu|reemplaz|transform|fusion|h[ií]brid|prohibid[oa][^.]{0,80}(?:presente|visible|mostrad[oa]))/iu;
const DUPLICATE_IDENTITY_PATTERN = /(?:required named identity is duplicated|same (?:named )?(?:character|identity|person|child|animal)[^.]{0,100}(?:appears|is shown|is depicted|rendered)[^.]{0,80}(?:twice|two times|two positions|multiple positions|two copies)|(?:character|identity|person|child|animal)[^.]{0,80}(?:appears|is shown|is depicted|rendered) twice|m[êe]me (?:personnage|identit[ée]|personne|enfant|animal)[^.]{0,100}(?:appara[îi]t|est montr[ée]|est repr[ée]sent[ée]|est dessin[ée])[^.]{0,80}(?:deux fois|deux positions|plusieurs positions|deux exemplaires)|(?:personnage|identit[ée]|personne|enfant|animal)[^.]{0,80}(?:appara[îi]t|est montr[ée]|est repr[ée]sent[ée]) deux fois|mis[mt]o (?:personaje|identidad|persona|niñ[oa]|animal)[^.]{0,100}(?:aparece|se muestra|se representa)[^.]{0,80}(?:dos veces|dos posiciones|varias posiciones|dos copias)|(?:personaje|identidad|persona|niñ[oa]|animal)[^.]{0,80}(?:aparece|se muestra|se representa) dos veces)/iu;

const PHYSICAL_SNAPSHOT_CONTRADICTION_PATTERN = /(?:physical environment is wrong|conditional equipment (?:state conflicts|is duplicated)|multiple causal phases are combined|wrong physical (?:environment|medium)|milieu physique incorrect|equipement conditionnel[^.]{0,60}(?:incorrect|dupliqu)|plusieurs (?:phases|instants)[^.]{0,60}(?:fusionn|combin)|entorno fisico incorrecto|equipo condicional[^.]{0,60}(?:incorrect|duplic)|varias (?:fases|instantes)[^.]{0,60}(?:combin|fusion))/iu;
const WARDROBE_STATE_CONTRADICTION_PATTERN = /(?:required wardrobe state conflicts|tenue de scene requise[^.]{0,80}(?:incorrect|contradi)|vestuario de escena requerido[^.]{0,80}(?:incorrect|contradi))/iu;
const UNIQUE_LANDMARK_CONTRADICTION_PATTERN = /(?:unique landmark is duplicated|landmark location is wrong|repere unique[^.]{0,60}dupliqu|emplacement du repere[^.]{0,60}incorrect|hito unico[^.]{0,60}duplic|ubicacion del hito[^.]{0,60}incorrect)/iu;
const PERSISTENT_VISUAL_ENTITY_CONTRADICTION_PATTERN = /(?:persistent visual entity (?:is duplicated|appearance conflicts|quantity conflicts|state conflicts)|entit[ée] visuelle persistante[^.]{0,80}(?:dupliqu|apparence|quantit[ée]|[ée]tat)[^.]{0,40}(?:incorrect|contradi)|entidad visual persistente[^.]{0,80}(?:duplic|apariencia|cantidad|estado)[^.]{0,40}(?:incorrect|contradi))/iu;
const REVISION_REGRESSION_PATTERN = /(?:identity likeness regressed from preserved source|unrequested stable visual invariant regressed from preserved source)/iu;

const VISUAL_REPAIR_GUARDRAIL_CODES = new Set([
  "identity_duplicate",
  "identity_fusion",
  "identity_substitution",
  "required_cast_missing",
  "technical_integrity",
  "identity_regression",
  "revision_invariant_regression",
  "wardrobe_state_mismatch",
]);
const CAST_CARDINALITY_REPAIR_CODES = new Set([
  "required_cast_missing",
  "identity_duplicate",
  "identity_fusion",
  "identity_substitution",
  "identity_regression",
]);
const SCENE_CAST_ASSERTION_CODES = new Set([
  "required_cast_missing",
  "identity_duplicate",
  "identity_fusion",
  "identity_substitution",
]);
const AUTOMATIC_TARGETED_REPAIR_CODES = new Set([
  "identity_duplicate",
  "identity_fusion",
  "identity_substitution",
  "required_cast_missing",
  "forbidden_element",
  "object_state",
  "main_action",
  "wrong_physical_environment",
  "conditional_equipment_state",
  "conditional_equipment_duplicate",
  "wardrobe_state_mismatch",
  "multi_phase_composite",
  "unique_landmark_duplicate",
  "landmark_wrong_location",
  "identity_regression",
  "revision_invariant_regression",
]);

function normalizedIssueText(issue) {
  return String(issue || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function classifyVisualIssue(issue, { source = "scene" } = {}) {
  const text = normalizedIssueText(issue);
  let code = "other_visible_difference";
  let severity = "advisory";
  let confidence = "medium";

  if (source === "technical" || /corrupt|blank|noise|band|stripe|decoder|unfinished|broken pixel|extreme blur|extra (?:arm|hand|leg|foot|head|limb|finger)/u.test(text)) {
    code = "technical_integrity";
    severity = "blocking";
    confidence = "high";
  } else if (/identity likeness regressed from preserved source/u.test(text)) {
    code = "identity_regression";
    severity = "blocking";
    confidence = "high";
  } else if (/unrequested stable visual invariant regressed from preserved source/u.test(text)) {
    code = "revision_invariant_regression";
    severity = "blocking";
    confidence = "high";
  } else if (DUPLICATE_IDENTITY_PATTERN.test(String(issue || "")) || /identity is duplicated|personnage[^.]{0,50}deux fois|personaje[^.]{0,50}dos veces/u.test(text)) {
    code = "identity_duplicate";
    severity = "blocking";
    confidence = "high";
  } else if (/identit(?:y|ies).{0,40}(?:fused|merged)|fused.{0,40}(?:identity|body)|hybrid|fusionn|fusionad|anatomy fusion/u.test(text)) {
    code = "identity_fusion";
    severity = "blocking";
    confidence = "high";
  } else if (/substitut|replac|reemplaz|sustitu|different person|different child|different animal|wrong (?:person|child|animal|character)/u.test(text)) {
    code = "identity_substitution";
    severity = "blocking";
    confidence = "high";
  } else if (/required (?:named )?(?:character|person|animal|creature).{0,100}(?:missing|absent|omitted)|(?:personnage|personne|animal|creature).{0,60}(?:requis|requise).{0,80}(?:manquant|absent|omis)|(?:personaje|persona|animal|criatura).{0,60}(?:requerid|obligatori).{0,80}(?:falta|ausente|omitid)/u.test(text)) {
    code = "required_cast_missing";
    severity = "blocking";
    confidence = "high";
  } else if (/forbidden.{0,80}(?:present|visible|shown)|interdit.{0,80}(?:present|visible|montre)|prohibid.{0,80}(?:presente|visible|mostrad)/u.test(text)) {
    code = "forbidden_element";
    severity = "blocking";
    confidence = "high";
  } else if (/physical environment is wrong|wrong physical (?:environment|medium)|milieu physique incorrect|entorno fisico incorrecto/u.test(text)) {
    code = "wrong_physical_environment";
    severity = "blocking";
    confidence = "high";
  } else if (/conditional equipment is duplicated|equipement conditionnel[^.]{0,60}dupliqu|equipo condicional[^.]{0,60}duplic/u.test(text)) {
    code = "conditional_equipment_duplicate";
    severity = "blocking";
    confidence = "high";
  } else if (/conditional equipment state conflicts|equipement conditionnel[^.]{0,60}incorrect|equipo condicional[^.]{0,60}incorrect/u.test(text)) {
    code = "conditional_equipment_state";
    severity = "blocking";
    confidence = "high";
  } else if (WARDROBE_STATE_CONTRADICTION_PATTERN.test(String(issue || ""))) {
    code = "wardrobe_state_mismatch";
    severity = "blocking";
    confidence = "high";
  } else if (/multiple causal phases are combined|plusieurs (?:phases|instants)[^.]{0,60}(?:fusionn|combin)|varias (?:fases|instantes)[^.]{0,60}(?:combin|fusion)/u.test(text)) {
    code = "multi_phase_composite";
    severity = "blocking";
    confidence = "high";
  } else if (/unique landmark is duplicated|repere unique.{0,60}dupliqu|hito unico.{0,60}duplic/u.test(text)) {
    code = "unique_landmark_duplicate";
    severity = "blocking";
    confidence = "high";
  } else if (/landmark location is wrong|emplacement du repere.{0,60}incorrect|ubicacion del hito.{0,60}incorrect/u.test(text)) {
    code = "landmark_wrong_location";
    severity = "blocking";
    confidence = "high";
  } else if (OBJECT_STATE_CONTRADICTION_PATTERN.test(String(issue || "")) || PERSISTENT_VISUAL_ENTITY_CONTRADICTION_PATTERN.test(String(issue || ""))) {
    code = "object_state";
    severity = "blocking";
    confidence = "high";
  } else if (/wrong (?:subject|target|central action)|main action subject is wrong|mauvais(?:e)? (?:sujet|cible|action principale)|(?:sujeto|objetivo|accion principal) incorrect/u.test(text)) {
    code = "main_action";
    severity = "blocking";
    confidence = "high";
  } else if (source === "style") {
    code = "style_family";
    severity = "local";
    confidence = "medium";
  } else if (source === "identity") {
    code = "likeness";
    severity = "advisory";
    confidence = "medium";
  } else if (/scale|spatial|position|large|small|echelle|taille|posicion|escala/u.test(text)) {
    code = "composition_or_scale";
    severity = "local";
    confidence = "medium";
  } else if (objectiveSceneContractIssues([issue]).length) {
    code = "scene_contract";
    severity = "local";
    confidence = "medium";
  }

  return {
    code,
    severity,
    confidence,
    automaticRepair: severity === "blocking"
      && confidence === "high"
      && AUTOMATIC_TARGETED_REPAIR_CODES.has(code),
    issue: String(issue || ""),
  };
}

export function classifyVisualIssues(issues = [], options = {}) {
  return (Array.isArray(issues) ? issues : [])
    .map((issue) => classifyVisualIssue(issue, options))
    .filter((item) => item.issue);
}

export function targetedVisualRepairPolicy(issues = [], { source = "scene" } = {}) {
  const classifications = classifyVisualIssues(issues, { source });
  const targetCodes = [...new Set(classifications
    .filter((item) => item.automaticRepair)
    .map((item) => item.code))];
  return {
    version: 4,
    classifications,
    targetCodes,
    automaticRepair: targetCodes.length > 0
      && classifications.every((item) => item.automaticRepair),
    verificationCodes: [...new Set([...targetCodes, ...VISUAL_REPAIR_GUARDRAIL_CODES])],
  };
}

export function requiresFocusedCastVerification(issueScope = []) {
  return (Array.isArray(issueScope) ? issueScope : [])
    .some((code) => CAST_CARDINALITY_REPAIR_CODES.has(String(code || "")));
}

export function reconcileFocusedCastInspection(
  sceneInspection = {},
  castInspection = {},
  { unconfirmed = "preserve" } = {},
) {
  if (castInspection?.authoritative !== true) {
    const originalIssues = (Array.isArray(sceneInspection?.issues) ? sceneInspection.issues : [])
      .map(String)
      .filter(Boolean);
    if (unconfirmed === "advisory") {
      const confirmedNonCastIssues = originalIssues
        .filter((issue) => !SCENE_CAST_ASSERTION_CODES.has(classifyVisualIssue(issue).code));
      return {
        ...sceneInspection,
        approved: confirmedNonCastIssues.length === 0,
        issues: confirmedNonCastIssues,
        issueCodes: [...new Set(confirmedNonCastIssues.map((issue) => classifyVisualIssue(issue).code))],
        unconfirmedCastIssues: originalIssues.filter((issue) => (
          SCENE_CAST_ASSERTION_CODES.has(classifyVisualIssue(issue).code)
        )),
      };
    }
    return {
      ...sceneInspection,
      issues: originalIssues,
      issueCodes: [...new Set(originalIssues.map((issue) => classifyVisualIssue(issue).code))],
    };
  }
  const nonCastIssues = (Array.isArray(sceneInspection?.issues) ? sceneInspection.issues : [])
    .map(String)
    .filter(Boolean)
    .filter((issue) => !SCENE_CAST_ASSERTION_CODES.has(classifyVisualIssue(issue).code));
  const authoritativeCastIssues = castInspection?.approved === false
    ? (Array.isArray(castInspection?.issues) ? castInspection.issues : []).map(String).filter(Boolean)
    : [];
  const issues = [...new Set([...nonCastIssues, ...authoritativeCastIssues])];
  return {
    ...sceneInspection,
    approved: issues.length === 0,
    issues,
    issueCodes: [...new Set([
      ...nonCastIssues.map((issue) => classifyVisualIssue(issue).code),
      ...(Array.isArray(castInspection?.issueCodes) ? castInspection.issueCodes : []),
    ])],
  };
}

export function objectiveTechnicalIssues(issues = []) {
  return (Array.isArray(issues) ? issues : [])
    .map(String)
    .filter((issue) => OBJECTIVE_DEFECT_PATTERN.test(issue));
}

export function objectiveSceneContractIssues(issues = []) {
  return (Array.isArray(issues) ? issues : [])
    .map(String)
    .filter(Boolean)
    .filter((issue) => !POSITIVE_SCENE_CONFIRMATION_PATTERN.test(issue))
    .filter((issue) => !(MINOR_ACCESSORY_PATTERN.test(issue)
      && MISSING_OR_OBSCURED_PATTERN.test(issue)
      && !OBJECT_STATE_CONTRADICTION_PATTERN.test(issue)))
    .filter((issue) => EXPLICIT_SCENE_CONTRADICTION_PATTERN.test(issue)
      || OBJECT_STATE_CONTRADICTION_PATTERN.test(issue)
      || NARRATIVE_CONTRADICTION_PATTERN.test(issue)
      || BLOCKING_SCENE_CONTRADICTION_PATTERN.test(issue)
      || DUPLICATE_IDENTITY_PATTERN.test(issue)
      || PHYSICAL_SNAPSHOT_CONTRADICTION_PATTERN.test(issue)
      || WARDROBE_STATE_CONTRADICTION_PATTERN.test(issue)
      || UNIQUE_LANDMARK_CONTRADICTION_PATTERN.test(issue)
      || PERSISTENT_VISUAL_ENTITY_CONTRADICTION_PATTERN.test(issue)
      || REVISION_REGRESSION_PATTERN.test(issue))
    .filter((issue) => !WARDROBE_ONLY_PATTERN.test(issue)
      || WARDROBE_STATE_CONTRADICTION_PATTERN.test(issue)
      || OBJECT_STATE_CONTRADICTION_PATTERN.test(issue)
      || NARRATIVE_CONTRADICTION_PATTERN.test(issue)
      || BLOCKING_SCENE_CONTRADICTION_PATTERN.test(issue));
}

export function blockingSceneContractIssues(issues = []) {
  return objectiveSceneContractIssues(issues).filter((issue) => (
    BLOCKING_SCENE_CONTRADICTION_PATTERN.test(issue)
    || NARRATIVE_CONTRADICTION_PATTERN.test(issue)
    || DUPLICATE_IDENTITY_PATTERN.test(issue)
    || PHYSICAL_SNAPSHOT_CONTRADICTION_PATTERN.test(issue)
    || WARDROBE_STATE_CONTRADICTION_PATTERN.test(issue)
    || UNIQUE_LANDMARK_CONTRADICTION_PATTERN.test(issue)
    || PERSISTENT_VISUAL_ENTITY_CONTRADICTION_PATTERN.test(issue)
    || REVISION_REGRESSION_PATTERN.test(issue)
  ));
}

export function blockingStyleContinuityIssues(issues = []) {
  return (Array.isArray(issues) ? issues : []).map(String).filter(Boolean);
}

export function visualQualityDisposition({
  technicalApproved = true,
  technicalIssues = [],
  sceneIssues = [],
  styleIssues = [],
  identityIssues = [],
} = {}) {
  const blocking = [
    ...(technicalApproved ? [] : technicalIssues),
    ...blockingSceneContractIssues(sceneIssues),
  ].map(String).filter(Boolean);
  const repairable = [
    ...objectiveSceneContractIssues(sceneIssues).filter((issue) => !blocking.includes(issue)),
    ...blockingStyleContinuityIssues(styleIssues),
  ].map(String).filter(Boolean);
  // Identity comparison is intentionally advisory here. Objective substitutions,
  // missing cast, fusions and duplicate identities are already classified by the
  // technical and scene-contract gates above. A likeness-only warning has proved
  // too subjective and too unlikely to improve to justify another paid image.
  const advisory = (Array.isArray(identityIssues) ? identityIssues : [])
    .map(String)
    .filter(Boolean);
  const classifications = [
    ...classifyVisualIssues(technicalApproved ? [] : technicalIssues, { source: "technical" }),
    ...classifyVisualIssues(sceneIssues, { source: "scene" }),
    ...classifyVisualIssues(styleIssues, { source: "style" }),
    ...classifyVisualIssues(identityIssues, { source: "identity" }),
  ];
  return {
    severity: blocking.length
      ? "blocking"
      : repairable.length
        ? "repairable"
        : advisory.length
          ? "advisory"
          : "accepted",
    blocking: [...new Set(blocking)],
    repairable: [...new Set(repairable)],
    advisory: [...new Set(advisory)],
    classifications,
    issueCodes: [...new Set(classifications.map((item) => item.code))],
    automaticRepair: classifications.length > 0
      && classifications.every((item) => item.automaticRepair),
  };
}

export function isImageSafetyRejection(error) {
  return /(rejected by the safety system|safety system|safety rejection)/iu.test(String(error?.message || error || ""));
}

export function isTransientImageGenerationError(error) {
  return isTransientOpenAIError(error);
}

export class IllustrationQualityError extends Error {
  constructor({
    candidateImageUrl = "",
    rejectionKind = "technical",
    issues = [],
    attemptCount = 0,
    repairPolicy = null,
  } = {}) {
    const normalizedIssues = (Array.isArray(issues) ? issues : []).map(String).filter(Boolean);
    super(`Illustration requires targeted repair after ${attemptCount} attempts: ${normalizedIssues.join(" | ") || "visual quality failure"}`);
    this.name = "IllustrationQualityError";
    this.code = "illustration_quality_review";
    this.candidateImageUrl = candidateImageUrl;
    this.rejectionKind = rejectionKind;
    this.issues = normalizedIssues;
    this.attemptCount = attemptCount;
    this.repairPolicy = repairPolicy || targetedVisualRepairPolicy(normalizedIssues, { source: rejectionKind });
    this.issueCodes = this.repairPolicy.targetCodes.length
      ? this.repairPolicy.targetCodes
      : [...new Set(this.repairPolicy.classifications.map((item) => item.code))];
  }
}

export const IMAGE_SAFETY_FALLBACK_STAGES = Object.freeze({
  FULL_REFERENCES: "full_references",
  CONTINUITY_ONLY: "continuity_only",
  CONTRACT_ONLY: "contract_only",
});

export function imageSafetyFallbackReferences(referenceImages = [], stage = IMAGE_SAFETY_FALLBACK_STAGES.FULL_REFERENCES) {
  const references = Array.isArray(referenceImages) ? referenceImages : [];
  if (stage === IMAGE_SAFETY_FALLBACK_STAGES.CONTRACT_ONLY) return [];
  if (stage === IMAGE_SAFETY_FALLBACK_STAGES.CONTINUITY_ONLY) {
    return references.filter((reference) => reference?.kind === "continuity");
  }
  return references;
}

export function nextImageSafetyFallbackStage(referenceImages = [], stage = IMAGE_SAFETY_FALLBACK_STAGES.FULL_REFERENCES) {
  if (stage === IMAGE_SAFETY_FALLBACK_STAGES.FULL_REFERENCES) {
    return imageSafetyFallbackReferences(referenceImages, IMAGE_SAFETY_FALLBACK_STAGES.CONTINUITY_ONLY).length
      ? IMAGE_SAFETY_FALLBACK_STAGES.CONTINUITY_ONLY
      : IMAGE_SAFETY_FALLBACK_STAGES.CONTRACT_ONLY;
  }
  if (stage === IMAGE_SAFETY_FALLBACK_STAGES.CONTINUITY_ONLY) {
    return IMAGE_SAFETY_FALLBACK_STAGES.CONTRACT_ONLY;
  }
  return null;
}

export class IllustrationSafetyQuarantineError extends Error {
  constructor({ attemptCount = 0 } = {}) {
    super("The image provider could not produce a policy-safe candidate for this page. The page remains private and the rest of the book can continue.");
    this.name = "IllustrationSafetyQuarantineError";
    this.code = "illustration_provider_safety_quarantine";
    this.rejectionKind = "provider_safety";
    this.attemptCount = attemptCount;
    this.issueCodes = ["provider_safety_rejection"];
  }
}

async function referenceSource(reference) {
  if (!reference) return null;
  if (Buffer.isBuffer(reference.buffer)) return reference.buffer;
  if (reference.storageKey) {
    const asset = await getDeliveryStorage().get(reference.storageKey);
    return storageBodyToBuffer(asset.body);
  }
  if (reference.path) return fs.readFile(reference.path);
  return null;
}

export async function inspectStyleConsistency({ imagePath, styleReference, pageLabel = "illustration" }) {
  const reference = await referenceSource(styleReference);
  if (!reference) return { approved: true, issues: [] };
  const [candidate, locked] = await Promise.all([
    sharp(await fs.readFile(imagePath)).rotate().resize(512, 512, { fit: "inside" }).jpeg({ quality: 72 }).toBuffer(),
    sharp(reference).rotate().resize(512, 512, { fit: "inside" }).jpeg({ quality: 72 }).toBuffer(),
  ]);
  const instruction = `You are checking visual continuity inside one children's book.
Image 1 is the newly generated ${pageLabel}. Image 2 is the locked visual-style reference for the same book.
Classify both images into one broad rendering family:
- realistic_dimensional: photographic-looking illustration, cinematic realism, detailed digital painting, realistic or semi-realistic 3D;
- soft_painterly: watercolor, gouache or pastel;
- flat_drawn: flat cartoon, manga, ink or line art;
- crafted_collage: paper cut, felt, clay or collage.

Images inside the same broad family are compatible. In particular, photographic-looking illustration, detailed realistic 3D, softer realistic 3D and detailed digital painting all belong to realistic_dimensional and MUST be approved together. Differences in texture detail, softness, lighting, color grading, depth of field or degree of polish are not a medium break.
Ignore scene, cast, pose, framing, colors, lighting and background differences.
Reject only a categorical change between two different broad families that would make the pages look as if they came from different books, for example realistic_dimensional beside flat_drawn or soft_painterly.
Return only JSON: {"approved":true,"issues":[]} or {"approved":false,"issues":["short reason"]}.`;
  const response = await getClient().responses.create({
    model: process.env.IMAGE_QA_MODEL || process.env.VISION_MODEL || "gpt-4.1-mini",
    input: [{ role: "user", content: [
      { type: "input_text", text: instruction },
      { type: "input_image", image_url: `data:image/jpeg;base64,${candidate.toString("base64")}`, detail: "low" },
      { type: "input_image", image_url: `data:image/jpeg;base64,${locked.toString("base64")}`, detail: "low" },
    ] }],
    max_output_tokens: 300,
  });
  const result = parseJson(extractText(response));
  const approved = result?.approved === true;
  const issues = Array.isArray(result?.issues) ? result.issues.map(String).filter(Boolean).slice(0, 3) : [];
  return { approved, issues: approved ? [] : (issues.length ? issues : ["The rendering style does not match the locked book reference."]) };
}

export function outputImagePath(imageUrl, outputsDir = "data/outputs") {
  const pathname = new URL(String(imageUrl || ""), "http://localhost").pathname;
  if (!pathname.startsWith("/outputs/")) throw new Error("Generated image URL is invalid");
  return path.resolve(outputsDir, decodeURIComponent(path.basename(pathname)));
}

export async function inspectGeneratedIllustration({ imagePath, pageLabel = "illustration", sceneContract = null }) {
  const source = await fs.readFile(imagePath);
  const metadata = await sharp(source).metadata();
  if (metadata.format !== "png" || Number(metadata.width || 0) < 512 || Number(metadata.height || 0) < 512) {
    return { approved: false, issues: ["The generated file is not a complete square PNG illustration."] };
  }
  if (process.env.IMAGE_CONTENT_QA_ENABLED === "false") return { approved: true, issues: [] };

  const compact = await sharp(source).rotate().resize(512, 512, { fit: "inside" }).jpeg({ quality: 72 }).toBuffer();
  const dataUrl = `data:image/jpeg;base64,${compact.toString("base64")}`;
  const instruction = `You are a technical file-quality controller for a personalized children's book.
Inspect the attached ${pageLabel}.

Reject only when the image has an objective technical production defect:
- corrupted pixels, blank or nearly blank content;
- abstract noise, repeated bands or stripes such as a broken decoder output;
- extreme accidental blur, truncated rendering or a visibly unfinished image;
- an accidental identity or anatomy fusion: two requested people or animals share one body, exchange heads, faces or body parts, or become a human-animal hybrid. Each requested identity must remain one complete separate individual. Allow a hybrid only when the structured scene contract explicitly requests that exact fantasy being.
- clearly impossible anatomy on one visible subject: an extra or duplicated arm, hand, leg, foot, head, limb or finger attached in an anatomically impossible way. Do not reject a normally occluded limb, an ambiguous hand pose or ordinary perspective.

Approve every coherent illustration, even if you would prefer a different composition, character, outfit, color, pose, style or scene interpretation. Never compare wardrobe, cast, likeness or narrative accuracy. Small preview watermarks and page-number badges are expected and are not defects.
A photograph, photorealistic rendering, painting, cartoon or other coherent visual is technically complete. A mismatch with the requested children's-book medium belongs to the separate style check and MUST be approved here.
STRUCTURED SCENE CONTRACT (use only to distinguish an explicitly requested fantasy being from an accidental fusion):
${JSON.stringify(sceneContract || {})}
Return only JSON in this exact form: {"approved":true,"issues":[]} or {"approved":false,"issues":["short objective reason"]}.`;

  const response = await getClient().responses.create({
    model: process.env.IMAGE_QA_MODEL || process.env.VISION_MODEL || "gpt-4.1-mini",
    input: [{ role: "user", content: [{ type: "input_text", text: instruction }, { type: "input_image", image_url: dataUrl, detail: "low" }] }],
    max_output_tokens: 300,
  });
  const result = parseJson(extractText(response));
  const reportedIssues = Array.isArray(result?.issues) ? result.issues.map(String).filter(Boolean).slice(0, 5) : [];
  const issues = objectiveTechnicalIssues(reportedIssues);
  // The vision check is deliberately technical, not artistic. A coherent image
  // must not be regenerated merely because it is photorealistic or differs from
  // a preferred illustration style.
  const approved = result?.approved === true || issues.length === 0;
  return { approved, issues: approved ? [] : issues };
}

export async function inspectSceneFidelity({
  imagePath,
  sceneContract,
  pageLabel = "illustration",
  issueScope = [],
  client = null,
}) {
  if (!sceneContract) return { approved: true, issues: [] };
  if (process.env.IMAGE_SCENE_QA_ENABLED === "false") return { approved: true, issues: [] };
  const source = await sharp(await fs.readFile(imagePath)).rotate().resize(512, 512, { fit: "inside" }).jpeg({ quality: 72 }).toBuffer();
  const scopedCodes = (Array.isArray(issueScope) ? issueScope : []).map(String).filter(Boolean);
  const scopedInstruction = scopedCodes.length
    ? `\nTARGETED REPAIR VERIFICATION:\n- Recheck only these original defect codes: ${scopedCodes.join(", ")}.\n- Also report a newly introduced duplicated, fused, substituted or missing required identity.\n- Do not reopen composition, style, likeness, scale, gesture nuance or another scene interpretation that was not one of the original target codes.\n- If the targeted defect is corrected and no severe identity guardrail was introduced, approve.`
    : "";
  const instruction = `You are checking whether one children's-book ${pageLabel} depicts its authoritative structured scene contract.
Judge only objective, clearly visible contradictions:
- the main action has the wrong subject or wrong target;
- any recurring named character required by named_characters is plainly missing;
- a recurring named character is substituted for a distinct generic character;
- a named observer is shown performing the central action instead;
- two requested identities are merged, fused, transformed into one another, or exchange a head, face, body, species or anatomy;
- the same recurring named identity is visibly rendered twice in the same scene, or simultaneously in two different positions, even if both copies otherwise look correct. Allow a visible reflection, portrait, memory, vision or deliberate time montage only when the structured scene contract explicitly requires that representation;
- a required visible group, object, quantity, spatial relationship or physical scale is plainly absent or contradicted;
- every visual_entity_states entry is an exact whole-image cardinality contract. Count all copies across foreground, background and alternate positions. A required entity must equal exact_quantity; a forbidden entity must appear zero times;
- one persistent entity shown in two positions, as a motion trail or as two successive moments is a duplicate even when the total looks narratively plausible. Begin with "Persistent visual entity is duplicated.";
- a persistent entity's locked size, colors, material or distinguishing features are plainly replaced by a categorically different appearance. Begin with "Persistent visual entity appearance conflicts." Ignore tiny, occluded or uncertain details;
- an explicitly forbidden substitution is present.
- the depicted physical environment contradicts render_snapshot.physical_medium or render_snapshot.camera_environment. Begin with "Physical environment is wrong." Judge the characters' camera side separately from any view through a portal or sealed window. A breathable-air room may show water, fish or coral only beyond that clear boundary; it remains dry air around the people and furniture.
- conditional equipment differs from render_snapshot.equipment. Begin with "Conditional equipment state conflicts."
- one character's conditional equipment appears more than once or simultaneously in two states. Begin with "Conditional equipment is duplicated."
- a clearly visible named human wears a categorically different outfit from wardrobe_contracts, such as casual clothes instead of the required space suit, exploration uniform, protective suit or sleepwear. Begin with "Required wardrobe state conflicts." Compare each person separately. Do not reject a hidden seam, tiny accessory, exact shade, harmless simplification, removed logo or garment detail that cannot be seen reliably.
- preparation, crossing, arrival, equipment removal or storage from multiple phases appear together. Begin with "Multiple causal phases are combined."
- a render_snapshot.fixed_entities landmark appears twice in the same image. Begin with "Unique landmark is duplicated."
- a fixed landmark appears on the wrong camera side or outside its canonical home without being clearly beyond the established bounded passage. Begin with "Landmark location is wrong."
Tiny jewelry and small personal accessories may be partly hidden by pose, hair, framing or clothing. A missing tiny necklace, pendant, bracelet, earring or charm alone is advisory and MUST NOT cause rejection. Object duplication or a held-versus-worn contradiction remains rejectable.
For a missing named character, begin the issue with "Required named character ... is missing." For an identity fusion, begin it with "Required identities are fused." When the same named identity is rendered more than once without an explicit reflection, portrait, memory, vision or montage contract, begin the issue with "Required named identity is duplicated."
Do not judge artistic style, beauty, exact facial likeness, minor clothing detail, lighting or minor composition choices. A gross active-outfit contradiction declared by wardrobe_contracts is objective; an uncertain or partly occluded outfit remains approved.
${scopedInstruction}
SCENE CONTRACT JSON:
${JSON.stringify(sceneContract)}
Return only JSON: {"approved":true,"issues":[]} or {"approved":false,"issues":["short objective contradiction"]}.`;
  const qaClient = client || getClient();
  const response = await qaClient.responses.create({
    model: process.env.IMAGE_QA_MODEL || process.env.VISION_MODEL || "gpt-4.1-mini",
    input: [{ role: "user", content: [
      { type: "input_text", text: instruction },
      { type: "input_image", image_url: `data:image/jpeg;base64,${source.toString("base64")}`, detail: "low" },
    ] }],
    max_output_tokens: 350,
  });
  const result = parseJson(extractText(response));
  const reportedIssues = Array.isArray(result?.issues) ? result.issues.map(String).filter(Boolean).slice(0, 4) : [];
  let objectiveIssues = objectiveSceneContractIssues(reportedIssues);
  const suspectedMissingCast = objectiveIssues.filter((issue) => (
    classifyVisualIssue(issue, { source: "scene" }).code === "required_cast_missing"
  ));
  if (suspectedMissingCast.length) {
    const requiredCast = (Array.isArray(sceneContract?.named_characters)
      ? sceneContract.named_characters
      : []).map((character) => ({
      name: String(character?.name || "").trim(),
      visual_role: String(character?.visual_role || "visible").trim(),
      action: String(character?.action || "present in this instant").trim(),
    })).filter((character) => character.name);
    let confirmedMissing = [];
    try {
      const confirmationSource = await sharp(await fs.readFile(imagePath))
        .rotate()
        .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();
      const confirmation = await qaClient.responses.create({
        model: process.env.IMAGE_QA_MODEL || process.env.VISION_MODEL || "gpt-4.1-mini",
        input: [{ role: "user", content: [
          { type: "input_text", text: `A low-detail pass suspected that a required person or animal was missing from one children's-book illustration. Verify only that claim against this higher-detail image.
Required visible cast for this single illustrated instant:
${JSON.stringify(requiredCast)}
Count one complete visible individual for each required entry. Use the declared visual role and action to distinguish people. Do not demand a character who is merely present in another scene phase, and do not infer that a local departure witness boards or wears traveler equipment. If identity, occlusion or scale makes the evidence uncertain, confirm nobody as missing.
Return only JSON: {"confirmed_missing":["exact required cast name"]}.` },
          { type: "input_image", image_url: `data:image/jpeg;base64,${confirmationSource.toString("base64")}`, detail: "high" },
        ] }],
        max_output_tokens: 220,
      });
      const confirmationResult = parseJson(extractText(confirmation));
      const requiredByKey = new Map(requiredCast.map((character) => [normalizedIssueText(character.name), character.name]));
      confirmedMissing = (Array.isArray(confirmationResult?.confirmed_missing)
        ? confirmationResult.confirmed_missing
        : []).map((name) => requiredByKey.get(normalizedIssueText(name))).filter(Boolean);
    } catch {
      // An unconfirmed model suspicion must not become a blocking customer task.
      confirmedMissing = [];
    }
    objectiveIssues = [
      ...objectiveIssues.filter((issue) => !suspectedMissingCast.includes(issue)),
      ...[...new Set(confirmedMissing)].map((name) => `Required named character ${name} is missing after high-detail confirmation.`),
    ];
  }
  const suspectedPersistentEntities = objectiveIssues.filter((issue) => (
    PERSISTENT_VISUAL_ENTITY_CONTRADICTION_PATTERN.test(issue)
  ));
  const entityContracts = (Array.isArray(sceneContract?.visual_entity_states)
    ? sceneContract.visual_entity_states
    : []).map((state) => ({
    entity_id: String(state?.entity_id || "").trim(),
    name: String(state?.name || "").trim(),
    visibility: String(state?.visibility || "").trim(),
    exact_quantity: Math.max(0, Number(state?.exact_quantity ?? 0)),
    state: String(state?.state || "").trim(),
    location: String(state?.location || "").trim(),
    appearance_lock: state?.appearance_lock || {},
  })).filter((state) => state.entity_id && state.name);
  if (suspectedPersistentEntities.length && entityContracts.length) {
    let confirmed = [];
    try {
      const confirmationSource = await sharp(await fs.readFile(imagePath))
        .rotate()
        .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();
      const confirmation = await qaClient.responses.create({
        model: process.env.IMAGE_QA_MODEL || process.env.VISION_MODEL || "gpt-4.1-mini",
        input: [{ role: "user", content: [
          { type: "input_text", text: `A low-detail pass suspected a persistent visual-entity contradiction. Verify only exact, clearly visible violations against this higher-detail image.
AUTHORITATIVE ENTITY STATES:
${JSON.stringify(entityContracts)}
Count every physical copy across the entire image, including alternate positions and background copies. One persistent entity in two positions is a duplicate, not motion. A forbidden entity requires zero copies. Confirm an appearance conflict only when the locked size, colors, material or distinguishing features are categorically different and clearly visible. If counting, identity or appearance is uncertain, confirm no issue.
Return only JSON: {"confirmed_issues":[{"entity_id":"exact id","kind":"quantity|forbidden|state|appearance","observed_quantity":0}]}.` },
          { type: "input_image", image_url: `data:image/jpeg;base64,${confirmationSource.toString("base64")}`, detail: "high" },
        ] }],
        max_output_tokens: 260,
      });
      const result = parseJson(extractText(confirmation));
      const byId = new Map(entityContracts.map((state) => [state.entity_id, state]));
      confirmed = (Array.isArray(result?.confirmed_issues) ? result.confirmed_issues : [])
        .map((issue) => ({ issue, state: byId.get(String(issue?.entity_id || "")) }))
        .filter(({ state }) => state)
        .slice(0, 4)
        .map(({ issue, state }) => {
          const kind = String(issue?.kind || "state").toLowerCase();
          const observed = Math.max(0, Number(issue?.observed_quantity ?? 0));
          if (kind === "appearance") return `Persistent visual entity appearance conflicts: ${state.name} [${state.entity_id}] does not preserve its locked appearance after high-detail confirmation.`;
          if (kind === "forbidden") return `Persistent visual entity state conflicts: ${state.name} [${state.entity_id}] must be absent but is visible after high-detail confirmation.`;
          return `Persistent visual entity is duplicated or has the wrong quantity: ${state.name} [${state.entity_id}] requires ${state.exact_quantity} total and shows ${observed} after high-detail confirmation.`;
        });
    } catch {
      // An unconfirmed count or appearance suspicion must not become customer work.
      confirmed = [];
    }
    objectiveIssues = [
      ...objectiveIssues.filter((issue) => !suspectedPersistentEntities.includes(issue)),
      ...confirmed,
    ];
  }
  const allowedCodes = new Set([...scopedCodes, ...VISUAL_REPAIR_GUARDRAIL_CODES]);
  const issues = scopedCodes.length
    ? objectiveIssues.filter((issue) => allowedCodes.has(classifyVisualIssue(issue, { source: "scene" }).code))
    : objectiveIssues;
  // This check owns action, cast, quantity, spatial and gross active-wardrobe
  // contradictions. Tiny garment details and removed branding stay advisory.
  const approved = result?.approved === true || issues.length === 0;
  return { approved, issues: approved ? [] : (issues.length ? issues : ["The illustration contradicts the structured scene contract."]) };
}

export async function inspectRevisionNonRegression({
  imagePath,
  repairSourceReference,
  revisionInstruction = "",
  sceneContract = null,
  pageLabel = "revised illustration",
  client = null,
}) {
  if (!repairSourceReference) {
    return { approved: true, issues: [] };
  }
  const preservedSource = await referenceSource(repairSourceReference);
  if (!preservedSource) return { approved: true, issues: [] };
  const [candidate, preserved] = await Promise.all([
    sharp(await fs.readFile(imagePath)).rotate().resize(640, 640, { fit: "inside" }).jpeg({ quality: 78 }).toBuffer(),
    sharp(preservedSource).rotate().resize(640, 640, { fit: "inside" }).jpeg({ quality: 78 }).toBuffer(),
  ]);
  const instruction = `You are the non-regression controller for one personalized children's-book ${pageLabel}.
Image 1 is the proposed revision. Image 2 is the preserved accepted source page.
Requested local change: ${String(revisionInstruction || "correct only the confirmed defect").slice(0, 1200)}

Reject only a clear regression that is unrelated to the requested local change:
- a recurring visible person or animal has become a visibly different identity in stable face, hair, species, coat or markings;
- a required person or animal was removed, duplicated, fused, substituted or changed species;
- an unaffected established physical state, unique landmark, object quantity or camera-side topology was broadly redesigned despite not being requested.

Allow the requested correction, necessary local pixels around it, pose or expression changes required by that correction, and small stochastic differences. Do not demand pixel identity. Do not reject artistic preference, lighting nuance or an ambiguous likeness difference. The current structured scene contract overrides the source wherever the story intentionally changes a visible fact.
CURRENT SCENE CONTRACT:
${JSON.stringify(sceneContract || {})}
Classify every reported regression as either identity_or_cast (a person or animal was removed, duplicated, fused, substituted, or changed identity) or stable_visual_invariant (an unrelated location, landmark, object quantity, physical state, or topology changed).
Return only JSON: {"approved":true,"issues":[]} or {"approved":false,"issues":[{"kind":"identity_or_cast|stable_visual_invariant","detail":"short clear regression"}]}.`;
  const qaClient = client || getClient();
  const response = await qaClient.responses.create({
    model: process.env.IMAGE_QA_MODEL || process.env.VISION_MODEL || "gpt-4.1-mini",
    input: [{ role: "user", content: [
      { type: "input_text", text: instruction },
      { type: "input_image", image_url: `data:image/jpeg;base64,${candidate.toString("base64")}`, detail: "low" },
      { type: "input_image", image_url: `data:image/jpeg;base64,${preserved.toString("base64")}`, detail: "low" },
    ] }],
    max_output_tokens: 300,
  });
  const result = parseJson(extractText(response));
  if (result?.approved === true) return { approved: true, issues: [], issueCodes: [] };
  const reported = (Array.isArray(result?.issues) ? result.issues : [])
    .map((issue) => {
      if (issue && typeof issue === "object") {
        return {
          detail: String(issue.detail || issue.issue || "").trim(),
          kind: String(issue.kind || "").trim(),
        };
      }
      return { detail: String(issue || "").trim(), kind: "" };
    })
    .filter((issue) => issue.detail)
    .slice(0, 3);
  const normalized = reported.map((issue) => {
    const identityRegression = issue.kind === "identity_or_cast"
      || (!issue.kind && /identity|likeness|face|facial|hair|species|coat|marking|person|child|animal|character|family member|human friend|dog|cat|breed|substitut|duplicat/iu.test(issue.detail));
    const code = identityRegression ? "identity_regression" : "revision_invariant_regression";
    const prefix = identityRegression
      ? "Identity likeness regressed from preserved source"
      : "Unrequested stable visual invariant regressed from preserved source";
    return { code, issue: `${prefix}: ${issue.detail}.` };
  });
  return {
    approved: false,
    issues: normalized.length
      ? normalized.map((item) => item.issue)
      : ["Unrequested stable visual invariant regressed from preserved source: the revision clearly changed protected content."],
    issueCodes: normalized.length
      ? normalized.map((item) => item.code)
      : ["revision_invariant_regression"],
  };
}

export async function inspectNamedCastCardinality({
  imagePath,
  sceneContract = null,
  identityReferences = [],
  pageLabel = "repaired illustration",
  client = null,
}) {
  const renderWardrobeByName = new Map((Array.isArray(sceneContract?.scene_render_contract?.cast?.required)
    ? sceneContract.scene_render_contract.cast.required
    : []).map((character) => [
    normalizedIssueText(character?.name),
    String(character?.outfit?.description || "").trim(),
  ]));
  const requiredCast = (Array.isArray(sceneContract?.named_characters)
    ? sceneContract.named_characters
    : []).map((character) => ({
    name: String(character?.name || "").trim(),
    entity_type: String(character?.entity_type || character?.type || "").trim(),
    visual_role: String(character?.visual_role || "visible").trim(),
    action: String(character?.action || "present in this instant").trim(),
    required_outfit: renderWardrobeByName.get(normalizedIssueText(character?.name)) || "",
  })).filter((character) => character.name);
  if (!requiredCast.length) return { approved: true, issues: [] };

  const source = await sharp(await fs.readFile(imagePath))
    .rotate()
    .resize(1280, 1280, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
  const selectedReferences = (Array.isArray(identityReferences) ? identityReferences : []).slice(0, 6);
  const identityEvidence = (await Promise.all(selectedReferences.map(async (reference) => {
    const referenceBuffer = await referenceSource(reference);
    if (!referenceBuffer) return null;
    return {
      label: String(reference?.label || "private identity reference").trim(),
      buffer: await sharp(referenceBuffer)
        .rotate()
        .resize(768, 768, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 84 })
        .toBuffer(),
    };
  }))).filter(Boolean);
  const referenceLegend = identityEvidence.length
    ? identityEvidence.map((reference, index) => `Image ${index + 2}: ${reference.label}`).join("\n")
    : "No private identity photograph is available; use the stable traits, visual role and action in the required cast contract.";
  const qaClient = client || getClient();
  const response = await qaClient.responses.create({
    model: process.env.IMAGE_QA_MODEL || process.env.VISION_MODEL || "gpt-4.1-mini",
    input: [{ role: "user", content: [
      { type: "input_text", text: `You are the focused named-cast cardinality controller for one children's-book ${pageLabel}.
Required named cast for this exact illustrated instant:
${JSON.stringify(requiredCast)}

Private identity evidence (Image 1 is always the proposed repaired illustration):
${referenceLegend}

For every required entry, report whether the illustration visibly contains zero, exactly one, or two-or-more complete instances of that same recurring identity, and whether a clearly visible human outfit matches required_outfit.
- When a private identity image is supplied, match the candidate to that specific face, hair, species, coat and markings before counting. Do not assign the same candidate person to two different required entries.
- A reflection, portrait, memory, vision or montage counts separately only when the current scene contract explicitly requires it.
- Two highly similar copies with the same stable face, hair, species, coat, markings and wardrobe count as a duplicated identity, even when placed on opposite sides of the scene.
- Different named people must remain different individuals. Do not merge a local supporter or background person into a required identity.
- Use visual_role and action to distinguish people. Do not demand anyone from another phase of the scene.
- If identity, occlusion or scale makes the count uncertain, use "uncertain". Never guess.
- Give every complete visible individual a stable local candidate id such as "subject_1". Reuse the same candidate id only when two required entries visibly share one body or fused individual.
- structural_state is "separate" only for a complete independent individual, "fused" when the required identity shares one body with another identity, and "uncertain" when this cannot be proved.
- wardrobe_state is "matches" when the broad garment category and declared protective/adventure state match required_outfit, "conflicts" only for a clearly different category, and "uncertain" when hidden, small or ambiguous. For a non-human or an empty required_outfit, use "matches".

Return only JSON: {"cast":[{"name":"exact required name","observed":"zero|one|two_or_more|uncertain","candidate_ids":["subject_1"],"structural_state":"separate|fused|uncertain","wardrobe_state":"matches|conflicts|uncertain"}]}. Use an empty candidate_ids array for zero or uncertain.` },
      { type: "input_image", image_url: `data:image/jpeg;base64,${source.toString("base64")}`, detail: "high" },
      ...identityEvidence.map((reference) => ({
        type: "input_image",
        image_url: `data:image/jpeg;base64,${reference.buffer.toString("base64")}`,
        detail: "high",
      })),
    ] }],
    max_output_tokens: 350,
  });
  const result = parseJson(extractText(response));
  const requiredByKey = new Map(requiredCast.map((character) => [normalizedIssueText(character.name), character.name]));
  const observations = Array.isArray(result?.cast) ? result.cast : [];
  const observationCounts = new Map();
  for (const observation of observations) {
    const key = normalizedIssueText(observation?.name);
    if (!requiredByKey.has(key)) continue;
    observationCounts.set(key, (observationCounts.get(key) || 0) + 1);
  }
  const validObservedStates = new Set(["zero", "one", "two_or_more", "uncertain"]);
  const validStructuralStates = new Set(["separate", "fused", "uncertain"]);
  const validWardrobeStates = new Set(["matches", "conflicts", "uncertain"]);
  const normalizedObservations = observations.map((observation) => {
    const key = normalizedIssueText(observation?.name);
    const observed = normalizedIssueText(observation?.observed);
    const structuralState = normalizedIssueText(observation?.structural_state);
    const requiredOutfit = renderWardrobeByName.get(key) || "";
    const wardrobeState = requiredOutfit
      ? normalizedIssueText(observation?.wardrobe_state)
      : "matches";
    const candidateIds = [...new Set((Array.isArray(observation?.candidate_ids)
      ? observation.candidate_ids
      : []).map((candidateId) => normalizedIssueText(candidateId)).filter(Boolean))];
    return {
      key,
      name: requiredByKey.get(key),
      observed,
      structuralState,
      wardrobeState,
      candidateIds,
    };
  }).filter((observation) => observation.name);
  const authoritative = [...requiredByKey.keys()].every((key) => observationCounts.get(key) === 1)
    && normalizedObservations.every((observation) => (
      validObservedStates.has(observation.observed)
      && validStructuralStates.has(observation.structuralState)
      && validWardrobeStates.has(observation.wardrobeState)
      && (observation.observed === "one" ? observation.candidateIds.length === 1 : true)
      && (observation.observed === "two_or_more" ? observation.candidateIds.length >= 2 : true)
    ));
  const issues = [];
  const issueCodes = [];
  const candidateOwners = new Map();
  for (const observation of normalizedObservations) {
    if (observation.observed === "zero") {
      issues.push(`Required named character ${observation.name} is missing after high-detail identity-cardinality verification.`);
      issueCodes.push("required_cast_missing");
    }
    if (observation.observed === "two_or_more") {
      issues.push(`Required named identity is duplicated. ${observation.name} appears two or more times after high-detail identity-cardinality verification.`);
      issueCodes.push("identity_duplicate");
    }
    if (observation.structuralState === "fused") {
      issues.push(`Required identities are fused. ${observation.name} does not have one complete separate body after high-detail identity arbitration.`);
      issueCodes.push("identity_fusion");
    }
    if (observation.observed === "one" && observation.structuralState === "separate") {
      for (const candidateId of observation.candidateIds) {
        if (!candidateOwners.has(candidateId)) candidateOwners.set(candidateId, []);
        candidateOwners.get(candidateId).push(observation.name);
      }
    }
    if (observation.wardrobeState === "conflicts") {
      issues.push(`Required wardrobe state conflicts. ${observation.name} wears a categorically different outfit after high-detail verification.`);
      issueCodes.push("wardrobe_state_mismatch");
    }
  }
  for (const [candidateId, owners] of candidateOwners) {
    const uniqueOwners = [...new Set(owners)];
    if (uniqueOwners.length < 2) continue;
    issues.push(`Required identities are fused. ${uniqueOwners.join(" and ")} share candidate ${candidateId} after high-detail identity arbitration.`);
    issueCodes.push("identity_fusion");
  }
  return {
    approved: issues.length === 0,
    issues: [...new Set(issues)],
    issueCodes: [...new Set(issueCodes)],
    authoritative,
  };
}

export async function inspectIdentityLikeness({
  imagePath,
  identityReferences = [],
  renderingMode = "illustrated_faithful",
  likenessGoal = "strong",
  pageLabel = "illustration",
}) {
  if (!identityReferences.length || renderingMode === "cartoon" || process.env.IMAGE_LIKENESS_QA_ENABLED === "false") {
    return { approved: true, issues: [] };
  }
  const candidate = await sharp(await fs.readFile(imagePath)).rotate().resize(640, 640, { fit: "inside" }).jpeg({ quality: 78 }).toBuffer();
  const selectedReferences = identityReferences.slice(0, 6);
  const references = (await Promise.all(selectedReferences.map(async (reference) => {
    const source = await referenceSource(reference);
    return source ? sharp(source).rotate().resize(640, 640, { fit: "inside" }).jpeg({ quality: 78 }).toBuffer() : null;
  }))).filter(Boolean);
  if (!references.length) return { approved: true, issues: [] };
  const goal = renderingMode === "photorealistic"
    ? "maximum likeness with natural, non-cartoon facial geometry"
    : "strong recognizable likeness while changing only the artistic medium";
  const referenceLabels = selectedReferences
    .map((reference, index) => `Reference ${index + 2}: ${String(reference?.label || `required identity ${index + 1}`)}`)
    .join("\n");
  const instruction = `You are checking identity fidelity in one personalized children's-book ${pageLabel}.
Image 1 is the generated result. The remaining images are private identity references for the visible named people or animals.
${referenceLabels}
Requested goal: ${goal}. Likeness level: ${likenessGoal}.

Reject only a clear identity replacement or major visible mismatch in stable traits: face shape, eye shape and spacing, nose, mouth, ears, hair shape/color, distinctive markings, or animal species and coat pattern.
For illustrated_faithful, allow brushwork, linework, paper texture and simplified surface detail, but do not allow generic cartoon proportions or enlarged eyes that replace natural geometry.
For photorealistic, also reject doll-like skin, CGI/cartoon anatomy or a visibly different person.
Ignore pose, expression, lighting, background, framing, removed brand marks and small wardrobe details. If a referenced subject is too small or not clearly visible in the generated scene, approve rather than guessing.
Return only JSON: {"approved":true,"issues":[]} or {"approved":false,"issues":["short stable-trait mismatch"]}.`;
  const response = await getClient().responses.create({
    model: process.env.IMAGE_QA_MODEL || process.env.VISION_MODEL || "gpt-4.1-mini",
    input: [{ role: "user", content: [
      { type: "input_text", text: instruction },
      { type: "input_image", image_url: `data:image/jpeg;base64,${candidate.toString("base64")}`, detail: "low" },
      ...references.map((reference) => ({ type: "input_image", image_url: `data:image/jpeg;base64,${reference.toString("base64")}`, detail: "low" })),
    ] }],
    max_output_tokens: 350,
  });
  const result = parseJson(extractText(response));
  const approved = result?.approved === true;
  const issues = Array.isArray(result?.issues) ? result.issues.map(String).filter(Boolean).slice(0, 3) : [];
  return { approved, issues: approved ? [] : (issues.length ? issues : ["The generated subject does not preserve the supplied identity."]) };
}

export const STRICT_V3_ILLUSTRATION_DOMAINS = Object.freeze([
  "asset_integrity",
  "identity_cardinality",
  "forbidden_cast",
  "wardrobe",
  "equipment",
  "physical_medium",
  "location_boundary",
  "main_action",
  "object_cardinality",
  "landmarks",
  "style_continuity",
]);

const STRICT_V3_DOMAIN_FAILURE_CODES = Object.freeze({
  asset_integrity: "corrupted_asset",
  identity_cardinality: "duplicated_required_identity",
  forbidden_cast: "forbidden_character_present",
  wardrobe: "wardrobe_state_mismatch",
  equipment: "equipment_state_mismatch",
  physical_medium: "wrong_physical_medium",
  location_boundary: "wrong_location_or_boundary",
  main_action: "main_action_mismatch",
  object_cardinality: "object_state_mismatch",
  landmarks: "landmark_cardinality_mismatch",
  style_continuity: "style_continuity_mismatch",
});

const STRICT_V3_DOMAIN_ISSUES = Object.freeze({
  asset_integrity: "The private image asset is incomplete or corrupted.",
  identity_cardinality: "Required named identity cardinality is wrong: a required character is missing, duplicated, fused, or substituted.",
  forbidden_cast: "A forbidden or out-of-phase recurring character is visible.",
  wardrobe: "Required wardrobe state conflicts with the current scene.",
  equipment: "Conditional equipment state or cardinality conflicts with the current scene.",
  physical_medium: "Physical environment is wrong: gravity, buoyancy, posture, locomotion, breathing, or wet/dry behavior conflicts with the current world medium.",
  location_boundary: "Landmark location is wrong or the dry/wet, inside/outside, or portal boundary is not respected.",
  main_action: "The main action, its subject, or its target does not match the illustrated instant.",
  object_cardinality: "Persistent visual entity is duplicated or has the wrong quantity, state, owner, or appearance.",
  landmarks: "Unique landmark is duplicated, missing, or shown outside its canonical location.",
  style_continuity: "The rendering style does not match the locked book reference.",
});

const STRICT_V3_LOCAL_REPAIR_DOMAINS = new Set([
  "identity_cardinality",
  "forbidden_cast",
  "wardrobe",
  "equipment",
  "object_cardinality",
  "landmarks",
  "style_continuity",
]);

function strictV3Assessment(value, domain) {
  const status = String(value?.status || "").trim().toLowerCase();
  const evidenceCode = String(value?.evidence_code || "").trim().toLowerCase();
  if (status === "pass" && evidenceCode === "verified") return { status, evidence_code: evidenceCode };
  if (status === "fail" && evidenceCode === STRICT_V3_DOMAIN_FAILURE_CODES[domain]) {
    return { status, evidence_code: evidenceCode };
  }
  return { status: "uncertain", evidence_code: "insufficient_evidence" };
}

export function normalizeStrictV3IllustrationEvidence(rawDomains = {}, { technicalApproved = true } = {}) {
  const domains = Object.fromEntries(STRICT_V3_ILLUSTRATION_DOMAINS.map((domain) => [
    domain,
    domain === "asset_integrity"
      ? technicalApproved
        ? { status: "pass", evidence_code: "verified" }
        : { status: "fail", evidence_code: "corrupted_asset" }
      : strictV3Assessment(rawDomains?.[domain], domain),
  ]));
  const failedDomains = STRICT_V3_ILLUSTRATION_DOMAINS.filter((domain) => domains[domain].status === "fail");
  const uncertainDomains = STRICT_V3_ILLUSTRATION_DOMAINS.filter((domain) => domains[domain].status === "uncertain");
  return {
    version: 2,
    approved: failedDomains.length === 0 && uncertainDomains.length === 0,
    domains,
    failedDomains,
    uncertainDomains,
    issues: [
      ...failedDomains.map((domain) => STRICT_V3_DOMAIN_ISSUES[domain]),
      ...uncertainDomains.map((domain) => `Strict V3 evidence is insufficient for ${domain}; this candidate remains private.`),
    ],
    issueCodes: [...new Set([
      ...failedDomains.map((domain) => STRICT_V3_DOMAIN_FAILURE_CODES[domain]),
      ...uncertainDomains.map(() => "insufficient_evidence"),
    ])],
  };
}

export function strictV3IllustrationRetryStrategy(
  evidence = {},
  {
    attempt = 1,
    maximumAttempts = 2,
    targetedRepairAvailable = false,
    referenceArbitrationAvailable = false,
  } = {},
) {
  const failedDomains = [...new Set(Array.isArray(evidence?.failedDomains)
    ? evidence.failedDomains.filter((domain) => STRICT_V3_ILLUSTRATION_DOMAINS.includes(domain))
    : [])];
  const uncertainDomains = [...new Set(Array.isArray(evidence?.uncertainDomains)
    ? evidence.uncertainDomains.filter((domain) => STRICT_V3_ILLUSTRATION_DOMAINS.includes(domain))
    : [])];
  const unresolvedDomains = [...new Set([...failedDomains, ...uncertainDomains])];
  const attemptsRemaining = Math.max(0, Number(maximumAttempts || 0) - Number(attempt || 0));
  const singleConfirmedLocalDomain = uncertainDomains.length === 0
    && failedDomains.length === 1
    && STRICT_V3_LOCAL_REPAIR_DOMAINS.has(failedDomains[0]);

  let mode = "quarantine";
  let reason = "repair_budget_exhausted";
  if (unresolvedDomains.length === 0 && evidence?.approved === true) {
    mode = "accept";
    reason = "all_domains_verified";
  } else if (singleConfirmedLocalDomain && targetedRepairAvailable
    && !(referenceArbitrationAvailable && attemptsRemaining > 0)) {
    mode = "targeted_repair";
    reason = "single_confirmed_local_defect";
  } else if (attemptsRemaining > 0) {
    mode = "regenerate";
    reason = uncertainDomains.length > 0
      ? "evidence_incomplete"
      : unresolvedDomains.length > 1
        ? "multiple_domains_failed"
        : "structural_domain_failed";
  }

  return {
    version: 1,
    mode,
    reason,
    failedDomains,
    uncertainDomains,
    unresolvedDomains,
    attemptsRemaining,
    targetDomains: mode === "targeted_repair" ? failedDomains : [],
    targetCodes: mode === "targeted_repair"
      ? failedDomains.map((domain) => STRICT_V3_DOMAIN_FAILURE_CODES[domain])
      : [],
  };
}

export function strictV3TargetedRepairPolicy(evidence = {}, options = {}) {
  const strategy = strictV3IllustrationRetryStrategy(evidence, options);
  const classifications = strategy.unresolvedDomains.map((domain) => {
    const confirmedFailure = strategy.failedDomains.includes(domain);
    const code = confirmedFailure
      ? STRICT_V3_DOMAIN_FAILURE_CODES[domain]
      : "insufficient_evidence";
    return {
      code,
      domain,
      severity: confirmedFailure ? "blocking" : "uncertain",
      confidence: confirmedFailure ? "high" : "low",
      automaticRepair: strategy.targetDomains.includes(domain),
      issue: confirmedFailure
        ? STRICT_V3_DOMAIN_ISSUES[domain]
        : `Strict V3 evidence is insufficient for ${domain}; this candidate remains private.`,
    };
  });
  return {
    version: 5,
    strategy,
    classifications,
    targetCodes: strategy.targetCodes,
    targetDomains: strategy.targetDomains,
    automaticRepair: strategy.mode === "targeted_repair",
    verificationCodes: [...new Set([...strategy.targetCodes, ...VISUAL_REPAIR_GUARDRAIL_CODES])],
  };
}

export async function inspectStrictV3IllustrationEvidence({
  imagePath,
  sceneContract = null,
  referenceImages = [],
  pageLabel = "illustration",
  technicalApproved = true,
  client = null,
}) {
  if (!technicalApproved) return normalizeStrictV3IllustrationEvidence({}, { technicalApproved: false });
  const candidate = await sharp(await fs.readFile(imagePath))
    .rotate()
    .resize(1280, 1280, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
  const selectedReferences = (Array.isArray(referenceImages) ? referenceImages : [])
    .filter((reference) => ["identity", "wardrobe", "continuity", "adjacent_scene", "adjacent_continuity"].includes(reference?.kind))
    .slice(0, 7);
  const evidence = (await Promise.all(selectedReferences.map(async (reference) => {
    const source = await referenceSource(reference);
    if (!source) return null;
    return {
      label: String(reference?.label || reference?.kind || "private reference").slice(0, 180),
      kind: String(reference?.kind || "reference"),
      buffer: await sharp(source).rotate().resize(720, 720, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer(),
    };
  }))).filter(Boolean);
  const legend = evidence.length
    ? evidence.map((entry, index) => `Image ${index + 2}: ${entry.kind} — ${entry.label}`).join("\n")
    : "No additional pixel reference is available; use the immutable structured scene contract.";
  const qaClient = client || getClient();
  const response = await qaClient.responses.create({
    model: process.env.IMAGE_QA_MODEL || process.env.VISION_MODEL || "gpt-4.1-mini",
    input: [{ role: "user", content: [
      { type: "input_text", text: `You are Calitiki's final strict V3 illustration arbiter for one personalized children's-book ${pageLabel}.
Image 1 is the candidate. It may remain private unless every objective domain is explicitly verified. Other images are authoritative identity, cover/style, or immediately adjacent continuity references:
${legend}

Evaluate exactly these domains independently. Never infer one domain from another:
- identity_cardinality: every required named identity appears exactly once as a complete separate individual; no required identity is missing, duplicated, fused, substituted, or assigned to two bodies.
- forbidden_cast: no forbidden, out-of-phase, departure-only, arrival-only, or merely mentioned recurring identity is visible.
- wardrobe: each visible named person wears the exact active outfit state for this instant, including changes established in earlier scenes; ordinary source-photo clothing is forbidden when a scene outfit is active.
- equipment: breathing, protective, space, underwater, vehicle, or other conditional equipment has the required state and exactly one instance per wearer.
- physical_medium: apply the universe laws around the characters, not just the background. Verify gravity or buoyancy, posture, locomotion, hair/fabric behavior, breathing and wet/dry behavior. Underwater characters must behave underwater; dry protected interiors remain dry even when water is visible through a window.
- location_boundary: dry/wet, inside/outside, vehicle/world, portal, window and passage boundaries are explicit and topologically coherent. A background view cannot change the medium around the cast.
- main_action: the exact subject, target and single illustrated instant match the contract. Do not combine preparation, crossing, arrival, removal, storage, or later consequences.
- object_cardinality: each persistent object/entity has its exact total quantity, owner, state, location, scale, colors, material and distinguishing appearance. One entity in two positions is a duplicate, not motion. Created composites such as a set of three circles remain one tracked entity with exactly three component circles.
- landmarks: every unique fixed landmark has the required cardinality and canonical side/location.
- style_continuity: broad rendering family, character design language and book medium match the locked continuity references.

Use status=pass only for directly visible, sufficiently clear evidence. Use uncertain when occlusion, crop, scale, ambiguity, or missing reference prevents proof. Use fail only for a confirmed objective contradiction and exactly the prescribed failure code for that domain.
Allowed failure codes by domain:
${JSON.stringify(STRICT_V3_DOMAIN_FAILURE_CODES)}
Use evidence_code=verified only with pass and insufficient_evidence only with uncertain.

IMMUTABLE SCENE RENDER CONTRACT:
${JSON.stringify(sceneContract || {})}

Return only JSON with all ten model-assessed keys (asset_integrity is deterministic and must be omitted):
{"domains":{"identity_cardinality":{"status":"pass|fail|uncertain","evidence_code":"verified|duplicated_required_identity|insufficient_evidence"},"forbidden_cast":{"status":"pass|fail|uncertain","evidence_code":"verified|forbidden_character_present|insufficient_evidence"},"wardrobe":{"status":"pass|fail|uncertain","evidence_code":"verified|wardrobe_state_mismatch|insufficient_evidence"},"equipment":{"status":"pass|fail|uncertain","evidence_code":"verified|equipment_state_mismatch|insufficient_evidence"},"physical_medium":{"status":"pass|fail|uncertain","evidence_code":"verified|wrong_physical_medium|insufficient_evidence"},"location_boundary":{"status":"pass|fail|uncertain","evidence_code":"verified|wrong_location_or_boundary|insufficient_evidence"},"main_action":{"status":"pass|fail|uncertain","evidence_code":"verified|main_action_mismatch|insufficient_evidence"},"object_cardinality":{"status":"pass|fail|uncertain","evidence_code":"verified|object_state_mismatch|insufficient_evidence"},"landmarks":{"status":"pass|fail|uncertain","evidence_code":"verified|landmark_cardinality_mismatch|insufficient_evidence"},"style_continuity":{"status":"pass|fail|uncertain","evidence_code":"verified|style_continuity_mismatch|insufficient_evidence"}}}.` },
      { type: "input_image", image_url: `data:image/jpeg;base64,${candidate.toString("base64")}`, detail: "high" },
      ...evidence.map((entry) => ({
        type: "input_image",
        image_url: `data:image/jpeg;base64,${entry.buffer.toString("base64")}`,
        detail: ["identity", "wardrobe"].includes(entry.kind) ? "high" : "low",
      })),
    ] }],
    max_output_tokens: 700,
  });
  const result = parseJson(extractText(response));
  return normalizeStrictV3IllustrationEvidence(result?.domains || {}, { technicalApproved: true });
}

export async function generateQualityCheckedImage({
  prompt,
  safetyFallbackPrompt = "",
  castPresent = [],
  pageLabel = "illustration",
  maximumAttempts = Math.max(1, Number.parseInt(process.env.IMAGE_GENERATION_ATTEMPTS || "2", 10) || 2),
  onAttempt = null,
  onCandidate = null,
  sceneFidelityContract = null,
  retryRepairableFindings = true,
  qualityReviewScope = [],
  verifyExactCast = false,
  targetedRepairAvailable = false,
  revisionInstruction = "",
  strictV3EvidenceRequired = false,
  ...generationOptions
}) {
  let previousIssues = [];
  let previousRejectionKind = "technical";
  let safetyFallbackStage = IMAGE_SAFETY_FALLBACK_STAGES.FULL_REFERENCES;
  let visualReferencePolicyStage = VISUAL_REFERENCE_POLICY_STAGES.FULL_COMPATIBLE;
  let attemptLimit = maximumAttempts;
  let lastCandidateImageUrl = "";
  let lastRepairPolicy = null;
  for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
    const semanticReferences = referencesForVisualPolicy(
      generationOptions.referenceImages,
      visualReferencePolicyStage,
    );
    const referenceImagesForAttempt = imageSafetyFallbackReferences(
      semanticReferences,
      safetyFallbackStage,
    );
    const safetyFallbackActive = safetyFallbackStage !== IMAGE_SAFETY_FALLBACK_STAGES.FULL_REFERENCES;
    const model = referenceImagesForAttempt?.length
      ? (process.env.REFERENCE_IMAGE_MODEL || "gpt-image-2")
      : (generationOptions.model || process.env.IMAGE_MODEL || "gpt-image-2");
    onAttempt?.({
      phase: "started",
      attempt,
      maximumAttempts: attemptLimit,
      pageLabel,
      model,
      safetyFallback: safetyFallbackActive,
      safetyFallbackStage,
      referencePolicyStage: visualReferencePolicyStage,
      referenceKinds: visualReferencePolicyKinds(generationOptions.referenceImages, visualReferencePolicyStage),
    });
    const repairNote = previousIssues.length
      ? previousRejectionKind === "style"
        ? `\n\nSTYLE CONTINUITY REGENERATION: the previous output differed from the locked reference because ${previousIssues.join("; ")}. Treat the continuity reference as authoritative. Preserve its same broad rendering family and visual medium. Do not switch between realistic dimensional illustration, painterly watercolor/gouache, flat drawn cartoon/manga, or crafted paper/collage. Differences in scene and lighting are allowed.`
        : previousRejectionKind === "identity"
          ? `\n\nIDENTITY FIDELITY REGENERATION: the previous output replaced or altered the referenced subject because ${previousIssues.join("; ")}. Treat the identity reference as authoritative. Preserve natural face geometry, eye shape and spacing, nose, mouth, ears, hair shape and distinctive visible details. Change the medium and scene, never the person's identity.`
        : previousRejectionKind === "scene"
          ? `\n\nSCENE FIDELITY REGENERATION: the previous output contradicted the authoritative scene contract because ${previousIssues.join("; ")}. Correct exactly who performs the main action and toward whom, keep generic people distinct from recurring named characters, obey every visible person's declared wardrobe state, the required quantity, physical scale, spatial relationships and forbidden substitutions, and preserve each fixed landmark as one instance only at its canonical home or beyond the explicitly bounded passage.`
          : `\n\nTECHNICAL REGENERATION: the previous output was rejected because ${previousIssues.join("; ")}. Produce a complete, coherent illustration of the requested scene and do not reproduce that defect.`
      : "";
    try {
      const imageUrl = await generateImage({
        ...generationOptions,
        referenceImages: referenceImagesForAttempt,
        prompt: `${safetyFallbackActive && safetyFallbackPrompt ? safetyFallbackPrompt : prompt}${repairNote}`,
        outName: `${generationOptions.outName || "image"}-attempt${attempt}`,
      });
      lastCandidateImageUrl = imageUrl;
      onAttempt?.({ phase: "generated", attempt, maximumAttempts: attemptLimit, pageLabel });
      const inspection = await inspectGeneratedIllustration({
        imagePath: outputImagePath(imageUrl),
        pageLabel,
        sceneContract: sceneFidelityContract,
      });
      const styleReference = generationOptions.referenceImages?.find((reference) => reference?.kind === "continuity");
      const advisoryCheck = async (check) => {
        try { return await check; }
        catch (error) {
          // Narrative/style vision checks may improve a coherent image once, but
          // their own timeout or malformed JSON must never destroy a whole book.
          return { approved: true, issues: [], warning: String(error?.message || error) };
        }
      };
      const identityReferences = generationOptions.referenceImages?.filter((reference) => reference?.kind === "identity") || [];
      const repairSourceReference = generationOptions.referenceImages?.find((reference) => reference?.kind === "repair_source") || null;
      const scopedRepairVerification = Array.isArray(qualityReviewScope) && qualityReviewScope.length > 0;
      const focusedCastVerification = Boolean(verifyExactCast)
        || (scopedRepairVerification && requiresFocusedCastVerification(qualityReviewScope));
      let [styleInspection, sceneInspection, identityInspection, revisionInspection, castCardinalityInspection] = inspection.approved
        ? await Promise.all([
          scopedRepairVerification
            ? Promise.resolve({ approved: true, issues: [] })
            : advisoryCheck(inspectStyleConsistency({ imagePath: outputImagePath(imageUrl), styleReference, pageLabel })),
          advisoryCheck(inspectSceneFidelity({
            imagePath: outputImagePath(imageUrl),
            sceneContract: sceneFidelityContract,
            pageLabel,
            issueScope: qualityReviewScope,
          })),
          scopedRepairVerification && !focusedCastVerification
            ? Promise.resolve({ approved: true, issues: [] })
            : advisoryCheck(inspectIdentityLikeness({
            imagePath: outputImagePath(imageUrl),
            identityReferences,
            renderingMode: generationOptions.renderingMode,
            likenessGoal: generationOptions.likenessGoal,
            pageLabel,
          })),
          repairSourceReference
            ? advisoryCheck(inspectRevisionNonRegression({
              imagePath: outputImagePath(imageUrl),
              repairSourceReference,
              revisionInstruction,
              sceneContract: sceneFidelityContract,
              pageLabel,
            }))
            : Promise.resolve({ approved: true, issues: [] }),
          focusedCastVerification
            ? advisoryCheck(inspectNamedCastCardinality({
              imagePath: outputImagePath(imageUrl),
              sceneContract: sceneFidelityContract,
              identityReferences,
              pageLabel,
            }))
            : Promise.resolve({ approved: true, issues: [] }),
        ])
        : [
          { approved: false, issues: [] },
          { approved: false, issues: [] },
          { approved: false, issues: [] },
          { approved: false, issues: [] },
          { approved: false, issues: [] },
        ];
      const initialCastArbitration = inspection.approved
        && !focusedCastVerification
        && !scopedRepairVerification
        && (Array.isArray(sceneInspection?.issues) ? sceneInspection.issues : []).some((issue) => (
          SCENE_CAST_ASSERTION_CODES.has(classifyVisualIssue(issue, { source: "scene" }).code)
        ));
      if (initialCastArbitration) {
        castCardinalityInspection = await advisoryCheck(inspectNamedCastCardinality({
          imagePath: outputImagePath(imageUrl),
          sceneContract: sceneFidelityContract,
          identityReferences,
          pageLabel,
        }));
      }
      if (focusedCastVerification || initialCastArbitration) {
        const reconciledCastInspection = reconcileFocusedCastInspection(
          sceneInspection,
          castCardinalityInspection,
          { unconfirmed: initialCastArbitration ? "advisory" : "preserve" },
        );
        sceneInspection.approved = reconciledCastInspection.approved;
        sceneInspection.issues = reconciledCastInspection.issues;
        sceneInspection.issueCodes = reconciledCastInspection.issueCodes;
      }
      if (!revisionInspection.approved) {
        const authoritativeIdentityCardinality = (focusedCastVerification || initialCastArbitration)
          && castCardinalityInspection.authoritative === true;
        const remainingRevisionIssues = revisionInspection.issues.filter((issue, index) => !(
          authoritativeIdentityCardinality
          && revisionInspection.issueCodes?.[index] === "identity_regression"
        ));
        if (remainingRevisionIssues.length) {
          sceneInspection.approved = false;
          sceneInspection.issues = [...sceneInspection.issues, ...remainingRevisionIssues];
        }
      }
      const strictV3Evidence = strictV3EvidenceRequired
        ? await inspectStrictV3IllustrationEvidence({
          imagePath: outputImagePath(imageUrl),
          sceneContract: sceneFidelityContract,
          // Provider-safety fallback may omit source pixels from generation,
          // but the separate private QA boundary must still compare the result
          // with every canonical identity/style reference. Generation input and
          // acceptance evidence are intentionally independent authorities.
          referenceImages: generationOptions.referenceImages || [],
          pageLabel,
          technicalApproved: inspection.approved,
        })
        : null;
      const acceptedByAuthority = strictV3EvidenceRequired
        ? inspection.approved && strictV3Evidence?.approved === true
        : inspection.approved && styleInspection.approved && sceneInspection.approved && identityInspection.approved;
      if (acceptedByAuthority) {
        await onCandidate?.({
          imageUrl,
          attempt,
          maximumAttempts: attemptLimit,
          status: "accepted",
          rejectionKind: "",
          issues: [],
          strictEvidence: strictV3Evidence,
          providerModel: model,
        });
        onAttempt?.({ phase: "approved", attempt, maximumAttempts: attemptLimit, pageLabel });
        return imageUrl;
      }
      // Style comparison is bounded. It may request one stronger regeneration;
      // a remaining categorical medium break is quarantined for quality review
      // rather than shown silently or allowed to abort the complete preview.
      const disposition = visualQualityDisposition({
        technicalApproved: inspection.approved,
        technicalIssues: inspection.issues,
        sceneIssues: strictV3EvidenceRequired ? strictV3Evidence?.issues || [] : sceneInspection.issues,
        styleIssues: strictV3EvidenceRequired ? [] : styleInspection.issues,
        identityIssues: identityInspection.issues,
      });
      const automaticRepairPolicy = targetedVisualRepairPolicy(disposition.blocking, {
        source: inspection.approved ? "scene" : "technical",
      });
      const candidateIssueCodes = strictV3EvidenceRequired
        ? strictV3Evidence?.issueCodes || []
        : disposition.issueCodes;
      const nextReferencePolicyStage = attempt < attemptLimit
        ? nextVisualReferencePolicyStage(
          generationOptions.referenceImages,
          visualReferencePolicyStage,
          candidateIssueCodes,
        )
        : null;
      const strictRetryPolicy = strictV3EvidenceRequired
        ? strictV3TargetedRepairPolicy(strictV3Evidence, {
          attempt,
          maximumAttempts: attemptLimit,
          targetedRepairAvailable,
          referenceArbitrationAvailable: Boolean(nextReferencePolicyStage),
        })
        : null;
      const effectiveRepairPolicy = strictRetryPolicy || automaticRepairPolicy;
      lastRepairPolicy = effectiveRepairPolicy;
      if (!strictV3EvidenceRequired &&
        inspection.approved
        && disposition.blocking.length === 0
        && disposition.repairable.length === 0
        && disposition.advisory.length > 0
      ) {
        await onCandidate?.({
          imageUrl,
          attempt,
          maximumAttempts: attemptLimit,
          status: "accepted",
          rejectionKind: "identity",
          issues: disposition.advisory,
          warning: true,
        });
        onAttempt?.({
          phase: "approved-with-identity-warning",
          attempt,
          maximumAttempts: attemptLimit,
          pageLabel,
          issues: disposition.advisory,
        });
        return imageUrl;
      }
      if (!strictV3EvidenceRequired &&
        inspection.approved
        && disposition.blocking.length === 0
        && disposition.repairable.length > 0
      ) {
        await onCandidate?.({
          imageUrl,
          attempt,
          maximumAttempts: attemptLimit,
          status: "accepted",
          rejectionKind: !identityInspection.approved ? "identity" : !sceneInspection.approved ? "scene" : "style",
          issues: [...disposition.repairable, ...disposition.advisory],
          warning: true,
        });
        onAttempt?.({
          phase: retryRepairableFindings ? "approved-with-local-warning" : "approved-with-budget-warning",
          attempt,
          maximumAttempts: attemptLimit,
          pageLabel,
          issues: [...disposition.repairable, ...disposition.advisory],
        });
        return imageUrl;
      }
      if (!strictV3EvidenceRequired && inspection.approved
        && attempt === attemptLimit
        && disposition.blocking.length === 0) {
        const warningIssues = [...styleInspection.issues, ...sceneInspection.issues, ...identityInspection.issues];
        await onCandidate?.({
          imageUrl,
          attempt,
          maximumAttempts: attemptLimit,
          status: "accepted",
          rejectionKind: !identityInspection.approved ? "identity" : !sceneInspection.approved ? "scene" : "style",
          issues: warningIssues,
          warning: true,
        });
        onAttempt?.({
          phase: !identityInspection.approved ? "approved-with-identity-warning" : sceneInspection.approved ? "approved-with-style-warning" : "approved-with-scene-warning",
          attempt,
          maximumAttempts: attemptLimit,
          pageLabel,
          issues: warningIssues,
        });
        return imageUrl;
      }
      previousIssues = inspection.approved
        ? strictV3EvidenceRequired
          ? strictV3Evidence?.issues || ["Strict V3 illustration evidence is incomplete."]
          : [...styleInspection.issues, ...sceneInspection.issues, ...identityInspection.issues]
        : inspection.issues;
      previousRejectionKind = inspection.approved
        ? strictV3EvidenceRequired
          ? "scene"
          : (!sceneInspection.approved ? "scene" : !identityInspection.approved ? "identity" : "style")
        : "technical";
      if (nextReferencePolicyStage) {
        visualReferencePolicyStage = nextReferencePolicyStage;
      }
      const quarantineImmediately = strictV3EvidenceRequired
        ? strictRetryPolicy?.strategy?.mode === "targeted_repair"
        : inspection.approved
          && targetedRepairAvailable
          && automaticRepairPolicy.automaticRepair
          && attempt < attemptLimit;
      await onCandidate?.({
        imageUrl,
        attempt,
        maximumAttempts: quarantineImmediately ? attempt : attemptLimit,
        status: attempt === attemptLimit || quarantineImmediately ? "quarantined" : "rejected",
        rejectionKind: previousRejectionKind,
        issues: previousIssues,
        issueCodes: strictV3EvidenceRequired
          ? strictV3Evidence?.issueCodes || []
          : disposition.issueCodes,
        repairPolicy: effectiveRepairPolicy,
        strictEvidence: strictV3Evidence,
        providerModel: model,
      });
      onAttempt?.({
        phase: quarantineImmediately ? "quarantined-for-targeted-repair" : "rejected",
        attempt,
        maximumAttempts: quarantineImmediately ? attempt : attemptLimit,
        pageLabel,
        issues: previousIssues,
        issueCodes: strictV3EvidenceRequired
          ? strictV3Evidence?.issueCodes || []
          : disposition.issueCodes,
        retryStrategy: strictRetryPolicy?.strategy || null,
        referencePolicyStage: visualReferencePolicyStage,
      });
      if (quarantineImmediately) {
        attemptLimit = attempt;
        break;
      }
    } catch (error) {
      onAttempt?.({ phase: "failed", attempt, maximumAttempts: attemptLimit, pageLabel, error: String(error?.message || error) });
      if (isImageSafetyRejection(error)) {
        const nextFallbackStage = nextImageSafetyFallbackStage(
          generationOptions.referenceImages,
          safetyFallbackStage,
        );
        if (!nextFallbackStage) {
          throw new IllustrationSafetyQuarantineError({ attemptCount: attempt });
        }
        // Never replay an identical rejected request. First keep only the
        // approved cover/style anchor; then use the immutable text contract
        // alone. Identity pixels remain available to the separate QA boundary,
        // but no rejected/generated image becomes continuity evidence.
        safetyFallbackStage = nextFallbackStage;
        previousRejectionKind = "technical";
        previousIssues = [];
        // A provider rejection returned no candidate. Give each distinct safer
        // input exactly one bounded call even when the normal budget ended.
        if (attempt === attemptLimit) attemptLimit += 1;
        continue;
      }
      if (attempt < attemptLimit && isTransientImageGenerationError(error)) {
        previousRejectionKind = "technical";
        previousIssues = [];
        continue;
      }
      throw error;
    }
  }
  const finalBlockingIssues = strictV3EvidenceRequired
    ? previousIssues
    : previousRejectionKind === "technical"
    ? previousIssues
    : previousRejectionKind === "scene"
      ? blockingSceneContractIssues(previousIssues)
      : [];
  const reportedFailureIssues = finalBlockingIssues.length ? finalBlockingIssues : previousIssues;
  throw new IllustrationQualityError({
    candidateImageUrl: lastCandidateImageUrl,
    rejectionKind: previousRejectionKind,
    issues: reportedFailureIssues,
    attemptCount: attemptLimit,
    repairPolicy: lastRepairPolicy
      || targetedVisualRepairPolicy(reportedFailureIssues, { source: previousRejectionKind }),
  });
}

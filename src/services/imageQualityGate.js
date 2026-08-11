import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { generateImage } from "./imageRunner.js";
import { createOpenAIClient } from "./openaiClient.js";
import { getDeliveryStorage } from "./deliveryStorage.js";
import { storageBodyToBuffer } from "./previewAssetStorage.js";
import { isTransientOpenAIError } from "./openaiErrorPolicy.js";

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

const VISUAL_REPAIR_GUARDRAIL_CODES = new Set([
  "identity_duplicate",
  "identity_fusion",
  "identity_substitution",
  "required_cast_missing",
  "technical_integrity",
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
  "multi_phase_composite",
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
  } else if (/multiple causal phases are combined|plusieurs (?:phases|instants)[^.]{0,60}(?:fusionn|combin)|varias (?:fases|instantes)[^.]{0,60}(?:combin|fusion)/u.test(text)) {
    code = "multi_phase_composite";
    severity = "blocking";
    confidence = "high";
  } else if (OBJECT_STATE_CONTRADICTION_PATTERN.test(String(issue || ""))) {
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
    version: 2,
    classifications,
    targetCodes,
    automaticRepair: targetCodes.length > 0
      && classifications.every((item) => item.automaticRepair),
    verificationCodes: [...new Set([...targetCodes, ...VISUAL_REPAIR_GUARDRAIL_CODES])],
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
      || PHYSICAL_SNAPSHOT_CONTRADICTION_PATTERN.test(issue))
    .filter((issue) => !WARDROBE_ONLY_PATTERN.test(issue)
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
- an explicitly forbidden substitution is present.
- the depicted physical environment contradicts render_snapshot.physical_medium. Begin with "Physical environment is wrong." A breathable-air room may be below water with fish outside sealed windows; do not reject it when people are visibly inside dry air.
- conditional equipment differs from render_snapshot.equipment. Begin with "Conditional equipment state conflicts."
- one character's conditional equipment appears more than once or simultaneously in two states. Begin with "Conditional equipment is duplicated."
- preparation, crossing, arrival, equipment removal or storage from multiple phases appear together. Begin with "Multiple causal phases are combined."
Tiny jewelry and small personal accessories may be partly hidden by pose, hair, framing or clothing. A missing tiny necklace, pendant, bracelet, earring or charm alone is advisory and MUST NOT cause rejection. Object duplication or a held-versus-worn contradiction remains rejectable.
For a missing named character, begin the issue with "Required named character ... is missing." For an identity fusion, begin it with "Required identities are fused." When the same named identity is rendered more than once without an explicit reflection, portrait, memory, vision or montage contract, begin the issue with "Required named identity is duplicated."
Do not judge artistic style, beauty, exact facial likeness, clothing detail, lighting or minor composition choices. If the evidence is ambiguous, approve.
${scopedInstruction}
SCENE CONTRACT JSON:
${JSON.stringify(sceneContract)}
Return only JSON: {"approved":true,"issues":[]} or {"approved":false,"issues":["short objective contradiction"]}.`;
  const response = await getClient().responses.create({
    model: process.env.IMAGE_QA_MODEL || process.env.VISION_MODEL || "gpt-4.1-mini",
    input: [{ role: "user", content: [
      { type: "input_text", text: instruction },
      { type: "input_image", image_url: `data:image/jpeg;base64,${source.toString("base64")}`, detail: "low" },
    ] }],
    max_output_tokens: 350,
  });
  const result = parseJson(extractText(response));
  const reportedIssues = Array.isArray(result?.issues) ? result.issues.map(String).filter(Boolean).slice(0, 4) : [];
  const objectiveIssues = objectiveSceneContractIssues(reportedIssues);
  const allowedCodes = new Set([...scopedCodes, ...VISUAL_REPAIR_GUARDRAIL_CODES]);
  const issues = scopedCodes.length
    ? objectiveIssues.filter((issue) => allowedCodes.has(classifyVisualIssue(issue, { source: "scene" }).code))
    : objectiveIssues;
  // This check owns action, cast, quantity and spatial contradictions only.
  // Models sometimes report wardrobe or logo differences despite the explicit
  // instruction above; those belong to continuity prompting, not scene QA.
  const approved = result?.approved === true || issues.length === 0;
  return { approved, issues: approved ? [] : (issues.length ? issues : ["The illustration contradicts the structured scene contract."]) };
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
  const references = (await Promise.all(identityReferences.slice(0, 3).map(async (reference) => {
    const source = await referenceSource(reference);
    return source ? sharp(source).rotate().resize(640, 640, { fit: "inside" }).jpeg({ quality: 78 }).toBuffer() : null;
  }))).filter(Boolean);
  if (!references.length) return { approved: true, issues: [] };
  const goal = renderingMode === "photorealistic"
    ? "maximum likeness with natural, non-cartoon facial geometry"
    : "strong recognizable likeness while changing only the artistic medium";
  const instruction = `You are checking identity fidelity in one personalized children's-book ${pageLabel}.
Image 1 is the generated result. The remaining images are private identity references for the visible named people or animals.
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
  targetedRepairAvailable = false,
  ...generationOptions
}) {
  let previousIssues = [];
  let previousRejectionKind = "technical";
  let omitReferenceImages = false;
  let safetyFallbackActive = false;
  let attemptLimit = maximumAttempts;
  let lastCandidateImageUrl = "";
  for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
    const referenceImagesForAttempt = omitReferenceImages
      ? generationOptions.referenceImages?.filter((reference) => reference?.kind === "continuity")
      : generationOptions.referenceImages;
    const model = referenceImagesForAttempt?.length
      ? (process.env.REFERENCE_IMAGE_MODEL || "gpt-image-2")
      : (generationOptions.model || process.env.IMAGE_MODEL || "gpt-image-2");
    onAttempt?.({ phase: "started", attempt, maximumAttempts: attemptLimit, pageLabel, model, safetyFallback: safetyFallbackActive });
    const repairNote = previousIssues.length
      ? previousRejectionKind === "style"
        ? `\n\nSTYLE CONTINUITY REGENERATION: the previous output differed from the locked reference because ${previousIssues.join("; ")}. Treat the continuity reference as authoritative. Preserve its same broad rendering family and visual medium. Do not switch between realistic dimensional illustration, painterly watercolor/gouache, flat drawn cartoon/manga, or crafted paper/collage. Differences in scene and lighting are allowed.`
        : previousRejectionKind === "identity"
          ? `\n\nIDENTITY FIDELITY REGENERATION: the previous output replaced or altered the referenced subject because ${previousIssues.join("; ")}. Treat the identity reference as authoritative. Preserve natural face geometry, eye shape and spacing, nose, mouth, ears, hair shape and distinctive visible details. Change the medium and scene, never the person's identity.`
        : previousRejectionKind === "scene"
          ? `\n\nSCENE FIDELITY REGENERATION: the previous output contradicted the authoritative scene contract because ${previousIssues.join("; ")}. Correct exactly who performs the main action and toward whom, keep generic people distinct from recurring named characters, and obey the required quantity, physical scale, spatial relationships and forbidden substitutions.`
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
      const scopedRepairVerification = Array.isArray(qualityReviewScope) && qualityReviewScope.length > 0;
      const [styleInspection, sceneInspection, identityInspection] = inspection.approved
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
          scopedRepairVerification ? Promise.resolve({ approved: true, issues: [] }) : advisoryCheck(inspectIdentityLikeness({
            imagePath: outputImagePath(imageUrl),
            identityReferences,
            renderingMode: generationOptions.renderingMode,
            likenessGoal: generationOptions.likenessGoal,
            pageLabel,
          })),
        ])
        : [{ approved: false, issues: [] }, { approved: false, issues: [] }, { approved: false, issues: [] }];
      if (inspection.approved && styleInspection.approved && sceneInspection.approved && identityInspection.approved) {
        await onCandidate?.({
          imageUrl,
          attempt,
          maximumAttempts: attemptLimit,
          status: "accepted",
          rejectionKind: "",
          issues: [],
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
        sceneIssues: sceneInspection.issues,
        styleIssues: styleInspection.issues,
        identityIssues: identityInspection.issues,
      });
      const automaticRepairPolicy = targetedVisualRepairPolicy(disposition.blocking, {
        source: inspection.approved ? "scene" : "technical",
      });
      if (
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
      if (
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
      if (inspection.approved
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
      previousIssues = inspection.approved ? [...styleInspection.issues, ...sceneInspection.issues, ...identityInspection.issues] : inspection.issues;
      previousRejectionKind = inspection.approved
        ? (!sceneInspection.approved ? "scene" : !identityInspection.approved ? "identity" : "style")
        : "technical";
      const quarantineImmediately = inspection.approved
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
        issueCodes: disposition.issueCodes,
        repairPolicy: automaticRepairPolicy,
      });
      onAttempt?.({
        phase: quarantineImmediately ? "quarantined-for-targeted-repair" : "rejected",
        attempt,
        maximumAttempts: quarantineImmediately ? attempt : attemptLimit,
        pageLabel,
        issues: previousIssues,
        issueCodes: disposition.issueCodes,
      });
      if (quarantineImmediately) {
        attemptLimit = attempt;
        break;
      }
    } catch (error) {
      onAttempt?.({ phase: "failed", attempt, maximumAttempts: attemptLimit, pageLabel, error: String(error?.message || error) });
      if (isImageSafetyRejection(error) && !omitReferenceImages && generationOptions.referenceImages?.length) {
        const continuityReferences = generationOptions.referenceImages.filter((reference) => reference?.kind === "continuity");
        if (!continuityReferences.length) {
          throw new Error("The identity reference could not be used safely. Upload a clear, non-branded portrait before regenerating the visual proof.");
        }
        // Do not retry the rejected input unchanged. Keep the textual identity
        // canon, but omit source pixels that may contain a logo or protected
        // character. This makes the next request safer without bypassing policy.
        omitReferenceImages = true;
        safetyFallbackActive = true;
        previousRejectionKind = "technical";
        previousIssues = [];
        // A rejected request returned no image. If it happened on the final
        // normal attempt, allow exactly one continuity-only replacement call.
        // `omitReferenceImages` prevents this bounded extension from repeating.
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
  const finalBlockingIssues = previousRejectionKind === "technical"
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
    repairPolicy: targetedVisualRepairPolicy(reportedFailureIssues, { source: previousRejectionKind }),
  });
}

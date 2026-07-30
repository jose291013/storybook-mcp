import { runAgent } from "../services/agentRunner.js";
import { loadPrompt } from "../services/loadPrompt.js";
import { enrichFamilyAddress } from "../services/characterRelationships.js";

function clean(value, maximum = 700) {
  return String(value || "").trim().slice(0, maximum);
}

function list(value, maximum = 20) {
  return (Array.isArray(value) ? value : []).filter(Boolean).slice(0, maximum);
}

export const STORY_PLAN_AUDIT_CONTRACT_VERSION = 1;

export function versionedStoryPlanAuditStep(step = "story-plan-audit") {
  const prefix = `audit-contract:v${STORY_PLAN_AUDIT_CONTRACT_VERSION}:`;
  const normalized = String(step || "story-plan-audit").trim();
  return normalized.startsWith(prefix) ? normalized : `${prefix}${normalized}`;
}

export function authoritativeSceneContractForAudit(contract = {}) {
  return {
    audit_contract_version: STORY_PLAN_AUDIT_CONTRACT_VERSION,
    spread_number: Math.max(0, Number(contract?.spread_number || 0)),
    scene_number: Math.max(0, Number(contract?.scene_number || 0)),
    text_page_number: Math.max(0, Number(contract?.text_page_number || 0)),
    image_page_number: Math.max(0, Number(contract?.image_page_number || 0)),
    main_action: {
      subject: clean(contract?.main_action?.subject),
      verb: clean(contract?.main_action?.verb),
      target: clean(contract?.main_action?.target),
    },
    named_characters: list(contract?.named_characters, 10).map((character) => ({
      name: clean(character?.name),
      entity_type: clean(character?.entity_type),
      species: clean(character?.species),
      visual_role: clean(character?.visual_role),
      action: clean(character?.action),
    })),
    generic_characters: list(contract?.generic_characters, 12).map((character) => ({
      id: clean(character?.id),
      description: clean(character?.description),
      action: clean(character?.action),
      must_not_resemble: list(character?.must_not_resemble, 10).map((name) => clean(name)),
    })),
    required_elements: list(contract?.required_elements, 15).map((element) => ({
      description: clean(element?.description),
      quantity: clean(element?.quantity),
      scale: clean(element?.scale),
    })),
    object_states: list(contract?.object_states, 20).map((objectState) => ({
      name: clean(objectState?.name),
      owner: clean(objectState?.owner),
      state: clean(objectState?.state),
      quantity: Math.max(1, Number(objectState?.quantity || 1)),
      instruction: clean(objectState?.instruction),
    })),
    spatial_relationships: list(contract?.spatial_relationships, 12).map((relationship) => clean(relationship)),
    forbidden_elements: list(contract?.forbidden_elements, 12).map((element) => clean(element)),
  };
}

function key(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasName(value, name) {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(name)}(?=$|[^\\p{L}\\p{N}])`, "iu").test(String(value || ""));
}

const PHYSICAL_ACTION_PATTERN = /(?:\bstands?\b|\bstanding\b|\bbeside\b|\bnext to\b|\bapproach(?:es|ed|ing)?\b|\btouch(?:es|ed|ing)?\b|\bputs? (?:a|her|his) hand\b|\bholds?\b|\bcarries\b|\bwalks?\b|\bruns?\b|\btravels?\b|\bcrosses\b|\bdebout\b|\b[àa] c[oô]t[ée]\b|\bs['’]approche\b|\bapproche\b|\btouche\b|\bpose (?:sa|une) main\b|\bprend\b|\bporte\b|\bmarche\b|\bcourt\b|\bvoyage\b|\btraverse\b|\bse tient\b|\bde pie\b|\bal lado\b|\bse acerca\b|\btoca\b|\bpone (?:su|una) mano\b|\bsostiene\b|\blleva\b|\bcamina\b|\bcorre\b|\bviaja\b|\bcruza\b)/iu;
const NONPHYSICAL_CONTEXT_PATTERN = /(?:\bthought\b|\bmemory\b|\bremember(?:s|ed|ing)?\b|\bimagines?\b|\bvoice\b|\bin (?:his|her|their) mind\b|\bpens[ée]e?\b|\bsouvenir\b|\bse souvient\b|\bimagine\b|\bvoix\b|\bdans (?:sa|ses) pens[ée]es?\b|\bpensamiento\b|\brecuerdo\b|\brecuerda\b|\bimagina\b|\bvoz\b|\ben su mente\b)/iu;
const OBJECT_POSSESSION_PATTERN = /(?:\bholds?\b|\bholding\b|\bcarries\b|\bcarrying\b|\bwears?\b|\bin (?:his|her|their) hand\b|\bprend\b|\btient\b|\btenant\b|\bporte\b|\bdans (?:sa|ses) mains?\b|\bsostiene\b|\blleva\b|\ben (?:su|sus) manos?\b)/iu;
const IRREVERSIBLE_OBJECT_STATES = new Set(["planted", "consumed", "transformed", "destroyed", "used_up"]);
const OBJECT_NAME_STOP_WORDS = new Set(["avec", "dans", "pour", "sans", "sous", "the", "with", "from", "into", "une", "des", "aux", "mille", "couleurs", "magique", "magical", "magica", "magico"]);

function sentenceContaining(text, name) {
  return String(text || "")
    .split(/(?<=[.!?])\s+|\n+/u)
    .filter((sentence) => hasName(sentence, name));
}

function objectSentences(text, name) {
  const words = key(name).split(" ").filter((word) => word.length >= 4 && !OBJECT_NAME_STOP_WORDS.has(word));
  return String(text || "")
    .split(/(?<=[.!?])\s+|\n+/u)
    .filter((sentence) => {
      const searchable = key(sentence).split(" ");
      return words.some((word) => searchable.includes(word));
    });
}

function quotedSegments(text) {
  const result = [];
  const pattern = /«([^»]+)»|“([^”]+)”|"([^"]+)"/gu;
  let match;
  while ((match = pattern.exec(String(text || "")))) result.push(match[1] || match[2] || match[3] || "");
  return result;
}

function usesParentFirstNameAsFamilyReference(quote, name) {
  if (!hasName(quote, name)) return false;
  const familyReference = /(?:\b(?:advice|instructions?|example) (?:from|of)\b|\blisten to\b|\bfollow\b|\b(?:conseils?|instructions?|exemple) de\b|\b[ée]coutons?\b|\bsuivons?\b|\b(?:consejos?|instrucciones|ejemplo) de\b|\bescuchemos\b|\bsigamos\b)/iu;
  return familyReference.test(quote);
}

export function deterministicStoryPlanIssues({
  approvedScenario,
  pageTexts,
  speechSegmentsByPage = {},
  sceneContracts,
  canonicalCharacters = [],
  language = "FR",
}) {
  if (!approvedScenario) return [];
  const authoritativeSceneContracts = (Array.isArray(sceneContracts) ? sceneContracts : [])
    .map((contract) => authoritativeSceneContractForAudit(contract));
  const characters = [
    ...(Array.isArray(canonicalCharacters) ? canonicalCharacters : []),
    ...(Array.isArray(approvedScenario.characters) ? approvedScenario.characters : []),
  ]
    .filter((character) => character?.name)
    .filter((character, index, all) => all.findIndex((candidate) => key(candidate.name) === key(character.name)) === index)
    .map((character) => enrichFamilyAddress(character, language));
  const issues = [];
  const childNames = new Set(characters
    .filter((character) => (
      key(character?.role) === "child"
      || key(character?.relationship) === "hero"
    ))
    .map((character) => key(character.name)));
  for (const contract of authoritativeSceneContracts) {
    const sceneNumber = Number(contract?.scene_number || 0);
    const approvedScene = approvedScenario.scenes?.find((scene) => Number(scene?.sceneNumber) === sceneNumber);
    if (!approvedScene) continue;
    const text = String(pageTexts?.[contract.text_page_number] || "");
    const speechSegments = Array.isArray(speechSegmentsByPage?.[contract.text_page_number])
      ? speechSegmentsByPage[contract.text_page_number]
      : [];
    const presences = Array.isArray(approvedScene.characterPresences) ? approvedScene.characterPresences : [];
    const approvedPhysical = presences.filter((presence) => presence?.mode === "physical").map((presence) => key(presence.name)).sort();
    const contractPhysical = (Array.isArray(contract.named_characters) ? contract.named_characters : []).map((character) => key(character?.name)).filter(Boolean).sort();
    if (approvedPhysical.join("|") !== contractPhysical.join("|")) {
      issues.push({
        sceneNumber,
        code: "physical_cast_mismatch",
        explanation: "Restore the exact approved physical cast in the illustration contract.",
      });
    }
    for (const character of characters) {
      const presence = presences.find((item) => key(item?.name) === key(character.name));
      const mentions = sentenceContaining(text, character.name);
      if (!mentions.length) continue;
      if (!presence) {
        issues.push({
          sceneNumber,
          code: "unapproved_character_mention",
          explanation: `${character.name} is absent from the approved scene and must not be introduced in its reader-visible prose.`,
        });
        continue;
      }
      if (presence.mode !== "physical" && mentions.some((sentence) => (
        PHYSICAL_ACTION_PATTERN.test(sentence) && !NONPHYSICAL_CONTEXT_PATTERN.test(sentence)
      ))) {
        issues.push({
          sceneNumber,
          code: "nonphysical_character_action",
          explanation: `${character.name} is approved only as ${presence.mode}; rewrite the prose as an explicit thought, memory or voice with no physical action.`,
        });
      }
    }
    for (const character of characters.filter((item) => item.preferredAddress)) {
      const structuredViolation = speechSegments.some((segment) => (
        childNames.has(key(segment?.speaker))
        && ["dialogue", "thought"].includes(key(segment?.mode))
        && hasName(segment?.text, character.name)
        && !hasName(segment?.text, character.preferredAddress)
      ));
      const legacyViolation = quotedSegments(text).some((quote) => (
        usesParentFirstNameAsFamilyReference(quote, character.name)
        && !hasName(quote, character.preferredAddress)
      ));
      if (structuredViolation || legacyViolation) {
        issues.push({
          sceneNumber,
          code: "family_address",
          explanation: `Inside the child's dialogue or thoughts, refer to ${character.name} as ${character.preferredAddress}; keep the civil name for narration.`,
        });
      }
    }
    for (const objectState of Array.isArray(approvedScene.objectStates) ? approvedScene.objectStates : []) {
      if (!IRREVERSIBLE_OBJECT_STATES.has(objectState?.state)) continue;
      if (objectSentences(text, objectState.name).some((sentence) => OBJECT_POSSESSION_PATTERN.test(sentence))) {
        issues.push({
          sceneNumber,
          code: "irreversible_object_reappears",
          explanation: `${objectState.name} is ${objectState.state} in the approved lifecycle and cannot reappear intact in a character's hand.`,
        });
      }
    }
  }
  return issues.slice(0, 8);
}

export async function storyScenePlanAuditAgent({
  approvedScenario,
  pageTexts,
  speechSegmentsByPage = {},
  sceneContracts,
  canonicalCharacters = [],
  language = "FR",
}, {
  backgroundExecution = null,
  backgroundStep = "story-plan-audit",
  modelRole = "story_auditor",
} = {}) {
  if (!approvedScenario) return { status: "approved", issues: [] };
  const authoritativeSceneContracts = (Array.isArray(sceneContracts) ? sceneContracts : [])
    .map((contract) => authoritativeSceneContractForAudit(contract));
  const deterministicIssues = deterministicStoryPlanIssues({
    approvedScenario,
    pageTexts,
    speechSegmentsByPage,
    sceneContracts: authoritativeSceneContracts,
    canonicalCharacters,
    language,
  });
  if (deterministicIssues.length) {
    return {
      status: "rejected",
      issues: deterministicIssues,
      source: "deterministic",
    };
  }
  const result = await runAgent({
    name: "storyScenePlanAudit",
    clientKind: "story",
    modelRole,
    jsonRepairModelRole: "story_repair",
    system: loadPrompt("story_scene_plan_audit.txt"),
    user: (input) => `FINAL_STORY_PLAN_JSON:\n${JSON.stringify(input, null, 2)}\n\nReturn ONLY the requested JSON object.`,
    backgroundExecution,
    backgroundStep: versionedStoryPlanAuditStep(backgroundStep),
    input: {
      approved_scenario: approvedScenario,
      canonical_characters: canonicalCharacters.map((character) => enrichFamilyAddress(character, language)),
      page_texts: pageTexts,
      speech_segments_by_page: speechSegmentsByPage,
      scene_contracts: authoritativeSceneContracts,
    },
  });
  const audit = result?.audit || {};
  const modelIssues = (Array.isArray(audit.issues) ? audit.issues : []).slice(0, 8).map((issue) => ({
    sceneNumber: Math.max(0, Number(issue?.scene_number || 0)),
    code: clean(issue?.code, 80) || "scenario_fidelity",
    explanation: clean(issue?.explanation),
  })).filter((issue) => issue.explanation);
  const issues = modelIssues
    .filter((issue, index, all) => all.findIndex((candidate) => (
      candidate.sceneNumber === issue.sceneNumber && candidate.code === issue.code
    )) === index)
    .slice(0, 8);
  return {
    status: audit.status === "rejected" || issues.length ? "rejected" : "approved",
    issues,
    source: "model",
  };
}

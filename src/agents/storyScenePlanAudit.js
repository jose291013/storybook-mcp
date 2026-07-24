import { runAgent } from "../services/agentRunner.js";
import { loadPrompt } from "../services/loadPrompt.js";
import { enrichFamilyAddress } from "../services/characterRelationships.js";

function clean(value, maximum = 700) {
  return String(value || "").trim().slice(0, maximum);
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

function sentenceContaining(text, name) {
  return String(text || "")
    .split(/(?<=[.!?])\s+|\n+/u)
    .filter((sentence) => hasName(sentence, name));
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
  sceneContracts,
  canonicalCharacters = [],
  language = "FR",
}) {
  if (!approvedScenario) return [];
  const characters = [
    ...(Array.isArray(canonicalCharacters) ? canonicalCharacters : []),
    ...(Array.isArray(approvedScenario.characters) ? approvedScenario.characters : []),
  ]
    .filter((character) => character?.name)
    .filter((character, index, all) => all.findIndex((candidate) => key(candidate.name) === key(character.name)) === index)
    .map((character) => enrichFamilyAddress(character, language));
  const issues = [];
  for (const contract of Array.isArray(sceneContracts) ? sceneContracts : []) {
    const sceneNumber = Number(contract?.scene_number || 0);
    const approvedScene = approvedScenario.scenes?.find((scene) => Number(scene?.sceneNumber) === sceneNumber);
    if (!approvedScene) continue;
    const text = String(pageTexts?.[contract.text_page_number] || "");
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
      if (quotedSegments(text).some((quote) => (
        usesParentFirstNameAsFamilyReference(quote, character.name)
        && !hasName(quote, character.preferredAddress)
      ))) {
        issues.push({
          sceneNumber,
          code: "family_address",
          explanation: `Inside the child's dialogue or thoughts, refer to ${character.name} as ${character.preferredAddress}; keep the civil name for narration.`,
        });
      }
    }
  }
  return issues.slice(0, 8);
}

export async function storyScenePlanAuditAgent({
  approvedScenario,
  pageTexts,
  sceneContracts,
  canonicalCharacters = [],
  language = "FR",
}) {
  if (!approvedScenario) return { status: "approved", issues: [] };
  const result = await runAgent({
    name: "storyScenePlanAudit",
    clientKind: "qa",
    system: loadPrompt("story_scene_plan_audit.txt"),
    user: (input) => `FINAL_STORY_PLAN_JSON:\n${JSON.stringify(input, null, 2)}\n\nReturn ONLY the requested JSON object.`,
    input: {
      approved_scenario: approvedScenario,
      canonical_characters: canonicalCharacters.map((character) => enrichFamilyAddress(character, language)),
      page_texts: pageTexts,
      scene_contracts: sceneContracts,
    },
  });
  const audit = result?.audit || {};
  const modelIssues = (Array.isArray(audit.issues) ? audit.issues : []).slice(0, 8).map((issue) => ({
    sceneNumber: Math.max(0, Number(issue?.scene_number || 0)),
    code: clean(issue?.code, 80) || "scenario_fidelity",
    explanation: clean(issue?.explanation),
  })).filter((issue) => issue.explanation);
  const deterministicIssues = deterministicStoryPlanIssues({
    approvedScenario,
    pageTexts,
    sceneContracts,
    canonicalCharacters,
    language,
  });
  const issues = [...deterministicIssues, ...modelIssues]
    .filter((issue, index, all) => all.findIndex((candidate) => (
      candidate.sceneNumber === issue.sceneNumber && candidate.code === issue.code
    )) === index)
    .slice(0, 8);
  return {
    status: audit.status === "rejected" || issues.length ? "rejected" : "approved",
    issues,
  };
}

import { runAgent } from "../services/agentRunner.js";
import { loadPrompt } from "../services/loadPrompt.js";
import { enrichFamilyAddress } from "../services/characterRelationships.js";
import { canonicalizeWrittenNames } from "./blueprintFiller.js";

function clean(value, maximum = 900) {
  return String(value || "").trim().slice(0, maximum);
}

function list(value, maximum = 30) {
  return (Array.isArray(value) ? value : []).filter(Boolean).slice(0, maximum);
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
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(name)}(?=$|[^\\p{L}\\p{N}])`, "iu")
    .test(String(value || ""));
}

function uniqueNames(characters) {
  return list(characters, 50)
    .map((character) => clean(character?.name, 120))
    .filter((name, index, all) => name && all.findIndex((candidate) => key(candidate) === key(name)) === index);
}

export function sanitizeStoryRepairText({
  text,
  forbiddenCharacters = [],
  fallbackText = "",
}) {
  const forbidden = uniqueNames(forbiddenCharacters.map((name) => ({ name })));
  const sanitize = (value) => {
    const sentences = String(value || "").match(/[^.!?…\n]+(?:[.!?…]+|$)/gu) || [];
    return sentences
      .filter((sentence) => !forbidden.some((name) => hasName(sentence, name)))
      .join(" ")
      .replace(/\s+/gu, " ")
      .trim();
  };
  return sanitize(text) || sanitize(fallbackText);
}

export function buildStorySceneTextRepairTargets({
  approvedScenario,
  pageTexts,
  sceneContracts,
  issues,
  canonicalCharacters = [],
}) {
  const canonicalNames = uniqueNames(canonicalCharacters);
  const targets = [];
  for (const contract of list(sceneContracts)) {
    const sceneNumber = Number(contract?.scene_number || 0);
    const textPageNumber = Number(contract?.text_page_number || 0);
    const sceneIssues = list(issues, 20)
      .filter((issue) => Number(issue?.sceneNumber || 0) === sceneNumber)
      .map((issue) => ({
        code: clean(issue?.code, 80) || "scenario_fidelity",
        explanation: clean(issue?.explanation),
      }))
      .filter((issue) => issue.explanation);
    if (!sceneIssues.length || !textPageNumber) continue;
    const approvedScene = list(approvedScenario?.scenes, 40)
      .find((scene) => Number(scene?.sceneNumber || 0) === sceneNumber);
    if (!approvedScene) continue;
    const approvedNames = new Set(list(approvedScene.characterPresences, 30)
      .map((presence) => key(presence?.name))
      .filter(Boolean));
    targets.push({
      scene_number: sceneNumber,
      text_page_number: textPageNumber,
      current_text: clean(pageTexts?.[textPageNumber], 5000),
      approved_scene: approvedScene,
      forbidden_characters: canonicalNames.filter((name) => !approvedNames.has(key(name))),
      issues: sceneIssues,
    });
  }
  return targets;
}

export async function storySceneTextRepairAgent({
  approvedScenario,
  pageTexts,
  sceneContracts,
  issues,
  canonicalCharacters = [],
  language = "FR",
}) {
  const targets = buildStorySceneTextRepairTargets({
    approvedScenario,
    pageTexts,
    sceneContracts,
    issues,
    canonicalCharacters,
  });
  if (!targets.length) return { ...pageTexts };

  const result = await runAgent({
    name: "storySceneTextRepair",
    clientKind: "story",
    system: loadPrompt("story_scene_text_repair.txt"),
    user: (input) => `TARGETED_STORY_REPAIR_JSON:\n${JSON.stringify(input, null, 2)}\n\nReturn ONLY the requested JSON object.`,
    input: {
      language,
      canonical_characters: list(canonicalCharacters, 30)
        .map((character) => enrichFamilyAddress(character, language)),
      repair_targets: targets,
    },
  });

  const supplied = new Map(list(result?.page_texts, targets.length + 5)
    .map((item) => [Number(item?.page_number || 0), clean(item?.text, 5000)]));
  const repaired = { ...pageTexts };
  for (const target of targets) {
    const text = supplied.get(target.text_page_number);
    if (!text) {
      throw new Error(`Targeted story repair omitted text page ${target.text_page_number}`);
    }
    const canonicalized = canonicalizeWrittenNames(text, canonicalCharacters);
    const sanitized = sanitizeStoryRepairText({
      text: canonicalized,
      forbiddenCharacters: target.forbidden_characters,
      fallbackText: target.approved_scene?.action,
    });
    if (!sanitized) {
      throw new Error(`Targeted story repair left no approved prose for text page ${target.text_page_number}`);
    }
    repaired[target.text_page_number] = sanitized;
  }
  return repaired;
}

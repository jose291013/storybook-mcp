import { enrichFamilyAddress } from "./characterRelationships.js";

export const STORY_PLAN_COMPILER_VERSION = 2;

const FAMILY_ADDRESS_CODES = new Set([
  "family_address",
  "parent_first_name_in_dialogue",
]);

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

function replaceName(value, name, replacement) {
  if (!name || !replacement || key(name) === key(replacement)) return String(value || "");
  return String(value || "").replace(
    new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(name)}(?=$|[^\\p{L}\\p{N}])`, "giu"),
    (match, prefix) => `${prefix}${replacement}`,
  );
}

function replaceParentReferences(value, parents) {
  let output = String(value || "");
  for (const parent of parents) {
    output = replaceName(output, parent.name, parent.preferredAddress);
  }
  return output;
}

function hasKeyPhrase(value, phrase) {
  const haystack = ` ${key(value)} `;
  const needle = key(phrase);
  return Boolean(needle) && haystack.includes(` ${needle} `);
}

function parentCharacters(characters, language) {
  return (Array.isArray(characters) ? characters : [])
    .filter((character) => character?.name)
    .map((character) => enrichFamilyAddress(character, language))
    .filter((character) => character.preferredAddress)
    .filter((character, index, all) => (
      all.findIndex((candidate) => key(candidate.name) === key(character.name)) === index
    ));
}

function quotedSegments(text) {
  const segments = [];
  const pattern = /«([^»]+)»|“([^”]+)”|"([^"]+)"/gu;
  let match;
  while ((match = pattern.exec(String(text || "")))) {
    const content = match[1] || match[2] || match[3] || "";
    const relativeStart = match[0].indexOf(content);
    segments.push({
      content,
      start: match.index + relativeStart,
      end: match.index + relativeStart + content.length,
    });
  }
  return segments;
}

function heroAttribution(text, segment, heroName) {
  if (!heroName) return false;
  const hero = escapeRegExp(heroName);
  const before = String(text || "").slice(Math.max(0, segment.start - 140), segment.start);
  const after = String(text || "").slice(segment.end, Math.min(String(text || "").length, segment.end + 140));
  const speechVerb = "(?:dit|demande|répond|murmure|s’exclame|s'exclame|pense|songe|se dit|se souvient|says?|asks?|replies|whispers?|thinks?|remembers?|dice|pregunta|responde|susurra|piensa|recuerda)";
  return new RegExp(`${hero}\\s+${speechVerb}\\b`, "iu").test(before)
    || new RegExp(`${speechVerb}\\s+${hero}\\b`, "iu").test(after);
}

function heroThoughtSentence(sentence, heroName) {
  if (!heroName) return false;
  const hero = escapeRegExp(heroName);
  const thoughtVerb = "(?:pense|songe|se dit|se souvient|thinks?|remembers?|piensa|recuerda)";
  return new RegExp(`(?:${hero}\\s+${thoughtVerb}\\b|${thoughtVerb}\\s+${hero}\\b)`, "iu")
    .test(String(sentence || ""));
}

function replaceAttributedParentReferences({
  text,
  parents,
  heroName,
  structuredSegments = [],
  forceFamilyRepair = false,
}) {
  let output = String(text || "");
  let replacements = 0;
  const heroSegments = new Set((Array.isArray(structuredSegments) ? structuredSegments : [])
    .filter((segment) => key(segment?.speaker) === key(heroName))
    .filter((segment) => ["dialogue", "thought"].includes(key(segment?.mode)))
    .map((segment) => key(segment?.text))
    .filter(Boolean));
  const ranges = quotedSegments(output);
  const parentRanges = ranges.filter((segment) => (
    parents.some((parent) => hasKeyPhrase(segment.content, parent.name))
  ));
  for (const segment of ranges.reverse()) {
    const shouldNormalize = heroSegments.has(key(segment.content))
      || heroAttribution(output, segment, heroName)
      || (forceFamilyRepair
        && parentRanges.length === 1
        && parentRanges[0].start === segment.start);
    if (!shouldNormalize) continue;
    const normalized = replaceParentReferences(segment.content, parents);
    if (normalized === segment.content) continue;
    output = `${output.slice(0, segment.start)}${normalized}${output.slice(segment.end)}`;
    replacements += 1;
  }
  output = output.replace(/[^.!?…\n]+(?:[.!?…]+|$)/gu, (sentence) => {
    if (!heroThoughtSentence(sentence, heroName)) return sentence;
    if (quotedSegments(sentence).length) return sentence;
    const normalized = replaceParentReferences(sentence, parents);
    if (normalized !== sentence) replacements += 1;
    return normalized;
  });
  for (const segment of Array.isArray(structuredSegments) ? structuredSegments : []) {
    if (key(segment?.speaker) !== key(heroName)) continue;
    if (!["dialogue", "thought"].includes(key(segment?.mode))) continue;
    const original = String(segment?.text || "");
    const normalized = replaceParentReferences(original, parents);
    if (!original || original === normalized) continue;
    if (output.includes(original)) {
      output = output.replace(original, normalized);
      replacements += 1;
    }
  }
  return { text: output, replacements };
}

function familyIssuePages(issues, sceneContracts) {
  const affectedScenes = new Set((Array.isArray(issues) ? issues : [])
    .filter((issue) => FAMILY_ADDRESS_CODES.has(String(issue?.code || "")))
    .map((issue) => Number(issue?.sceneNumber || 0))
    .filter(Boolean));
  return new Set((Array.isArray(sceneContracts) ? sceneContracts : [])
    .filter((contract) => affectedScenes.has(Number(contract?.scene_number || 0)))
    .map((contract) => Number(contract?.text_page_number || 0))
    .filter(Boolean));
}

function normalizeSpeechSegments(segments, parents, heroName) {
  let replacements = 0;
  const normalized = (Array.isArray(segments) ? segments : []).map((segment) => {
    if (key(segment?.speaker) !== key(heroName)) return { ...segment };
    if (!["dialogue", "thought"].includes(key(segment?.mode))) return { ...segment };
    const text = replaceParentReferences(segment?.text, parents);
    if (text !== String(segment?.text || "")) replacements += 1;
    return { ...segment, text };
  });
  return { segments: normalized, replacements };
}

function familyReferenceRemains(text, parents, forceAllQuotes, heroName) {
  return quotedSegments(text).some((segment) => (
    (forceAllQuotes || heroAttribution(text, segment, heroName))
    && parents.some((parent) => new RegExp(
      `(^|[^\\p{L}\\p{N}])${escapeRegExp(parent.name)}(?=$|[^\\p{L}\\p{N}])`,
      "iu",
    ).test(segment.content))
  ));
}

export function classifyStoryPlanIssues(issues = [], {
  canonicalCharacters = [],
  language = "FR",
} = {}) {
  const parents = parentCharacters(canonicalCharacters, language);
  const autoFixable = [];
  const creative = [];
  for (const issue of Array.isArray(issues) ? issues : []) {
    const code = key(issue?.code);
    const codeIdentifiesFamilyAddress = FAMILY_ADDRESS_CODES.has(String(issue?.code || ""))
      || (
        /(?:family|parent).*(?:address|first name|given name|dialogue|thought)/u.test(code)
        || /(?:address|first name|given name).*(?:family|parent)/u.test(code)
      );
    const explanationIdentifiesFamilyAddress = parents.some((parent) => (
      hasKeyPhrase(issue?.explanation, parent.name)
      && hasKeyPhrase(issue?.explanation, parent.preferredAddress)
    ));
    if (codeIdentifiesFamilyAddress || explanationIdentifiesFamilyAddress) {
      autoFixable.push({
        ...issue,
        originalCode: String(issue?.code || ""),
        code: "family_address",
      });
    }
    else creative.push(issue);
  }
  return { autoFixable, creative };
}

export function compileStoryPlan(plan = {}, {
  canonicalCharacters = [],
  heroName = "",
  language = "FR",
  issues = [],
} = {}) {
  const parents = parentCharacters(canonicalCharacters, language);
  const classifiedIssues = classifyStoryPlanIssues(issues, {
    canonicalCharacters,
    language,
  });
  const normalizedIssues = [
    ...classifiedIssues.autoFixable,
    ...classifiedIssues.creative,
  ];
  const pageTexts = { ...(plan?.pageTexts || {}) };
  const speechSegmentsByPage = Object.fromEntries(
    Object.entries(plan?.speechSegmentsByPage || {}).map(([page, segments]) => [
      page,
      (Array.isArray(segments) ? segments : []).map((segment) => ({ ...segment })),
    ]),
  );
  const forcePages = familyIssuePages(normalizedIssues, plan?.sceneContracts);
  const changedPages = [];
  let replacements = 0;

  for (const [page, rawText] of Object.entries(pageTexts)) {
    const structured = normalizeSpeechSegments(
      speechSegmentsByPage[page],
      parents,
      heroName,
    );
    speechSegmentsByPage[page] = structured.segments;
    const normalized = replaceAttributedParentReferences({
      text: rawText,
      parents,
      heroName,
      structuredSegments: plan?.speechSegmentsByPage?.[page],
      forceFamilyRepair: forcePages.has(Number(page)),
    });
    pageTexts[page] = normalized.text;
    replacements += structured.replacements + normalized.replacements;
    if (normalized.text !== String(rawText || "")) changedPages.push(Number(page));
  }

  const unresolvedIssueKeys = new Set();
  for (const issue of classifiedIssues.autoFixable) {
    const sceneNumber = Number(issue?.sceneNumber || 0);
    const pageNumber = Number((plan?.sceneContracts || []).find(
      (contract) => Number(contract?.scene_number || 0) === sceneNumber,
    )?.text_page_number || 0);
    if (!pageNumber || familyReferenceRemains(
      pageTexts[pageNumber],
      parents,
      true,
      heroName,
    )) {
      unresolvedIssueKeys.add(`${sceneNumber}:${issue.code}`);
    }
  }

  return {
    ...plan,
    pageTexts,
    speechSegmentsByPage,
    compiler: {
      version: STORY_PLAN_COMPILER_VERSION,
      replacements,
      changedPages: [...new Set(changedPages)].sort((left, right) => left - right),
      unresolvedIssueKeys: [...unresolvedIssueKeys],
    },
  };
}

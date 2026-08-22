import { isTransientOpenAIError } from "./openaiErrorPolicy.js";

export const BLUEPRINT_QA_CHECKPOINT_VERSION = 1;

const ISSUE_FAMILIES = [
  ["underwater_safety", /underwater|breath|snorkel|deep water|pressure|oxygen|respirat/i],
  ["wardrobe", /wardrobe|outfit|clothing|dress|costume|tenue|vetement/i],
  ["character_cast", /cast|character|companion|person|physically present|presence/i],
  ["world_physics", /physics|physical|gravity|buoyancy|refraction|anatomy|scale|hazard/i],
  ["object_state", /object|quest_object|discover|possess|transform|destroy|consume|plant/i],
  ["chronology_travel", /chronolog|transition|travel|arrival|teleport|passage|before|after|location/i],
  ["language", /language|placeholder|prose|title/i],
  ["page_structure", /page|spread|opening|closing|alternat|interior/i],
  ["visual_contract", /image|illustration|visual|square|composition|prompt/i],
  ["narrative_contract", /storybrand|narrative|climax|success|transformation|moral|tone/i],
];

function issueText(issue) {
  if (typeof issue === "string") return issue;
  return [issue?.path, issue?.instruction, issue?.message].filter(Boolean).join(" ");
}

export function blueprintQaIssueCodes(qa, { maximum = 12 } = {}) {
  const candidates = [
    ...(Array.isArray(qa?.qa?.issues) ? qa.qa.issues : []),
    ...(Array.isArray(qa?.qa?.fixes) ? qa.qa.fixes : []),
  ];
  const codes = candidates.map((issue) => {
    const text = issueText(issue);
    return ISSUE_FAMILIES.find(([, pattern]) => pattern.test(text))?.[0] || "other";
  });
  return [...new Set(codes)].slice(0, Math.max(1, Number(maximum) || 12));
}

export function blueprintQaCheckpoint({ status, attempt = 0, qa = null, now = new Date().toISOString() }) {
  return {
    version: BLUEPRINT_QA_CHECKPOINT_VERSION,
    status: String(status || "pending"),
    attempt: Math.max(0, Number.parseInt(attempt, 10) || 0),
    issueCodes: blueprintQaIssueCodes(qa),
    updatedAt: now,
  };
}

export function isBlueprintProviderInterruption(error) {
  return error?.code === "scenario_background_timeout" || isTransientOpenAIError(error);
}

export function tagBlueprintProviderInterruption(error, artifactType = "blueprint_qa_repair") {
  if (!isBlueprintProviderInterruption(error)) return error;
  error.code = "preview_interrupted";
  error.artifactType = artifactType;
  return error;
}

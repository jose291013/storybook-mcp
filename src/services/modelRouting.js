const REASONING_EFFORTS = new Set([
  "none", "minimal", "low", "medium", "high", "xhigh", "max",
]);

const ROUTES = {
  blueprint: {
    modelEnv: "BLUEPRINT_MODEL",
    effortEnv: "BLUEPRINT_REASONING_EFFORT",
    defaultModel: "gpt-4.1-mini",
    defaultEffort: "",
  },
  story_architect: {
    modelEnv: "STORY_ARCHITECT_MODEL",
    effortEnv: "STORY_ARCHITECT_REASONING_EFFORT",
    defaultModel: "gpt-5.6-sol",
    defaultEffort: "high",
  },
  story_editor: {
    modelEnv: "STORY_EDITOR_MODEL",
    effortEnv: "STORY_EDITOR_REASONING_EFFORT",
    defaultModel: "gpt-5.6-sol",
    defaultEffort: "high",
  },
  story_repair: {
    modelEnv: "STORY_REPAIR_MODEL",
    effortEnv: "STORY_REPAIR_REASONING_EFFORT",
    defaultModel: "gpt-5.6-terra",
    defaultEffort: "medium",
  },
  story_planner: {
    modelEnv: "STORY_PLANNER_MODEL",
    effortEnv: "STORY_PLANNER_REASONING_EFFORT",
    defaultModel: "gpt-5.6-terra",
    defaultEffort: "high",
  },
  story_auditor: {
    modelEnv: "STORY_AUDITOR_MODEL",
    effortEnv: "STORY_AUDITOR_REASONING_EFFORT",
    defaultModel: "gpt-5.6-terra",
    defaultEffort: "high",
  },
  story_writer: {
    modelEnv: "STORY_WRITER_MODEL",
    effortEnv: "STORY_WRITER_REASONING_EFFORT",
    defaultModel: "gpt-5.6-terra",
    defaultEffort: "medium",
  },
  manuscript_editor: {
    modelEnv: "MANUSCRIPT_EDITOR_MODEL",
    effortEnv: "MANUSCRIPT_EDITOR_REASONING_EFFORT",
    defaultModel: "gpt-5.6-luna",
    defaultEffort: "medium",
  },
  utility: {
    modelEnv: "UTILITY_TEXT_MODEL",
    effortEnv: "UTILITY_REASONING_EFFORT",
    defaultModel: "gpt-5.6-luna",
    defaultEffort: "low",
  },
};

function clean(value) {
  return String(value || "").trim();
}

export function modelRoute(role = "") {
  const route = ROUTES[role];
  if (!route) {
    return {
      role: "legacy",
      model: process.env.TEXT_MODEL || "gpt-4.1-mini",
      reasoningEffort: "",
      api: "chat_completions",
    };
  }
  const requestedEffort = clean(process.env[route.effortEnv]).toLowerCase();
  return {
    role,
    model: clean(process.env[route.modelEnv]) || route.defaultModel,
    reasoningEffort: REASONING_EFFORTS.has(requestedEffort)
      ? requestedEffort
      : route.defaultEffort,
    api: "responses",
  };
}

export function storyModelRoutes() {
  return Object.fromEntries(Object.keys(ROUTES).map((role) => [role, modelRoute(role)]));
}

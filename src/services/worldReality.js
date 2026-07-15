const BASE_PHYSICAL_RULES = [
  "Obey gravity, anatomy, scale, perspective, light direction and cause-and-effect unless one explicit story rule overrides a named law.",
  "Water must have one coherent surface level, horizon, depth, refraction and buoyancy. Coral and reef fish stay below the water surface unless the story explicitly places them in a tide pool or aquarium.",
  "A child fully underwater must have a safe breathing mechanism that the prose introduced before submersion and the illustration shows consistently. A mask alone does not provide air; a snorkel works only near the surface.",
  "Do not show a young child diving, swimming in deep water or facing a dangerous wave without age-appropriate protection and adult supervision, or a clearly established visible magical safety mechanism.",
  "Characters cannot speak normally underwater unless the story has already established a visible magical or technological communication mechanism.",
  "The magnitude shown in the illustration must match the prose: a small wave, light wind or gentle obstacle must never become a life-threatening event.",
];

export function normalizeWorldReality(world = {}) {
  const supplied = world?.reality_contract || {};
  const exceptions = Array.isArray(supplied.fantasy_exceptions)
    ? supplied.fantasy_exceptions.filter((item) => item && typeof item === "object")
    : [];
  return {
    ...world,
    reality_contract: {
      mode: supplied.mode === "strict_realism" ? "strict_realism" : "realistic_with_explicit_magic",
      base_rules: BASE_PHYSICAL_RULES,
      fantasy_exceptions: exceptions,
    },
  };
}

export function buildFacingPageSceneContract({ pairedText = "", imagePrompt = "", realityContract = {} } = {}) {
  const prose = String(pairedText || "").trim();
  const plannedImage = String(imagePrompt || "").trim();
  const fantasyExceptions = Array.isArray(realityContract?.fantasy_exceptions)
    ? realityContract.fantasy_exceptions
    : [];
  const grounding = prose ? [
    "AUTHORITATIVE FACING-PAGE PROSE (depict this exact story moment, not a generic nearby moment):",
    prose,
    "TEXT-TO-IMAGE GROUNDING RULES:",
    "- Show every central visible action, handled object and spatial relationship stated in the prose. If one character shows, gives, holds or points to an object, that object and gesture must be clearly visible.",
    "- Choose one readable snapshot from this exact moment. Do not illustrate an action that happens earlier or later.",
    "- Match the prose's emotional intensity and physical scale exactly. Do not amplify a gentle obstacle into danger.",
    "- The planned image prompt may add composition and lighting, but it cannot contradict or replace the facing-page prose.",
  ] : [];
  return [
    ...grounding,
    "PHYSICAL REALITY AND CHILD SAFETY:",
    ...BASE_PHYSICAL_RULES.map((rule) => `- ${rule}`),
    fantasyExceptions.length ? "ALLOWED FANTASY EXCEPTIONS (use only when already explicit in the prose and keep the visible mechanism unchanged):" : "",
    ...fantasyExceptions.map((item) => (
      `- ${item.overridden_law || "named physical rule"}: ${item.visible_mechanism || "visible mechanism required"}; visual lock: ${item.visual_lock || "keep it visually stable"}; introduced in scene ${item.introduced_scene_number || "before first use"}.`
    )),
    plannedImage ? `PLANNED VISUAL DETAILS${prose ? " (secondary to the prose)" : ""}: ${plannedImage}` : "",
  ].filter(Boolean).join("\n");
}

export { BASE_PHYSICAL_RULES };

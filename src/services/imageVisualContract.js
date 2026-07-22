function normalizedKey(value) {
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

function list(value, maximum = 30) {
  return Array.isArray(value) ? value.filter(Boolean).slice(0, maximum) : [];
}

function characterDescriptor(character = {}) {
  return [
    character.role,
    character.story_role,
    character.relationship,
    character.canon_short,
    character.character_fingerprint,
    character.description,
  ].filter(Boolean).join(" ");
}

function visualRole(character = {}, index = 0, heroName = "") {
  const role = normalizedKey(character.role);
  const descriptor = normalizedKey(characterDescriptor(character));
  if (normalizedKey(character.name) === normalizedKey(heroName) || role === "child") return "hero child";
  if (/(plush|peluche|teddy|ours en peluche|stuffed bear)/u.test(descriptor)) {
    return `original unbranded plush-bear companion ${index + 1}`;
  }
  if (role === "mascot" || /(animal|chien|dog|chat|cat|fox|renard|ours|bear|mascotte)/u.test(descriptor)) {
    return `original unbranded animal companion ${index + 1}`;
  }
  if (/(family|famille|frere|soeur|brother|sister|parent|mother|father|maman|papa)/u.test(`${role} ${descriptor}`)) {
    return `family member ${index + 1}`;
  }
  return `recurring story companion ${index + 1}`;
}

export function buildImageCharacterAliases({ blueprint = {}, characterCanons = [], castPresent = [] } = {}) {
  const heroName = blueprint?.hero?.name || "";
  const characters = [blueprint?.hero, ...list(blueprint?.cast), ...list(characterCanons)]
    .filter((character) => character?.name);
  const byName = new Map();
  for (const character of characters) {
    const key = normalizedKey(character.name);
    if (!key) continue;
    byName.set(key, { ...(byName.get(key) || {}), ...character });
  }
  for (const name of list(castPresent)) {
    const key = normalizedKey(name);
    if (key && !byName.has(key)) byName.set(key, { name });
  }
  return [...byName.values()].map((character, index) => ({
    name: String(character.name),
    alias: visualRole(character, index, heroName),
  }));
}

export function aliasesFromSceneContract(contract = {}) {
  const names = [
    contract?.main_action?.subject,
    ...list(contract?.named_characters).map((character) => character?.name),
    contract?.main_action?.target,
  ].filter(Boolean);
  const seen = new Set();
  return names.filter((name) => {
    const key = normalizedKey(name);
    if (!key || seen.has(key) || /^new_friend_|^generic_/iu.test(String(name))) return false;
    seen.add(key);
    return true;
  }).map((name, index) => ({
    name: String(name),
    alias: index === 0 ? "hero child" : `recurring story companion ${index}`,
  }));
}

export function sanitizeBrandSensitiveText(value) {
  return String(value || "")
    .replace(
      /(?:\bbrand(?:ed)?\s+(?:name|character|logo)|\bcommercial\s+(?:brand|character|logo)|\bcopyrighted\s+character|\blogos?|\binscriptions?|\bprinted\s+(?:words?|text|labels?)|\bwording|[àa]\s+l['’]effigie\s+de|\beffigy\s+of|\bmarca(?:\s+comercial)?|\blogotipo|\binscripci[oó]n|\bpersonaje\s+comercial)[^,.;\n|]*/giu,
      "plain generic unbranded detail",
    )
    .replace(
      /\b(?:type|façon|facon|mod[eè]le|marque|brand)\s+[\p{L}\p{N}&'’.-]+/giu,
      "generic unbranded design",
    );
}

export function neutralizeImageText(value, aliases = []) {
  let result = String(value || "");
  const ordered = list(aliases, 50)
    .filter((item) => item?.name && item?.alias)
    .sort((left, right) => String(right.name).length - String(left.name).length);
  for (const item of ordered) {
    result = result.replace(new RegExp(`\\b${escapeRegExp(item.name)}\\b`, "giu"), item.alias);
  }
  return sanitizeBrandSensitiveText(result);
}

export function compactImageSceneContract(contract = {}, aliases = [], { safetyFallback = false } = {}) {
  const safe = (value) => neutralizeImageText(value, aliases).replace(/\s+/g, " ").trim();
  const namedCharacters = list(contract.named_characters, 10).map((item) => ({
    name: safe(item.name),
    visual_role: safe(item.visual_role || "visible"),
    action: safe(item.action || "present in the scene"),
  }));
  const genericCharacters = list(contract.generic_characters, 12).map((item) => ({
    id: safe(item.id),
    description: safe(item.description),
    action: safe(item.action),
    must_not_resemble: list(item.must_not_resemble, 10).map(safe),
  }));
  const requiredElements = list(contract.required_elements, 15).map((item) => ({
    description: safe(item.description),
    quantity: safe(item.quantity),
    scale: safe(item.scale),
  }));
  const objectStates = list(contract.object_states, 20)
    .filter((item) => !safetyFallback || normalizedKey(item.state) !== "absent")
    .map((item) => ({
      name: safe(item.name),
      owner: safe(item.owner),
      state: safe(item.state),
      quantity: Number(item.quantity || 1),
      instruction: safe(item.instruction),
    }));
  return {
    main_action: {
      subject: safe(contract?.main_action?.subject),
      verb: safe(contract?.main_action?.verb),
      target: safe(contract?.main_action?.target),
    },
    named_characters: namedCharacters,
    generic_characters: genericCharacters,
    required_elements: requiredElements,
    object_states: objectStates,
    spatial_relationships: safetyFallback ? [] : list(contract.spatial_relationships, 12).map(safe),
    forbidden_elements: safetyFallback ? [] : list(contract.forbidden_elements, 12).map(safe),
  };
}

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

const ANIMAL_SPECIES = [
  ["dog", /\b(dog|chien|chienne|chiot|puppy|perro|perrito)\b/u],
  ["cat", /\b(cat|chat|chaton|kitten|gato|gatito)\b/u],
  ["fox", /\b(fox|renard|zorro)\b/u],
  ["bear", /\b(bear|ours|oso)\b/u],
  ["rabbit", /\b(rabbit|bunny|lapin|conejo)\b/u],
  ["bird", /\b(bird|oiseau|pajaro|ave)\b/u],
  ["turtle", /\b(turtle|tortue|tortuga)\b/u],
  ["dinosaur", /\b(dinosaur|dinosaure|dinosaurio)\b/u],
  ["lion", /\b(lion|leon)\b/u],
  ["tiger", /\b(tiger|tigre)\b/u],
  ["horse", /\b(horse|cheval|caballo)\b/u],
  ["unicorn", /\b(unicorn|licorne|unicornio)\b/u],
  ["wolf", /\b(wolf|loup|lobo)\b/u],
  ["otter", /\b(otter|loutre|nutria)\b/u],
  ["panda", /\bpanda\b/u],
  ["dragon", /\bdragon\b/u],
  ["monkey", /\b(monkey|singe|mono)\b/u],
  ["elephant", /\b(elephant|elefante)\b/u],
  ["mouse", /\b(mouse|souris|raton)\b/u],
  ["fish", /\b(fish|poisson|pez)\b/u],
];

function detectedAnimalSpecies(descriptor = "") {
  return ANIMAL_SPECIES.find(([, pattern]) => pattern.test(descriptor))?.[0] || "";
}

function visualIdentity(character = {}, index = 0, heroName = "") {
  const role = normalizedKey(character.role);
  const descriptor = normalizedKey(characterDescriptor(character));
  if (normalizedKey(character.name) === normalizedKey(heroName) || role === "child") {
    return { alias: "hero child", entity_type: "human", species: "" };
  }
  // Explicit creator-supplied human roles and family relationships are
  // authoritative. Incidental animal words in a shirt, hobby or scene
  // description must never turn a sibling or friend into an animal.
  if (role === "family" || /(family|famille|frere|soeur|brother|sister|sibling|parent|mother|father|maman|papa|hermano|hermana|madre|padre)/u.test(descriptor)) {
    return { alias: `family member ${index + 1}`, entity_type: "human", species: "" };
  }
  if (role === "friend") {
    return { alias: `human friend ${index + 1}`, entity_type: "human", species: "" };
  }
  if (/(plush|peluche|teddy|ours en peluche|stuffed bear)/u.test(descriptor)) {
    return {
      alias: `original unbranded non-human plush bear toy companion ${index + 1}`,
      entity_type: "plush_toy",
      species: "bear",
    };
  }
  const species = detectedAnimalSpecies(descriptor);
  if (role === "mascot" || /(animal|chien|dog|chat|cat|fox|renard|ours|bear|mascotte)/u.test(descriptor)) {
    return {
      alias: `original unbranded non-human ${species ? `${species} ` : ""}animal companion ${index + 1}`,
      entity_type: "animal",
      species,
    };
  }
  return { alias: `recurring story companion ${index + 1}`, entity_type: "", species: "" };
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
    ...visualIdentity(character, index, heroName),
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
  const namedCharacters = list(contract.named_characters, 10).map((item) => {
    const identity = aliases.find((alias) => normalizedKey(alias?.name) === normalizedKey(item?.name));
    return {
      name: safe(item.name),
      entity_type: safe(identity?.entity_type || item.entity_type),
      species: safe(identity?.species || item.species),
      visual_role: safe(item.visual_role || "visible"),
      action: safe(item.action || "present in the scene"),
    };
  });
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
    causal_frame: contract?.causal_frame ? {
      before_location: safe(contract.causal_frame?.before?.location),
      approved_action: safe(contract.causal_frame?.during?.action),
      transition_kind: safe(contract.causal_frame?.during?.transition_kind),
      transition_mechanism: safe(contract.causal_frame?.during?.transition_mechanism),
      after_location: safe(contract.causal_frame?.after?.location),
      visible_phase: safe(contract.causal_frame?.visible_phase),
      visible_location: safe(contract.causal_frame?.visible_location),
    } : null,
    render_snapshot: contract?.render_snapshot ? {
      version: Number(contract.render_snapshot?.version || 1),
      visible_phase: safe(contract.render_snapshot?.visible_phase),
      location: safe(contract.render_snapshot?.location),
      physical_medium: safe(contract.render_snapshot?.physical_medium),
      camera_environment: contract.render_snapshot?.camera_environment ? {
        camera_side: safe(contract.render_snapshot.camera_environment?.camera_side),
        ambient_medium: safe(contract.render_snapshot.camera_environment?.ambient_medium),
        other_side_medium: safe(contract.render_snapshot.camera_environment?.other_side_medium),
        entry_passage_id: safe(contract.render_snapshot.camera_environment?.entry_passage_id),
        boundary_crossing: contract.render_snapshot.camera_environment?.boundary_crossing === true,
        boundary_rule: safe(contract.render_snapshot.camera_environment?.boundary_rule),
      } : null,
      main_action: {
        subject: safe(contract.render_snapshot?.main_action?.subject),
        verb: safe(contract.render_snapshot?.main_action?.verb),
        target: safe(contract.render_snapshot?.main_action?.target),
      },
      equipment: list(contract.render_snapshot?.equipment, 20).map((item) => ({
        name: safe(item?.name), owner: safe(item?.owner), state: safe(item?.state), quantity: Number(item?.quantity ?? 1),
      })),
      fixed_entities: list(contract.render_snapshot?.fixed_entities, 20).map((item) => ({
        id: safe(item?.id),
        name: safe(item?.name),
        home_location: safe(item?.home_location),
        home_side: safe(item?.home_side),
        camera_location: safe(item?.camera_location),
        camera_side: safe(item?.camera_side),
        status: safe(item?.status),
        camera_quantity: Math.max(0, Number(item?.camera_quantity || 0)),
        other_side_quantity_limit: Math.max(0, Number(item?.other_side_quantity_limit || 0)),
        global_quantity_limit: Math.max(1, Number(item?.global_quantity_limit || 1)),
        adjacent_visibility: list(item?.adjacent_visibility, 3).map((entry) => ({
          scene_number: Math.max(0, Number(entry?.scene_number || 0)),
          location: safe(entry?.location),
          camera_side: safe(entry?.camera_side),
          status: safe(entry?.status),
        })),
        rule: safe(item?.rule),
      })),
      visible_object_states: list(contract.render_snapshot?.visible_object_states, 30).map((item) => ({
        name: safe(item?.name), owner: safe(item?.owner), state: safe(item?.state), quantity: Number(item?.quantity ?? 1),
      })),
      forbidden: list(contract.render_snapshot?.forbidden, 30).map(safe),
    } : null,
    spatial_relationships: safetyFallback ? [] : list(contract.spatial_relationships, 12).map(safe),
    forbidden_elements: safetyFallback ? [] : list(contract.forbidden_elements, 12).map(safe),
  };
}

function key(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function names(character = {}) {
  return [character.name, character.canonicalName, character.displayName,
    ...(Array.isArray(character.aliases) ? character.aliases : [])].map(key).filter(Boolean);
}

function id(character = {}) {
  return character.character_id || character.characterId || character.id || "";
}

// Identity joins are exact after normalization. A substring such as Ann/Anna
// must never transfer another person's wardrobe or private photo.
export function findSceneCharacter(character, candidates = []) {
  const characterId = id(character);
  const byId = characterId ? candidates.filter((entry) => id(entry) === characterId) : [];
  const expectedNames = names(character);
  const matches = byId.length ? byId : candidates.filter((entry) => (
    (!id(entry) || !characterId || id(entry) === characterId)
    && names(entry).some((name) => expectedNames.includes(name))
  ));
  if (matches.length > 1) {
    const error = new Error("A canonical scene character has ambiguous visual identity sources.");
    error.code = "scene_render_character_binding_ambiguous";
    error.characterId = characterId;
    throw error;
  }
  return matches[0];
}

export function bindSceneCharacters({ blueprint, characterCanons, sceneContract }) {
  const registry = sceneContract.character_registry || [];
  const hero = { ...(blueprint.hero || {}), role: "child" };
  const blueprintCast = [hero, ...(blueprint.cast || [])].filter((entry) => entry.name);
  return (sceneContract.visible_character_ids || []).map((characterId) => {
    const canonical = registry.find((entry) => entry.character_id === characterId);
    let character = canonical && findSceneCharacter(canonical, blueprintCast);
    let photoCanon = canonical && findSceneCharacter(canonical, characterCanons);
    if (!character && photoCanon) character = findSceneCharacter(photoCanon, blueprintCast);
    if (!photoCanon && character) photoCanon = findSceneCharacter(character, characterCanons);
    // The hero role is a unique, durable identity even when a legacy blueprint
    // used a nickname. Never use a role-only fallback for another participant.
    if (canonical && characterId === "character_hero") {
      character ||= hero.name ? hero : null;
      photoCanon ||= findSceneCharacter({ name: "", character_id: characterId }, characterCanons)
        || (characterCanons.filter((entry) => entry.role === "child").length === 1
          ? characterCanons.find((entry) => entry.role === "child") : null);
    }
    const source = character || photoCanon;
    if (!canonical || !source) {
      const error = new Error("A visible canonical character has no visual identity binding.");
      error.code = "scene_render_visible_character_unbound";
      error.characterId = characterId;
      error.pageNumber = sceneContract.image_page_number;
      throw error;
    }
    return {
      ...source,
      character_id: characterId,
      name: canonical.name,
      sourceName: source.name,
      photoCanon,
    };
  });
}

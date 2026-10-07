import assert from "node:assert/strict";
import test from "node:test";
import { bindSceneCharacters, findSceneCharacter } from "../src/services/sceneCharacterBindings.js";

function fixture(cast = [], overrides = {}) {
  return {
    blueprint: {
      hero: { name: "Éloïse", outfit_lock: "blue shirt and jeans" },
      cast,
    },
    characterCanons: [{ name: "Éloïse", role: "child", photoId: "synthetic-hero.jpg", outfit_lock: "blue shirt and jeans" }],
    sceneContract: {
      character_registry: [{ character_id: "character_hero", name: "Éloïse" }],
      visible_character_ids: ["character_hero"],
      image_page_number: 3,
    },
    ...overrides,
  };
}

test("blueprint hero projections resolve once without changing the saved blueprint or private canon", () => {
  for (const projection of [
    { name: "Éloïse", role: "child", story_role: "hero" },
    { name: "ELOISE", role: "child" },
    { name: "Eloise", story_role: "hero" },
    { name: "Loulou", aliases: ["Eloise"], story_role: "hero" },
    { name: "Loulou", character_id: "character_hero" },
  ]) {
    const input = fixture([{ ...projection, outfit_lock: "adventure suit" }]);
    const before = structuredClone(input);
    const selected = bindSceneCharacters(input);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].character_id, "character_hero");
    assert.equal(selected[0].outfit_lock, "blue shirt and jeans");
    assert.equal(selected[0].photoCanon.photoId, "synthetic-hero.jpg");
    assert.deepEqual(input, before);
  }
});

test("repeated narrative hero projections are order-independent and never multiply photo references", () => {
  const projections = [
    { name: "Eloise", role: "child" },
    { name: "ÉLOÏSE", story_role: "hero" },
  ];
  assert.deepEqual(bindSceneCharacters(fixture(projections)), bindSceneCharacters(fixture([...projections].reverse())));
  assert.equal(bindSceneCharacters(fixture(projections)).length, 1);
});

test("shared names without positive hero evidence remain ambiguous", () => {
  for (const projection of [
    { name: "Éloïse" },
    { name: "Éloïse", role: "family" },
    { name: "Éloïse", role: "child", story_role: "companion" },
    { name: "Éloïse", role: "child", photoId: "another-child.jpg" },
    { name: "Éloïse", story_role: "hero", storageKey: "another-private-source" },
    { name: "Éloïse", story_role: "hero", profileRef: "another-profile" },
  ]) {
    assert.throws(() => bindSceneCharacters(fixture([projection])), (error) => (
      error.code === "scene_render_character_binding_ambiguous"
      && error.pageNumber === 3
      && error.issues[0].path === "/blueprint/characters"
    ));
  }
});

test("a distinct canonical companion with the hero's name is not collapsed", () => {
  const input = fixture([{ name: "Éloïse", character_id: "character_companion", role: "child" }]);
  input.sceneContract.character_registry.push({ name: "Éloïse", character_id: "character_companion" });
  input.sceneContract.visible_character_ids.push("character_companion");
  input.characterCanons = [
    { name: "Éloïse", character_id: "character_hero", photoId: "hero.jpg" },
    { name: "Éloïse", character_id: "character_companion", photoId: "companion.jpg" },
  ];
  assert.deepEqual(bindSceneCharacters(input).map((entry) => entry.photoCanon.photoId), ["hero.jpg", "companion.jpg"]);
});

test("two canonical people sharing a name require explicit ids rather than role-only coalescing", () => {
  const input = fixture([{ name: "Éloïse", role: "child" }]);
  input.sceneContract.character_registry.push({ name: "Éloïse", character_id: "character_companion" });
  assert.throws(() => bindSceneCharacters(input), { code: "scene_render_character_binding_ambiguous" });
});

test("hero narrative deduplication never coalesces ambiguous private photo sources", () => {
  const input = fixture([{ name: "Éloïse", role: "child", story_role: "hero" }]);
  input.characterCanons.push({ name: "ELOISE", role: "child", photoId: "synthetic-other.jpg" });
  assert.throws(() => bindSceneCharacters(input), (error) => {
    assert.equal(error.code, "scene_render_character_binding_ambiguous");
    assert.equal(error.characterId, "character_hero");
    assert.equal(error.pageNumber, 3);
    assert.equal(error.issues[0].path, "/characterCanons");
    assert.doesNotMatch(JSON.stringify(error.issues), /Eloise|Éloïse|synthetic|\.jpg/iu);
    return true;
  });
});

test("conflicting private sources with the same canonical id still fail closed", () => {
  assert.throws(() => findSceneCharacter({ character_id: "character_hero" }, [
    { character_id: "character_hero", photoId: "one.jpg" },
    { character_id: "character_hero", photoId: "two.jpg" },
  ]), { code: "scene_render_character_binding_ambiguous" });
});

test("a similarly named supporting child is not treated as a hero projection", () => {
  const input = fixture([{ name: "Eloisette", role: "child", outfit_lock: "red shirt" }]);
  input.sceneContract.character_registry.push({ name: "Eloisette", character_id: "character_friend" });
  input.sceneContract.visible_character_ids.push("character_friend");
  input.characterCanons.push({ name: "Eloisette", photoId: "friend.jpg" });
  assert.deepEqual(bindSceneCharacters(input).map((entry) => entry.name), ["Éloïse", "Eloisette"]);
});

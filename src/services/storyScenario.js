import crypto from "node:crypto";
import { enrichFamilyAddress } from "./characterRelationships.js";
import {
  CHARACTER_MOVEMENT_LEDGER_VERSION,
  normalizeCharacterMovements,
  stabilizeSceneCharacterMovements,
  validateCharacterMovementLedger,
} from "./characterMovementLedger.js";
import { findUniverse } from "../config/bookOptions.js";
import { validateStoryCastParticipation } from "./storyCastParticipation.js";
import {
  applyCausalGraph,
  normalizeCausalGraph,
  projectCausalGraphObjectLedger,
  validateCausalGraph,
} from "./storyCausalGraph.js";

export const STORY_SCENARIO_VERSION = 2;
export const STORY_SCENARIO_VALIDATION_VERSION = 2;
export const STORY_SCENARIO_AUDIT_EVIDENCE_VERSION = 1;
const PRESENCE_MODES = new Set(["physical", "thought", "memory", "voice"]);
const PRESENCE_PHASES = new Set(["start", "throughout", "end"]);
const TRANSITION_KINDS = new Set(["none", "discover_passage", "cross_passage", "ordinary_travel", "return_travel", "join_travel"]);
const OBJECT_STATES = new Set([
  "worn", "held", "carried", "stored", "visible", "absent", "left_behind",
  "planted", "installed", "consumed", "transformed", "destroyed", "used_up",
]);
const OBJECT_LIFECYCLE_KINDS = new Set(["persistent", "discoverable", "transformable", "consumable"]);
const OBJECT_SPATIAL_MODES = new Set(["portable", "location_bound"]);
const OBJECT_EVENT_TYPES = new Set([
  "introduce", "acquire", "plant", "install", "consume", "transform", "destroy",
  "retrieve", "store", "transfer", "use",
]);

function stableJsonValue(value) {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableJsonValue(entry)]),
  );
}

function auditableStoryScenario(input = {}) {
  const scenario = structuredClone(input);
  for (const key of [
    "auditEvidence",
    "approvedAt",
    "createdAt",
    "fingerprint",
    "revision",
    "status",
    "validation",
  ]) delete scenario[key];
  return scenario;
}

export function storyScenarioAuditDigest(input = {}) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stableJsonValue(auditableStoryScenario(input))))
    .digest("hex");
}

export function withStoryScenarioAuditEvidence(input = {}, {
  auditedAt = new Date().toISOString(),
} = {}) {
  const scenario = structuredClone(input);
  scenario.auditEvidence = {
    version: STORY_SCENARIO_AUDIT_EVIDENCE_VERSION,
    status: "approved",
    digest: storyScenarioAuditDigest(scenario),
    auditedAt,
  };
  return scenario;
}

export function hasCurrentStoryScenarioAuditEvidence(input = {}) {
  const evidence = input?.auditEvidence;
  return Number(evidence?.version) === STORY_SCENARIO_AUDIT_EVIDENCE_VERSION
    && evidence?.status === "approved"
    && typeof evidence?.digest === "string"
    && evidence.digest === storyScenarioAuditDigest(input);
}
const OBJECT_TERMINAL_STATES = new Set(["consumed", "transformed", "destroyed", "used_up"]);
const OBJECT_POSSESSION_STATES = new Set(["worn", "held", "carried"]);
const DISCOVERY_EVENT_PATTERN = /\b(?:trouve|trouvent|trouver|decouvre|decouvrent|decouvrir|recoit|recoivent|ramasse|obtient|finds?|found|discover(?:s|ed)?|receives?|picks? up|encuentra|encuentran|descubre|descubren|recibe|recogen?)\b/iu;
const PLANT_EVENT_PATTERN = /\b(?:plante|plantent|planter|seme|sement|semer|enterre|enterrent|plants|planted|sows?|sowed|buries|buried|planta|plantan|plantar|siembra|siembran|entierra|entierran)\b/iu;
const CONSUME_EVENT_PATTERN = /\b(?:mange|mangent|boit|boivent|consomme|consomment|eat(?:s|en)?|drink(?:s|ing)?|consume(?:s|d)?|se come|come (?:el|la|un|una)|comen|bebe|beben|consume|consumen)\b/iu;
const DESTROY_EVENT_PATTERN = /\b(?:detruit|detruisent|brise|brisent|dechire|dechirent|destroy(?:s|ed)?|breaks?|broke|tears?|tore|destruye|destruyen|rompe|rompen|rasga|rasgan)\b/iu;
const TRANSFORM_EVENT_PATTERN = /\b(?:devient|deviennent|se transforme|se transforment|becomes?|turns? into|transforms?|se convierte|se convierten|se transforma|se transforman)\b/iu;
const RESULT_EMERGENCE_PATTERN = /\b(?:eclot|eclosent|pousse|grandit|fleurit|hatches?|sprouts?|grows?|blooms?|brota|brotan|crece|crecen|florece|florecen)\b/iu;

function text(value) {
  return String(value || "").trim();
}

function key(value) {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function objectDefinitionKey(value = {}) {
  return `${key(value?.name)}::${key(value?.owner)}`;
}

function objectRegistryKey(value = {}) {
  const explicitId = text(value?.objectId || value?.object_id || value?.entityId || value?.entity_id);
  return explicitId ? `id:${key(explicitId)}` : `definition:${objectDefinitionKey(value)}`;
}

function objectInstanceKey(value = {}, declaredObjects = []) {
  const explicitId = text(value?.objectId || value?.object_id);
  if (explicitId) return key(explicitId);
  const copies = list(declaredObjects, 30).filter((object) => key(object?.name) === key(value?.name));
  return copies.length > 1 ? objectDefinitionKey(value) : key(value?.name);
}

function list(value, maximum = 50) {
  return (Array.isArray(value) ? value : []).filter(Boolean).slice(0, maximum);
}

function normalizedLifecycleEvent(item = {}) {
  const sceneNumber = Number(item?.scene_number || item?.sceneNumber);
  const type = text(item?.type || item?.event);
  const state = text(item?.state || item?.to_state || item?.toState);
  if (!Number.isInteger(sceneNumber) || sceneNumber < 1 || !OBJECT_EVENT_TYPES.has(type) || !OBJECT_STATES.has(state)) return null;
  return {
    sceneNumber,
    type,
    state,
    resultingObject: text(item?.resulting_object || item?.resultingObject),
    resultingState: OBJECT_STATES.has(item?.resulting_state || item?.resultingState)
      ? text(item?.resulting_state || item?.resultingState)
      : "visible",
  };
}

function normalizedObjectLifecycle(item = {}) {
  const raw = item?.lifecycle && typeof item.lifecycle === "object" ? item.lifecycle : {};
  const kind = text(raw?.kind || item?.lifecycle_kind || item?.lifecycleKind);
  const events = list(raw?.events || item?.lifecycle_events || item?.lifecycleEvents, 20)
    .map(normalizedLifecycleEvent)
    .filter(Boolean)
    .sort((left, right) => left.sceneNumber - right.sceneNumber);
  if (!OBJECT_LIFECYCLE_KINDS.has(kind) && !events.length) return null;
  return {
    version: 1,
    kind: OBJECT_LIFECYCLE_KINDS.has(kind) ? kind : "persistent",
    events,
  };
}

function canonicalName(value, characters) {
  const requested = key(value);
  return characters.find((character) => key(character.name) === requested)?.name || "";
}

function sceneId(sceneNumber) {
  return `scene-${Number(sceneNumber)}`;
}

function passageId(value, fallback = "") {
  return key(value || fallback).replaceAll(" ", "_");
}

function normalizeSymbol(item = {}, { primary = false } = {}) {
  const name = text(item?.name);
  if (!name) return null;
  return primary ? {
    name,
    initialMeaning: text(item?.initial_meaning || item?.initialMeaning),
    evolvedMeaning: text(item?.evolved_meaning || item?.evolvedMeaning),
  } : {
    name,
    purpose: text(item?.purpose),
  };
}

export function scenarioCharacterRegistry(normalized = {}) {
  const answers = normalized.answers || {};
  const photos = normalized.photos || [];
  const registry = [{
    name: answers.hero_name,
    role: "child",
    storyRole: "hero",
    relationship: "hero",
    outfitPreference: photos.find((photo) => photo.role === "child")?.outfit_preference || "auto_universe",
    outfitId: photos.find((photo) => photo.role === "child")?.outfit_id || "",
    outfitContract: photos.find((photo) => photo.role === "child")?.outfit_contract || "",
    source: "creator_cast",
  }, ...photos.filter((photo) => photo.role !== "child").map((photo) => ({
    name: photo.name,
    role: photo.role,
    storyRole: photo.story_role,
    relationship: photo.relationship,
    outfitPreference: photo.outfit_preference,
    outfitId: photo.outfit_id,
    outfitContract: photo.outfit_contract,
    source: "creator_cast",
  }))].filter((character) => character.name);
  return registry.filter((character, index, all) => all.findIndex((candidate) => key(candidate.name) === key(character.name)) === index);
}

export function normalizeStoryScenario(candidate = {}, {
  pagePlan = [],
  canonicalCharacters = [],
  creatorClarifications = {},
  worldContract = {},
  language = "FR",
  requireCausalGraph = false,
  castParticipationContract = null,
} = {}) {
  const raw = candidate?.scenario || candidate;
  const expectedScenes = pagePlan.filter((page) => page.page_type === "image");
  const rawScenes = list(raw?.scenes, 30);
  const answeredIds = new Set(Object.keys(creatorClarifications || {}).filter((id) => text(creatorClarifications[id])));
  const clarifications = list(raw?.clarifications, 5).map((item, index) => ({
    id: text(item?.id || `clarification_${index + 1}`).replace(/[^a-z0-9_-]/gi, "_").toLowerCase(),
    question: text(item?.question),
    reason: text(item?.reason),
    suggestedAnswer: text(item?.suggested_answer || item?.suggestedAnswer),
  })).filter((item) => item.question && !answeredIds.has(item.id)).slice(0, 3);
  const suppliedCharacters = list(raw?.characters, 20);
  const scenarioCharacters = [...canonicalCharacters, ...suppliedCharacters.map((item) => ({
    name: text(item?.name), role: text(item?.role || "story_character"), storyRole: text(item?.story_role || "guest"), relationship: text(item?.relationship),
  }))].filter((character, index, all) => character.name && all.findIndex((candidateCharacter) => key(candidateCharacter.name) === key(character.name)) === index);
  const characters = scenarioCharacters.map((canonical) => {
    const supplied = list(raw?.characters, 12).find((item) => key(item?.name) === key(canonical.name)) || {};
    const presenceMode = PRESENCE_MODES.has(supplied.default_presence_mode) ? supplied.default_presence_mode : "physical";
    return enrichFamilyAddress({
      name: canonical.name,
      role: canonical.role || "other",
      storyRole: canonical.storyRole || canonical.story_role || "guest",
      relationship: canonical.relationship || supplied.relationship || "",
      initialLocation: text(supplied.initial_location),
      defaultPresenceMode: presenceMode,
      source: canonical.source || supplied.source || "story_generated",
    }, language);
  });
  const objects = list(raw?.objects, 20).map((item) => {
    const lifecycle = normalizedObjectLifecycle(item);
    const explicitObjectId = passageId(item?.entity_id || item?.entityId || item?.object_id || item?.objectId);
    const spatialMode = OBJECT_SPATIAL_MODES.has(item?.spatial_mode || item?.spatialMode)
      ? (item.spatial_mode || item.spatialMode)
      : "portable";
    return {
      ...(explicitObjectId ? { objectId: explicitObjectId } : {}),
      name: text(item?.name),
      owner: canonicalName(item?.owner, scenarioCharacters) || text(item?.owner),
      initialState: OBJECT_STATES.has(item?.initial_state) ? item.initial_state : "visible",
      trackEveryScene: item?.track_every_scene === true,
      spatialMode,
      homeLocation: spatialMode === "location_bound"
        ? text(item?.home_location || item?.homeLocation)
        : "",
      progressTotal: Math.max(0, Math.min(20, Number(item?.progress_total || item?.progressTotal || 0))),
      ...(lifecycle ? { lifecycle } : {}),
    };
  }).filter((item, index, all) => (
    item.name
    && all.findIndex((candidate) => objectRegistryKey(candidate) === objectRegistryKey(item)) === index
  ));
  const rawNarrativeContract = raw?.narrative_contract || raw?.narrativeContract || {};
  const narrativeContract = Number(rawNarrativeContract?.version) === 1 ? {
    version: 1,
    privacyMode: "implicit_personal_depth",
    moralDelivery: "action_before_words",
    primarySymbol: normalizeSymbol(rawNarrativeContract?.primary_symbol || rawNarrativeContract?.primarySymbol, { primary: true }),
    secondarySymbols: list(rawNarrativeContract?.secondary_symbols || rawNarrativeContract?.secondarySymbols, 10)
      .map((item) => normalizeSymbol(item))
      .filter(Boolean),
  } : null;
  const scenes = expectedScenes.map((expected, index) => {
    const supplied = rawScenes.find((item) => Number(item?.scene_number) === Number(expected.scene_number)) || rawScenes[index] || {};
    const transitionKind = TRANSITION_KINDS.has(supplied?.transition?.kind) ? supplied.transition.kind : "none";
    const locationBefore = text(supplied?.location_before);
    const locationAfter = text(supplied?.location_after || supplied?.location_before);
    const characterPresences = list(supplied?.character_presences, 15).map((presence) => {
      const name = canonicalName(presence?.name, scenarioCharacters);
      const mode = PRESENCE_MODES.has(presence?.mode) ? presence.mode : "physical";
      const phase = PRESENCE_PHASES.has(presence?.phase) ? presence.phase : "end";
      const location = phase === "start" ? locationBefore : locationAfter;
      return name ? {
        name,
        mode,
        phase: mode === "physical" ? phase : "",
        location: mode === "physical" ? location : "",
        action: text(presence?.action),
      } : null;
    }).filter(Boolean);
    return {
      id: sceneId(expected.scene_number),
      sceneNumber: Number(expected.scene_number),
      storyRole: expected.story_role,
      act: Math.max(1, Math.min(3, Number(supplied?.act || (index < expectedScenes.length / 3 ? 1 : index < expectedScenes.length * 2 / 3 ? 2 : 3)))),
      title: text(supplied?.title),
      locationBefore,
      locationAfter,
      action: text(supplied?.action),
      purpose: text(supplied?.purpose),
      narrativeFunction: text(supplied?.narrative_function || supplied?.narrativeFunction),
      dominantEmotion: text(supplied?.dominant_emotion || supplied?.dominantEmotion),
      emotionalShift: text(supplied?.emotional_shift || supplied?.emotionalShift),
      storyChange: text(supplied?.story_change || supplied?.storyChange),
      symbolUse: list(supplied?.symbol_use || supplied?.symbolUse, 3).map((item) => ({
        name: text(item?.name),
        role: text(item?.role),
      })).filter((item) => item.name),
      prerequisiteSceneIds: [...new Set(list(supplied?.prerequisite_scene_ids, 10).map(text).filter(Boolean))],
      characterPresences,
      transition: {
        kind: transitionKind,
        mechanism: text(supplied?.transition?.mechanism),
        mechanismId: passageId(supplied?.transition?.mechanism_id || supplied?.transition?.mechanismId, supplied?.transition?.mechanism),
        from: text(supplied?.transition?.from || locationBefore),
        to: text(supplied?.transition?.to || locationAfter),
        characters: [...new Set(list(supplied?.transition?.characters, 12).map((name) => canonicalName(name, scenarioCharacters)).filter(Boolean))],
      },
      characterMovements: normalizeCharacterMovements(
        supplied?.character_movements || supplied?.characterMovements,
        {
          characters: scenarioCharacters,
          focalBefore: locationBefore,
          focalAfter: locationAfter,
        },
      ),
      objectStates: list(supplied?.object_states, 20).map((item) => {
        const name = text(item?.name);
        const declaredCopies = objects.filter((object) => key(object.name) === key(name));
        const suppliedOwner = canonicalName(item?.owner, scenarioCharacters) || text(item?.owner);
        const owner = suppliedOwner || (declaredCopies.length === 1 ? declaredCopies[0].owner : "");
        return {
          ...(declaredCopies.length === 1 && declaredCopies[0].objectId
            ? { objectId: declaredCopies[0].objectId }
            : {}),
          name,
          owner,
          state: OBJECT_STATES.has(item?.state) ? item.state : "visible",
          quantity: Math.max(1, Number(item?.quantity || 1)),
          instruction: text(item?.instruction),
        };
      }).filter((item) => item.name),
      continuityToNext: text(supplied?.continuity_to_next),
    };
  });
  const suppliedWardrobe = list(raw?.wardrobe_plan || raw?.wardrobePlan, 20);
  const wardrobePlan = scenarioCharacters
    .filter((character) => text(character?.outfitContract || character?.outfit_contract))
    .map((character) => {
      const supplied = suppliedWardrobe.find((item) => key(item?.character_name || item?.characterName) === key(character.name)) || {};
      const preference = text(character.outfitPreference || character.outfit_preference || "auto_universe");
      const visibleScenes = scenes.filter((scene) => scene.characterPresences.some((presence) => presence.mode === "physical" && key(presence.name) === key(character.name)));
      const crossing = visibleScenes.find((scene) => (
        scene.transition.kind === "cross_passage"
        && scene.transition.characters.some((name) => key(name) === key(character.name))
      ));
      const requestedActivation = Number(supplied?.activation_scene_number || supplied?.activationSceneNumber);
      const fallbackActivation = preference === "preserve_photo"
        ? (visibleScenes[0]?.sceneNumber || 1)
        : crossing
          ? Math.max(1, crossing.sceneNumber - 1)
          : (visibleScenes[0]?.sceneNumber || 1);
      const activationSceneNumber = scenes.some((scene) => scene.sceneNumber === requestedActivation)
        ? requestedActivation
        : fallbackActivation;
      return {
        characterName: character.name,
        preference,
        outfitId: text(character.outfitId || character.outfit_id),
        initialDescription: "reference_photo_outfit",
        adventureDescription: text(character.outfitContract || character.outfit_contract),
        activationMode: preference === "preserve_photo" ? "from_start" : "before_universe_entry",
        activationSceneNumber,
      };
    });
  const causalGraph = normalizeCausalGraph(
    raw?.causal_graph || raw?.causalGraph,
    objects,
    scenes,
    characters,
  );
  return {
    version: STORY_SCENARIO_VERSION,
    movementLedgerVersion: CHARACTER_MOVEMENT_LEDGER_VERSION,
    language: text(language || "FR").toUpperCase(),
    title: text(raw?.title),
    summary: text(raw?.summary),
    ...(narrativeContract ? { narrativeContract } : {}),
    clarifications,
    creatorClarifications: Object.fromEntries(Object.entries(creatorClarifications || {}).map(([id, answer]) => [text(id), text(answer)]).filter(([id, answer]) => id && answer)),
    worldContract: worldContract && typeof worldContract === "object" && !Array.isArray(worldContract)
      ? structuredClone(worldContract)
      : {},
    ...(Number(castParticipationContract?.version) === 1
      ? { castParticipationContract: structuredClone(castParticipationContract) }
      : {}),
    characters,
    wardrobePlan,
    objects,
    ...(requireCausalGraph ? { causalGraphRequired: true } : {}),
    ...(causalGraph ? { causalGraph } : {}),
    scenes,
  };
}

export function clarificationAnswersForApproval(scenario = {}) {
  const existing = scenario?.creatorClarifications && typeof scenario.creatorClarifications === "object"
    ? scenario.creatorClarifications
    : {};
  const answers = {};
  for (const clarification of list(scenario?.clarifications, 3)) {
    const id = text(clarification?.id);
    const answer = text(existing[id] || clarification?.suggestedAnswer || clarification?.suggested_answer);
    if (!id || !answer) return null;
    answers[id] = answer;
  }
  return answers;
}

export function applyCreatorStoryScenarioEdits(input = {}, { sceneEdits = [], addedCharacters = [] } = {}) {
  const scenario = structuredClone(input);
  scenario.characters ||= [];
  for (const added of list(addedCharacters, 10)) {
    const name = text(added?.name || added);
    if (!name || canonicalName(name, scenario.characters)) continue;
    scenario.characters.push({
      name,
      role: "story_character",
      storyRole: "guest",
      initialLocation: "",
      defaultPresenceMode: "physical",
    });
  }

  const editsByScene = new Map(list(sceneEdits, 24).map((edit) => [Number(edit?.scene_number), edit]));
  for (const scene of list(scenario.scenes, 30)) {
    const edit = editsByScene.get(Number(scene.sceneNumber));
    if (!edit) continue;
    if (Object.hasOwn(edit, "title")) scene.title = text(edit.title);
    if (Object.hasOwn(edit, "action")) scene.action = text(edit.action);
    if (Object.hasOwn(edit, "location")) {
      const previousLocation = scene.locationAfter;
      const location = text(edit.location);
      if (location) {
        scene.locationAfter = location;
        if (scene.transition?.kind === "none" && key(scene.locationBefore) === key(previousLocation)) scene.locationBefore = location;
        scene.transition ||= { kind: "none", mechanism: "", mechanismId: "", characters: [] };
        if (scene.transition.kind === "join_travel" && key(scene.locationBefore) !== key(location)) {
          scene.transition.kind = "ordinary_travel";
        }
        scene.transition.from = scene.locationBefore;
        scene.transition.to = location;
        const physicalCharacters = list(scene.characterPresences, 30)
          .filter((presence) => presence.mode === "physical")
          .map((presence) => presence.name);
        if (key(scene.locationBefore) !== key(location)) {
          scene.transition.characters = [...new Set([
            ...list(scene.transition.characters, 30),
            ...physicalCharacters,
          ])];
          // The visible creator correction is authoritative. Rebuild stale
          // hidden movement coordinates from the edited before/after frame.
          scene.characterMovements = [];
          for (const presence of list(scene.characterPresences, 30)) {
            if (presence.mode !== "physical") continue;
            presence.phase = "end";
            presence.location = location;
          }
        }
      }
    }
    if (Array.isArray(edit.character_presences)) {
      const previousPresences = new Map(list(scene.characterPresences, 30).map((presence) => [key(presence.name), presence]));
      const selected = new Map();
      for (const requested of list(edit.character_presences, 30)) {
        const name = canonicalName(requested?.name, scenario.characters);
        const mode = text(requested?.mode);
        if (!name || (!PRESENCE_MODES.has(mode) && mode !== "absent")) continue;
        selected.set(key(name), { name, mode });
      }
      scene.characterPresences = [...selected.values()].filter(({ mode }) => mode !== "absent").map(({ name, mode }) => ({
        name,
        mode,
        phase: mode === "physical" ? text(previousPresences.get(key(name))?.phase || "end") : "",
        location: mode === "physical" ? scene.locationAfter : "",
        action: text(previousPresences.get(key(name))?.action),
      }));
    }
  }
  return scenario;
}

function mechanismLifecycleContract(scenario = {}) {
  const persisted = list(scenario?.worldContract?.requiredMechanisms, 20);
  const configured = list(findUniverse(scenario?.worldContract?.id)?.storyContract?.requiredMechanisms, 20);
  return persisted.map((mechanism) => {
    const current = configured.find((candidate) => key(candidate?.id) === key(mechanism?.id));
    return current ? { ...mechanism, ...current, lifecycle: current.lifecycle || mechanism.lifecycle } : mechanism;
  }).concat(configured.filter((mechanism) => (
    !persisted.some((candidate) => key(candidate?.id) === key(mechanism?.id))
  )));
}

function sceneHasPhysicalCharacter(scene, name) {
  return list(scene?.characterPresences, 30).some((presence) => (
    presence?.mode === "physical" && key(presence?.name) === key(name)
  ));
}

function sceneMatchesMechanismZone(scene, lifecycle = {}) {
  const searchable = key(scene?.locationAfter);
  return list(lifecycle?.zoneHints, 30).some((hint) => searchable.includes(key(hint)));
}

function localizedList(names, language) {
  const values = [...new Set(names.map(text).filter(Boolean))];
  if (values.length < 2) return values[0] || "";
  const conjunction = language === "ES" ? " y " : language === "EN" ? " and " : " et ";
  return `${values.slice(0, -1).join(", ")}${conjunction}${values.at(-1)}`;
}

function mechanismLabel(lifecycle = {}, language = "FR") {
  return text(lifecycle?.labels?.[language] || lifecycle?.labels?.FR || "équipement de sécurité");
}

function mechanismInstruction({ owner, label, state, language }) {
  if (language === "ES") {
    if (state === "worn") return `${owner} lleva únicamente su propio equipo: ${label}.`;
    if (state === "absent") return `El equipo de ${owner} no aparece en esta escena.`;
    return `El equipo de ${owner} está guardado y no se lleva puesto: ${label}.`;
  }
  if (language === "EN") {
    if (state === "worn") return `${owner} wears only their own ${label}.`;
    if (state === "absent") return `${owner}'s equipment is not present in this scene.`;
    return `${owner}'s ${label} is stored and not worn.`;
  }
  if (state === "worn") return `${owner} porte uniquement son propre équipement : ${label}.`;
  if (state === "absent") return `L’équipement de ${owner} n’apparaît pas dans cette scène.`;
  return `L’équipement de ${owner} est rangé et n’est pas porté : ${label}.`;
}

function mechanismPreparationSentence({ owners, label, language }) {
  const names = localizedList(owners, language);
  if (language === "ES") {
    return owners.length > 1
      ? `${names} preparan y se colocan cada uno su propia ${label} antes de entrar en la zona de aventura.`
      : `${names} prepara y se coloca su propia ${label} antes de entrar en la zona de aventura.`;
  }
  if (language === "EN") {
    return owners.length > 1
      ? `${names} each prepare and put on their own ${label} before entering the adventure zone.`
      : `${names} prepares and puts on their own ${label} before entering the adventure zone.`;
  }
  return owners.length > 1
    ? `${names} préparent et mettent chacun leur propre ${label} avant d’entrer dans la zone d’aventure.`
    : `${names} prépare et met sa propre ${label} avant d’entrer dans la zone d’aventure.`;
}

function stabilizeRequiredMechanismLifecycles(scenario = {}) {
  const scenes = list(scenario.scenes, 30);
  const language = ["FR", "ES", "EN"].includes(text(scenario.language).toUpperCase())
    ? text(scenario.language).toUpperCase()
    : "FR";
  const preparationGroups = new Map();

  for (const mechanism of mechanismLifecycleContract(scenario)) {
    const lifecycle = mechanism?.lifecycle;
    if (lifecycle?.scope !== "per_character" || lifecycle?.activation !== "before_zone_entry") continue;
    const copies = list(scenario.objects, 30).filter((object) => (
      key(object?.name) === key(mechanism?.id) && text(object?.owner)
    ));
    if (!copies.length) continue;

    for (const copy of copies) {
      const zoneScenes = scenes.filter((scene) => (
        sceneHasPhysicalCharacter(scene, copy.owner)
        && sceneMatchesMechanismZone(scene, lifecycle)
      ));
      if (!zoneScenes.length) continue;
      const firstZoneScene = zoneScenes[0];
      const lastZoneScene = zoneScenes.at(-1);
      const preparationScene = [...scenes]
        .filter((scene) => (
          Number(scene.sceneNumber) < Number(firstZoneScene.sceneNumber)
          && sceneHasPhysicalCharacter(scene, copy.owner)
        ))
        .at(-1) || firstZoneScene;
      const beforeState = OBJECT_STATES.has(lifecycle.beforeState) ? lifecycle.beforeState : "stored";
      const activeState = OBJECT_STATES.has(lifecycle.activeState) ? lifecycle.activeState : "worn";
      const afterState = OBJECT_STATES.has(lifecycle.afterState) ? lifecycle.afterState : "stored";
      const label = mechanismLabel(lifecycle, language);

      for (const scene of scenes) {
        const sceneNumber = Number(scene.sceneNumber);
        const physicallyPresent = sceneHasPhysicalCharacter(scene, copy.owner);
        let state = beforeState;
        if (sceneNumber >= Number(preparationScene.sceneNumber) && sceneNumber <= Number(lastZoneScene.sceneNumber)) {
          state = physicallyPresent ? activeState : "absent";
        } else if (sceneNumber > Number(lastZoneScene.sceneNumber)) {
          state = afterState;
        }
        scene.objectStates ||= [];
        if (copies.length > 1) {
          scene.objectStates = scene.objectStates.filter((item) => (
            key(item?.name) !== key(copy.name) || text(item?.owner)
          ));
        }
        const stateIndex = scene.objectStates.findIndex((item) => (
          objectInstanceKey(item, scenario.objects) === objectInstanceKey(copy, scenario.objects)
        ));
        const nextState = {
          name: copy.name,
          owner: copy.owner,
          state,
          quantity: 1,
          instruction: mechanismInstruction({ owner: copy.owner, label, state, language }),
        };
        if (stateIndex >= 0) scene.objectStates[stateIndex] = nextState;
        else scene.objectStates.push(nextState);
      }

      const firstState = scenes[0]?.objectStates?.find((item) => (
        objectInstanceKey(item, scenario.objects) === objectInstanceKey(copy, scenario.objects)
      ));
      if (firstState) copy.initialState = firstState.state;
      const groupKey = `${preparationScene.sceneNumber}::${key(mechanism.id)}`;
      const group = preparationGroups.get(groupKey) || {
        scene: preparationScene,
        owners: [],
        label,
      };
      group.owners.push(copy.owner);
      preparationGroups.set(groupKey, group);
    }
  }

  for (const group of preparationGroups.values()) {
    const sentence = mechanismPreparationSentence({
      owners: group.owners,
      label: group.label,
      language,
    });
    if (!key(group.scene.action).includes(key(sentence))) {
      group.scene.action = `${text(group.scene.action).replace(/[.!?]\s*$/, "")}. ${sentence}`.trim();
    }
  }
}

const OBJECT_NAME_STOP_WORDS = new Set([
  "avec", "dans", "pour", "sans", "sous", "the", "with", "from", "into", "une", "des",
  "aux", "mille", "couleurs", "magique", "magical", "magic", "magica", "magico",
]);

function sceneObjectText(scene = {}) {
  return key([
    scene.title,
    scene.action,
    scene.storyChange,
    scene.continuityToNext,
  ].filter(Boolean).join(" "));
}

function objectMentionedInScene(scene, object) {
  const searchable = sceneObjectText(scene);
  const words = key(object?.name).split(" ").filter((word) => (
    word.length >= 4 && !OBJECT_NAME_STOP_WORDS.has(word)
  ));
  return words.some((word) => searchable.split(" ").includes(word));
}

function objectEventPatternMatches(scene, object, pattern) {
  const match = sceneObjectText(scene).match(pattern);
  if (!match) return false;
  const matchedWords = key(match[0]).split(" ");
  const objectWords = new Set(key(object?.name).split(" "));
  if (matchedWords.length === 1 && ["plant", "plante", "planta"].includes(matchedWords[0]) && objectWords.has(matchedWords[0])) {
    return false;
  }
  return true;
}

function inferredObjectLifecycle(object, scenes, objects) {
  const mentioned = scenes.filter((scene) => objectMentionedInScene(scene, object));
  const discoveryScene = mentioned.find((scene) => objectEventPatternMatches(scene, object, DISCOVERY_EVENT_PATTERN));
  const plantScene = mentioned.find((scene) => objectEventPatternMatches(scene, object, PLANT_EVENT_PATTERN));
  const consumeScene = mentioned.find((scene) => objectEventPatternMatches(scene, object, CONSUME_EVENT_PATTERN));
  const destroyScene = mentioned.find((scene) => objectEventPatternMatches(scene, object, DESTROY_EVENT_PATTERN));
  let transformScene = mentioned.find((scene) => objectEventPatternMatches(scene, object, TRANSFORM_EVENT_PATTERN));
  const emergenceScene = mentioned.find((scene) => objectEventPatternMatches(scene, object, RESULT_EMERGENCE_PATTERN));
  const emergesAsResult = Boolean(
    (transformScene || emergenceScene)
    && !discoveryScene
    && !plantScene
    && !consumeScene
    && !destroyScene
    && object.initialState === "absent"
    && Number(mentioned[0]?.sceneNumber) === Number((transformScene || emergenceScene).sceneNumber)
  );
  let resultingObject = "";

  if (!transformScene && plantScene) {
    transformScene = scenes.find((scene) => (
      Number(scene.sceneNumber) > Number(plantScene.sceneNumber)
      && (TRANSFORM_EVENT_PATTERN.test(sceneObjectText(scene)) || RESULT_EMERGENCE_PATTERN.test(sceneObjectText(scene)))
      && objects.some((candidate) => (
        objectDefinitionKey(candidate) !== objectDefinitionKey(object)
        && objectMentionedInScene(scene, candidate)
      ))
    ));
  }
  if (transformScene) {
    resultingObject = objects.find((candidate) => (
      objectDefinitionKey(candidate) !== objectDefinitionKey(object)
      && objectMentionedInScene(transformScene, candidate)
    ))?.name || "";
  }

  const events = [];
  if (emergesAsResult) {
    events.push({
      sceneNumber: Number((transformScene || emergenceScene).sceneNumber),
      type: "introduce",
      state: "visible",
      resultingObject: "",
      resultingState: "visible",
    });
    transformScene = null;
  }
  if (discoveryScene) {
    const supplied = list(discoveryScene.objectStates, 30).find((state) => (
      objectInstanceKey(state, objects) === objectInstanceKey(object, objects)
    ));
    events.push({
      sceneNumber: Number(discoveryScene.sceneNumber),
      type: "introduce",
      state: supplied && supplied.state !== "absent" ? supplied.state : "visible",
      resultingObject: "",
      resultingState: "visible",
    });
  }
  if (plantScene) {
    events.push({
      sceneNumber: Number(plantScene.sceneNumber),
      type: "plant",
      state: "planted",
      resultingObject: "",
      resultingState: "visible",
    });
  }
  if (consumeScene) {
    events.push({
      sceneNumber: Number(consumeScene.sceneNumber),
      type: "consume",
      state: "consumed",
      resultingObject: "",
      resultingState: "visible",
    });
  }
  if (destroyScene) {
    events.push({
      sceneNumber: Number(destroyScene.sceneNumber),
      type: "destroy",
      state: "destroyed",
      resultingObject: "",
      resultingState: "visible",
    });
  }
  if (transformScene) {
    events.push({
      sceneNumber: Number(transformScene.sceneNumber),
      type: "transform",
      state: "transformed",
      resultingObject,
      resultingState: "visible",
    });
  }
  const ordered = events
    .filter((event, index, all) => all.findIndex((candidate) => (
      candidate.sceneNumber === event.sceneNumber && candidate.type === event.type
    )) === index)
    .sort((left, right) => left.sceneNumber - right.sceneNumber);
  if (!ordered.length) return null;
  const kind = ordered.some((event) => ["plant", "transform"].includes(event.type))
    ? "transformable"
    : ordered.some((event) => event.type === "consume")
      ? "consumable"
      : "discoverable";
  return { version: 1, kind, events: ordered };
}

function mergedObjectLifecycle(object, scenes, objects) {
  const explicit = object?.lifecycle?.version === 1 ? object.lifecycle : null;
  if (/^graph_v\d+$/.test(object?.causalAuthority) && explicit) return explicit;
  const inferred = inferredObjectLifecycle(object, scenes, objects);
  if (!explicit) return inferred;
  const events = [...list(inferred?.events, 20), ...list(explicit.events, 20)]
    .filter((event, index, all) => all.findLastIndex((candidate) => (
      candidate.sceneNumber === event.sceneNumber && candidate.type === event.type
    )) === index)
    .sort((left, right) => left.sceneNumber - right.sceneNumber);
  return {
    version: 1,
    kind: explicit.kind || inferred?.kind || "persistent",
    events,
  };
}

function lifecycleInstruction({ object, event, state, language }) {
  const name = object.name;
  if (language === "ES") {
    if (state === "absent") return `${name} todavía no aparece en esta escena.`;
    if (state === "planted") return `${name} está plantado y ya no puede estar en una mano.`;
    if (OBJECT_TERMINAL_STATES.has(state)) return `${name} está ${state}; el objeto original ya no puede reaparecer intacto.`;
  } else if (language === "EN") {
    if (state === "absent") return `${name} has not appeared yet and must remain absent from this scene.`;
    if (state === "planted") return `${name} is planted and can no longer be held.`;
    if (OBJECT_TERMINAL_STATES.has(state)) return `${name} is ${state}; the original object cannot reappear intact.`;
  } else {
    if (state === "absent") return `${name} n’est pas encore apparu et doit rester absent de cette scène.`;
    if (state === "planted") return `${name} est planté et ne peut plus être tenu dans une main.`;
    if (OBJECT_TERMINAL_STATES.has(state)) return `${name} est ${state} ; l’objet d’origine ne peut plus réapparaître intact.`;
  }
  if (event?.type === "introduce") return `${name}: first physical appearance in this scene; exactly one copy.`;
  return `${name}: preserve exactly this lifecycle state (${state}) and one copy.`;
}

function upsertObjectState(scene, object, objects, state, instruction) {
  scene.objectStates ||= [];
  const instanceKey = objectInstanceKey(object, objects);
  const stateIndex = scene.objectStates.findIndex((item) => objectInstanceKey(item, objects) === instanceKey);
  const existing = stateIndex >= 0 ? scene.objectStates[stateIndex] : null;
  const next = {
    ...(object.objectId ? { objectId: object.objectId } : {}),
    name: object.name,
    owner: existing?.owner || object.owner,
    state,
    quantity: 1,
    instruction,
  };
  if (stateIndex >= 0) scene.objectStates[stateIndex] = next;
  else scene.objectStates.push(next);
}

function stabilizeNarrativeObjectLifecycles(scenario = {}) {
  const scenes = list(scenario.scenes, 30);
  const objects = list(scenario.objects, 30).filter((object) => object.trackEveryScene);
  const language = ["FR", "ES", "EN"].includes(text(scenario.language).toUpperCase())
    ? text(scenario.language).toUpperCase()
    : "FR";
  const lifecycles = new Map(objects.map((object) => [
    objectInstanceKey(object, objects),
    mergedObjectLifecycle(object, scenes, objects),
  ]));

  for (const object of objects) {
    const lifecycle = lifecycles.get(objectInstanceKey(object, objects));
    if (!lifecycle?.events?.length) continue;
    object.lifecycle = lifecycle;
    const introduction = lifecycle.events.find((event) => ["introduce", "acquire"].includes(event.type));
    if (introduction && introduction.sceneNumber > 1) object.initialState = "absent";
    let currentState = object.initialState;
    for (const scene of scenes) {
      const events = lifecycle.events.filter((event) => event.sceneNumber === Number(scene.sceneNumber));
      for (const event of events) currentState = event.state;
      upsertObjectState(
        scene,
        object,
        objects,
        currentState,
        lifecycleInstruction({ object, event: events.at(-1), state: currentState, language }),
      );
    }
  }

  for (const source of objects) {
    const sourceLifecycle = lifecycles.get(objectInstanceKey(source, objects));
    for (const event of list(sourceLifecycle?.events, 20).filter((item) => item.resultingObject)) {
      const target = objects.find((candidate) => key(candidate.name) === key(event.resultingObject));
      if (!target) continue;
      const targetKey = objectInstanceKey(target, objects);
      const existing = lifecycles.get(targetKey) || { version: 1, kind: "discoverable", events: [] };
      if (!existing.events.some((candidate) => candidate.type === "introduce")) {
        existing.events.push({
          sceneNumber: event.sceneNumber,
          type: "introduce",
          state: event.resultingState || "visible",
          resultingObject: "",
          resultingState: "visible",
        });
      }
      existing.events.sort((left, right) => left.sceneNumber - right.sceneNumber);
      target.lifecycle = existing;
      target.initialState = event.sceneNumber > 1 ? "absent" : target.initialState;
      let targetState = target.initialState;
      for (const scene of scenes) {
        const events = existing.events.filter((candidate) => candidate.sceneNumber === Number(scene.sceneNumber));
        for (const targetEvent of events) targetState = targetEvent.state;
        upsertObjectState(
          scene,
          target,
          objects,
          targetState,
          lifecycleInstruction({ object: target, event: events.at(-1), state: targetState, language }),
        );
      }
    }
  }
}

export function stabilizeStoryScenario(input = {}) {
  const scenario = applyCausalGraph(structuredClone(input));
  const scenes = list(scenario.scenes, 30);
  for (const character of list(scenario.characters, 20)) {
    if (character.initialLocation) continue;
    const firstPhysicalScene = scenes.find((scene) => list(scene.characterPresences, 20).some((presence) => presence.name === character.name && presence.mode === "physical"));
    if (!firstPhysicalScene) continue;
    const changesLocation = key(firstPhysicalScene.locationBefore) !== key(firstPhysicalScene.locationAfter);
    character.initialLocation = changesLocation ? firstPhysicalScene.locationBefore : firstPhysicalScene.locationAfter;
  }
  const characterLocations = new Map(list(scenario.characters, 20).map((character) => [character.name, character.initialLocation]));
  const trackedObjects = list(scenario.objects, 20).filter((object) => object.trackEveryScene);
  const objectStates = new Map(trackedObjects.map((object) => [objectInstanceKey(object, trackedObjects), {
    ...(object.objectId ? { objectId: object.objectId } : {}),
    name: object.name,
    owner: object.owner,
    state: object.initialState,
    quantity: 1,
    instruction: "Keep exactly one visible state for this object.",
  }]));
  const availablePassages = new Map();
  let previous = null;

  for (const scene of scenes) {
    if (previous) {
      scene.locationBefore = previous.locationAfter;
      scene.prerequisiteSceneIds = [...new Set([
        previous.id,
        ...list(scene.prerequisiteSceneIds, 10).filter((id) => {
          const number = Number(String(id).replace("scene-", ""));
          return Number.isInteger(number) && number < scene.sceneNumber;
        }),
      ])];
    } else {
      scene.prerequisiteSceneIds = [];
    }

    scene.transition ||= { kind: "none", mechanism: "", characters: [] };
    scene.transition.mechanismId = passageId(scene.transition.mechanismId, scene.transition.mechanism);
    const changesLocation = key(scene.locationBefore) !== key(scene.locationAfter);
    for (const presence of list(scene.characterPresences, 30)) {
      if (presence.mode !== "physical") {
        presence.phase = "";
        presence.location = "";
        continue;
      }
      presence.phase = PRESENCE_PHASES.has(presence.phase) ? presence.phase : "end";
      presence.location = presence.phase === "start"
        ? scene.locationBefore
        : scene.locationAfter;
    }
    scene.transition.from = scene.locationBefore;
    scene.transition.to = scene.locationAfter;
    if (scene.transition.kind === "discover_passage" && scene.transition.mechanismId) {
      availablePassages.set(scene.transition.mechanismId, {
        mechanismId: scene.transition.mechanismId,
        mechanism: scene.transition.mechanism,
      });
    }
    if (changesLocation && scene.transition.kind === "none") {
      const discovered = [...availablePassages.values()].at(-1);
      if (discovered) {
        scene.transition.kind = "cross_passage";
        scene.transition.mechanismId = discovered.mechanismId;
        scene.transition.mechanism = discovered.mechanism;
      } else {
        scene.transition.kind = "ordinary_travel";
        scene.transition.mechanismId = "";
      }
    }
    scene.characterMovements = stabilizeSceneCharacterMovements(scene, {
      characters: list(scenario.characters, 20),
      characterLocations,
    });
    const focalMovements = scene.characterMovements.filter((movement) => (
      key(movement.from) === key(scene.locationBefore)
      && key(movement.to) === key(scene.locationAfter)
    ));
    if (changesLocation && focalMovements.length) {
      const primaryMovement = focalMovements[0];
      scene.transition.kind = primaryMovement.kind;
      scene.transition.mechanism = primaryMovement.mechanism;
      scene.transition.mechanismId = primaryMovement.mechanismId;
      scene.transition.characters = [...new Set(focalMovements.flatMap((movement) => movement.characters))];
    } else if (!changesLocation && scene.transition.kind !== "discover_passage") {
      if (
        scene.characterMovements.length === 1
        && key(scene.characterMovements[0].to) === key(scene.locationAfter)
      ) {
        const [movement] = scene.characterMovements;
        scene.transition = {
          kind: movement.kind,
          mechanism: movement.mechanism,
          mechanismId: movement.mechanismId,
          from: movement.from,
          to: movement.to,
          characters: [...movement.characters],
        };
      } else {
        scene.transition = {
          kind: "none",
          mechanism: "",
          mechanismId: "",
          from: scene.locationBefore,
          to: scene.locationAfter,
          characters: [],
        };
      }
    }
    for (const movement of scene.characterMovements) {
      if (movement.kind === "cross_passage" && movement.mechanismId) {
        availablePassages.delete(movement.mechanismId);
      }
    }

    scene.objectStates ||= [];
    const explicitObjectKeys = new Set(list(scene.objectStates, 30).map((item) => objectInstanceKey(item, trackedObjects)));
    for (const tracked of trackedObjects) {
      const objectKey = objectInstanceKey(tracked, trackedObjects);
      if (!explicitObjectKeys.has(objectKey) && objectStates.has(objectKey)) scene.objectStates.push({ ...objectStates.get(objectKey) });
    }
    for (const state of list(scene.objectStates, 30)) objectStates.set(objectInstanceKey(state, trackedObjects), { ...state });
    previous = scene;
  }
  stabilizeRequiredMechanismLifecycles(scenario);
  stabilizeNarrativeObjectLifecycles(scenario);
  projectCausalGraphObjectLedger(scenario);
  return scenario;
}

function validateNarrativeObjectLifecycles(scenario = {}) {
  const issues = [];
  const scenes = list(scenario.scenes, 30);
  const objects = list(scenario.objects, 30).filter((object) => object.trackEveryScene);
  for (const object of objects) {
    const lifecycle = mergedObjectLifecycle(object, scenes, objects);
    if (!lifecycle?.events?.length) continue;
    const events = lifecycle.events.slice().sort((left, right) => left.sceneNumber - right.sceneNumber);
    const introduction = events.find((event) => ["introduce", "acquire"].includes(event.type));
    const transform = events.find((event) => ["transform", "consume"].includes(event.type));
    const plant = events.find((event) => event.type === "plant");
    if (introduction && transform && scenes.length >= 6 && transform.sceneNumber <= introduction.sceneNumber + 1) {
      issues.push(`scene-${transform.sceneNumber}: object ${object.name} transforms before the story shows a meaningful attempt`);
    }
    if (plant && transform && transform.sceneNumber <= plant.sceneNumber) {
      issues.push(`scene-${transform.sceneNumber}: object ${object.name} transforms before time passes after planting`);
    }

    let expectedState = object.initialState;
    let irreversibleState = OBJECT_TERMINAL_STATES.has(expectedState) ? expectedState : "";
    let planted = expectedState === "planted";
    for (const scene of scenes) {
      const sceneEvents = events.filter((event) => event.sceneNumber === Number(scene.sceneNumber));
      for (const event of sceneEvents) {
        if (
          (irreversibleState || planted)
          && OBJECT_POSSESSION_STATES.has(event.state)
          && event.type !== "retrieve"
        ) {
          issues.push(`scene-${scene.sceneNumber}: object ${object.name} cannot return from ${irreversibleState || "planted"} to ${event.state} without an explicit retrieve event`);
        }
        expectedState = event.state;
        if (OBJECT_TERMINAL_STATES.has(expectedState)) irreversibleState = expectedState;
        if (expectedState === "planted") planted = true;
        if (event.type === "retrieve") {
          irreversibleState = "";
          planted = false;
        }
      }
      const supplied = list(scene.objectStates, 30).find((state) => (
        objectInstanceKey(state, objects) === objectInstanceKey(object, objects)
      ));
      const locationBoundElsewhere = object.spatialMode === "location_bound"
        && key(scene.locationAfter) !== key(object.homeLocation)
        && expectedState !== "absent"
        && !OBJECT_TERMINAL_STATES.has(expectedState);
      const expectedSceneState = locationBoundElsewhere ? "absent" : expectedState;
      if (!supplied || supplied.state !== expectedSceneState) {
        issues.push(`scene-${scene.sceneNumber}: object ${object.name} must be ${expectedSceneState} according to its lifecycle and location`);
      }
    }

    for (const event of events.filter((item) => item.resultingObject)) {
      const target = objects.find((candidate) => key(candidate.name) === key(event.resultingObject));
      if (!target) {
        issues.push(`scene-${event.sceneNumber}: transformed object ${object.name} requires declared result ${event.resultingObject}`);
        continue;
      }
      for (const scene of scenes.filter((candidate) => Number(candidate.sceneNumber) < event.sceneNumber)) {
        const targetState = list(scene.objectStates, 30).find((state) => (
          objectInstanceKey(state, objects) === objectInstanceKey(target, objects)
        ));
        if (targetState && targetState.state !== "absent") {
          issues.push(`scene-${scene.sceneNumber}: resulting object ${target.name} must remain absent before ${object.name} transforms`);
        }
      }
    }
  }
  return [...new Set(issues)];
}

export function validateStoryScenario(scenario = {}) {
  const issues = [
    ...validateCausalGraph(scenario),
    ...validateStoryCastParticipation(scenario),
  ];
  if (scenario?.causalGraphRequired && !scenario?.causalGraph) {
    issues.push("scenario causal graph is required");
  }
  const scenes = list(scenario.scenes, 30);
  if (!scenario.title) issues.push("scenario.title is required");
  if (!scenario.summary) issues.push("scenario.summary is required");
  if (!scenes.length) issues.push("scenario.scenes are required");
  const fixedEntityNames = new Set();
  for (const object of list(scenario.objects, 20).filter((item) => item.spatialMode === "location_bound")) {
    if (!object.trackEveryScene) issues.push(`location-bound entity ${object.name} must be tracked in every scene`);
    if (fixedEntityNames.has(key(object.name))) issues.push(`location-bound entity ${object.name} must have one globally unique identity`);
    fixedEntityNames.add(key(object.name));
  }
  const trackedObjects = list(scenario.objects, 20).filter((object) => object.trackEveryScene);
  const narrativeContract = scenario.narrativeContract?.version === 1 ? scenario.narrativeContract : null;
  const declaredSymbols = new Set();
  const storyChanges = new Map();
  const narrativeFunctions = new Map();
  if (narrativeContract) {
    if (narrativeContract.privacyMode !== "implicit_personal_depth") issues.push("scenario privacy mode must keep personal depth implicit");
    if (narrativeContract.moralDelivery !== "action_before_words") issues.push("scenario moral must be shown through action before words");
    if (narrativeContract.primarySymbol?.name) declaredSymbols.add(key(narrativeContract.primarySymbol.name));
    if (list(narrativeContract.secondarySymbols, 10).length > 2) issues.push("scenario may use at most two secondary symbols");
    for (const symbol of list(narrativeContract.secondarySymbols, 2)) {
      if (symbol?.name) declaredSymbols.add(key(symbol.name));
    }
    if (declaredSymbols.size > 3) issues.push("scenario may use at most three recurring symbols");
  }
  let previous = null;

  for (const [index, scene] of scenes.entries()) {
    if (scene.sceneNumber !== index + 1 || scene.id !== sceneId(index + 1)) issues.push(`scene ${index + 1} is out of order`);
    if (!scene.storyRole) issues.push(`${scene.id}.storyRole is required`);
    if (!scene.title) issues.push(`${scene.id}.title is required`);
    if (!scene.action) issues.push(`${scene.id}.action is required`);
    if (narrativeContract) {
      if (!scene.narrativeFunction) issues.push(`${scene.id}.narrativeFunction is required for progression`);
      if (!scene.dominantEmotion) issues.push(`${scene.id}.dominantEmotion is required`);
      if (!scene.emotionalShift) issues.push(`${scene.id}.emotionalShift is required`);
      if (!scene.storyChange) issues.push(`${scene.id}.storyChange is required for progression`);
      const functionKey = key(scene.narrativeFunction);
      const changeKey = key(scene.storyChange);
      if (functionKey && narrativeFunctions.has(functionKey)) {
        issues.push(`${scene.id} duplicates narrative function from ${narrativeFunctions.get(functionKey)}`);
      } else if (functionKey) narrativeFunctions.set(functionKey, scene.id);
      if (changeKey && storyChanges.has(changeKey)) {
        issues.push(`${scene.id} duplicates story change from ${storyChanges.get(changeKey)}`);
      } else if (changeKey) storyChanges.set(changeKey, scene.id);
      for (const symbol of list(scene.symbolUse, 3)) {
        if (!declaredSymbols.has(key(symbol?.name))) issues.push(`${scene.id}: symbol ${text(symbol?.name)} is not declared in narrative contract`);
      }
    }
    if (!scene.locationBefore || !scene.locationAfter) issues.push(`${scene.id} requires locationBefore and locationAfter`);
    if (previous) {
      if (key(scene.locationBefore) !== key(previous.locationAfter)) issues.push(`${scene.id} must start in ${previous.locationAfter}`);
      if (!scene.prerequisiteSceneIds.includes(previous.id)) issues.push(`${scene.id} must depend on ${previous.id}`);
    }
    for (const prerequisite of scene.prerequisiteSceneIds) {
      const number = Number(String(prerequisite).replace("scene-", ""));
      if (!Number.isInteger(number) || number >= scene.sceneNumber) issues.push(`${scene.id} has a non-prior prerequisite ${prerequisite}`);
    }

    const transition = scene.transition || { kind: "none", characters: [] };
    const changesLocation = key(scene.locationBefore) !== key(scene.locationAfter);
    if (changesLocation && transition.kind === "none") issues.push(`${scene.id} changes location without a transition`);
    if (transition.kind !== "none" && transition.kind !== "join_travel" && (key(transition.from) !== key(scene.locationBefore) || key(transition.to) !== key(scene.locationAfter))) {
      issues.push(`${scene.id} transition must match its before/after locations`);
    }
    if (!changesLocation && ["ordinary_travel", "return_travel"].includes(transition.kind)) {
      issues.push(`${scene.id} incoming traveler requires a join_travel transition`);
    }
    if (transition.kind === "join_travel") {
      if (changesLocation) issues.push(`${scene.id} join_travel must keep the focal scene at its destination`);
      if (!transition.from || key(transition.from) === key(transition.to)) issues.push(`${scene.id} join_travel requires a distinct origin`);
      if (key(transition.to) !== key(scene.locationAfter)) issues.push(`${scene.id} join_travel must arrive at the scene location`);
      if (!transition.characters?.length) issues.push(`${scene.id} join_travel must name each incoming traveler`);
    }
    if (transition.kind === "discover_passage" && !transition.mechanism) {
      issues.push(`${scene.id} passage discovery needs a mechanism`);
    }

    const objectNames = new Set();
    const declaredCopiesByName = new Map();
    for (const object of trackedObjects) {
      const owners = declaredCopiesByName.get(key(object.name)) || new Set();
      owners.add(key(object.owner));
      declaredCopiesByName.set(key(object.name), owners);
    }
    for (const objectState of scene.objectStates || []) {
      const objectKey = objectInstanceKey(objectState, trackedObjects);
      if (objectNames.has(objectKey)) issues.push(`${scene.id}: ${objectState.name} has two simultaneous states`);
      objectNames.add(objectKey);
      if (!objectState.owner && (declaredCopiesByName.get(key(objectState.name))?.size || 0) > 1) {
        issues.push(`${scene.id}: object ${objectState.name} needs an owner to distinguish its copies`);
      }
      if (Number(objectState.quantity) !== 1 && ["worn", "held", "carried"].includes(objectState.state)) {
        issues.push(`${scene.id}: a worn or held personal object must have quantity 1`);
      }
      if (objectState.owner && ["worn", "held", "carried"].includes(objectState.state)) {
        const physicalNames = new Set((scene.characterPresences || [])
          .filter((presence) => presence.mode === "physical")
          .map((presence) => presence.name));
        if (!physicalNames.has(objectState.owner)) {
          issues.push(`${scene.id}: ${objectState.owner} cannot ${objectState.state} ${objectState.name} while not physically present`);
        }
      }
    }
    for (const tracked of trackedObjects) {
      if (!objectNames.has(objectInstanceKey(tracked, trackedObjects))) issues.push(`${scene.id}: tracked object ${tracked.name} needs one explicit state`);
    }
    previous = scene;
  }
  issues.push(...validateNarrativeObjectLifecycles(scenario));
  const movementValidation = validateCharacterMovementLedger(scenario);
  issues.push(...movementValidation.issues);
  return { valid: issues.length === 0, issues };
}

export function summarizeStoryScenarioValidation(validation = {}) {
  const categories = new Set();
  const sceneNumbers = new Set();
  const categoryScenes = new Map();
  for (const issue of list(validation.issues, 100).map(text)) {
    const sceneMatch = issue.match(/scene[- ](\d+)/i);
    const sceneNumber = sceneMatch ? Number(sceneMatch[1]) : 0;
    if (sceneNumber) sceneNumbers.add(sceneNumber);
    let category = "incomplete";
    if (/passage|crosses/i.test(issue)) category = "passage";
    else if (/privacy/i.test(issue)) category = "privacy";
    else if (/symbol/i.test(issue)) category = "symbol";
    else if (/emotion/i.test(issue)) category = "emotion";
    else if (/narrativefunction|storychange|progression|duplicates narrative|duplicates story/i.test(issue)) category = "progression";
    else if (/moral|repeat/i.test(issue)) category = "repetition";
    else if (/age|vocabulary|abstraction/i.test(issue)) category = "age";
    else if (/object|states|quantity|worn|held/i.test(issue)) category = "object";
    else if (/cast participant/i.test(issue)) category = "cast";
    else if (/location|transition|depart|travel|appears|physical/i.test(issue)) category = "travel";
    else if (/order|depend|prerequisite|storyrole/i.test(issue)) category = "order";
    categories.add(category);
    if (sceneNumber) {
      const numbers = categoryScenes.get(category) || new Set();
      numbers.add(sceneNumber);
      categoryScenes.set(category, numbers);
    }
  }
  const diagnostics = list(validation.diagnostics, 12).map((diagnostic) => ({
    code: text(diagnostic?.code).replace(/[^a-z0-9_-]+/gi, "_").slice(0, 80) || "semantic_contradiction",
    sceneNumber: Math.max(0, Number(diagnostic?.sceneNumber || 0)),
    explanation: text(diagnostic?.explanation).slice(0, 600),
  })).filter((diagnostic) => diagnostic.explanation);
  return {
    version: STORY_SCENARIO_VALIDATION_VERSION,
    valid: validation.valid === true,
    issueCount: Number(validation.issues?.length || 0),
    categories: [...categories],
    sceneNumbers: [...sceneNumbers].sort((left, right) => left - right),
    categoryScenes: Object.fromEntries([...categoryScenes].map(([category, numbers]) => [category, [...numbers].sort((left, right) => left - right)])),
    diagnostics,
  };
}

function hasLegacyRepeatedIntroduction(scene, objects = []) {
  return list(scene?.objectStates, 40).some((objectState) => {
    if (!/first physical appearance in this scene/i.test(text(objectState?.instruction))) return false;
    const object = list(objects, 30).find((candidate) => (
      objectInstanceKey(candidate, objects) === objectInstanceKey(objectState, objects)
    ));
    const introduction = list(object?.lifecycle?.events, 20)
      .find((event) => ["introduce", "acquire"].includes(event?.type));
    return Number.isInteger(Number(introduction?.sceneNumber))
      && Number(introduction.sceneNumber) < Number(scene?.sceneNumber);
  });
}

export function recoverLegacyLifecycleValidation(input = {}, { now = new Date().toISOString() } = {}) {
  const scenario = structuredClone(input);
  const validation = scenario?.validation || {};
  const invalidSceneNumbers = list(validation.sceneNumbers, 30).map(Number).filter(Number.isInteger);
  const legacyGenericFailure = scenario?.status === "needs_revision"
    && validation.valid === false
    && Number(validation.version || 0) < STORY_SCENARIO_VALIDATION_VERSION
    && invalidSceneNumbers.length > 0
    && list(validation.categories, 20).every((category) => category === "incomplete");
  if (!legacyGenericFailure) return null;
  const scenesByNumber = new Map(list(scenario.scenes, 30).map((scene) => [Number(scene.sceneNumber), scene]));
  if (!invalidSceneNumbers.every((sceneNumber) => (
    hasLegacyRepeatedIntroduction(scenesByNumber.get(sceneNumber), scenario.objects)
  ))) return null;
  const repaired = stabilizeStoryScenario(scenario);
  const deterministicValidation = validateStoryScenario(repaired);
  if (!deterministicValidation.valid) return null;
  return {
    ...repaired,
    status: list(repaired.clarifications, 20).length ? "needs_clarification" : "proposed",
    validation: {
      version: STORY_SCENARIO_VALIDATION_VERSION,
      valid: true,
      issueCount: 0,
      categories: [],
      sceneNumbers: [],
      categoryScenes: {},
      diagnostics: [],
      repairedAt: now,
      repairedFrom: "object_lifecycle_first_appearance_v1",
    },
  };
}

export function storyScenarioSnapshot(project) {
  const scenario = project?.continuitySnapshot?.storyScenario;
  return [1, STORY_SCENARIO_VERSION].includes(Number(scenario?.version)) ? scenario : null;
}

export function approvedStoryScenario(project, fingerprint = "") {
  const scenario = storyScenarioSnapshot(project);
  if (!scenario || scenario.status !== "approved") return null;
  if (fingerprint && scenario.fingerprint !== fingerprint) return null;
  return scenario;
}

export function storyScenarioRequired(project) {
  return project?.continuitySnapshot?.storyScenarioWorkflow?.required === true;
}

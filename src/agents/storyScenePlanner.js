import { runAgent } from "../services/agentRunner.js";
import { loadPrompt } from "../services/loadPrompt.js";
import { aliasesFromSceneContract, compactImageSceneContract, neutralizeImageText } from "../services/imageVisualContract.js";
import { enrichFamilyAddress } from "../services/characterRelationships.js";
import { compileStoryPlan } from "../services/storyPlanCompiler.js";
import { compilePhysicalRenderSnapshot } from "../services/physicalRenderSnapshot.js";
import { canonicalizeWrittenNames } from "./blueprintFiller.js";

function key(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function editDistance(left, right) {
  const a = key(left).replaceAll(" ", "");
  const b = key(right).replaceAll(" ", "");
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

function canonicalName(value, characters) {
  const exact = characters.find((character) => key(character.name) === key(value));
  if (exact) return exact.name;
  const source = key(value);
  const matches = characters
    .filter((character) => source.slice(0, 2) === key(character.name).slice(0, 2))
    .map((character) => ({ name: character.name, distance: editDistance(value, character.name) }))
    .filter((candidate) => candidate.distance <= 2)
    .sort((left, right) => left.distance - right.distance);
  return matches[0]?.name || "";
}

function list(value, maximum = 20) {
  return (Array.isArray(value) ? value : []).filter(Boolean).slice(0, maximum);
}

function hasName(value, name) {
  if (!name) return false;
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`,
    "iu",
  ).test(String(value || ""));
}

function previousPlanForModel(previousPlan = null) {
  if (!previousPlan) return null;
  return {
    page_texts: Object.entries(previousPlan.pageTexts || {}).map(([pageNumber, text]) => ({
      page_number: Number(pageNumber),
      text: String(text || ""),
      speech_segments: list(previousPlan.speechSegmentsByPage?.[pageNumber], 20),
    })),
    scene_contracts: list(previousPlan.sceneContracts, 30),
  };
}

export function storyPlanRepairEnvelope({
  previousPlan = null,
  validationIssues = [],
  spreads = [],
  approvedScenario = null,
} = {}) {
  const normalizedIssues = list(validationIssues, 8).map((issue) => ({
    scene_number: Math.max(0, Number(issue?.sceneNumber || issue?.scene_number || 0)),
    code: String(issue?.code || "scenario_fidelity"),
    repair_instruction: String(issue?.explanation || issue?.repair_instruction || "").trim(),
  })).filter((issue) => issue.scene_number && issue.repair_instruction);
  const affectedScenes = new Set(normalizedIssues.map((issue) => issue.scene_number));
  const repairTargets = list(spreads, 30)
    .filter((spread) => affectedScenes.has(Number(spread?.scene_number || 0)))
    .map((spread) => {
      const approvedScene = approvedScenario?.scenes?.find(
        (scene) => Number(scene?.sceneNumber || 0) === Number(spread.scene_number || 0),
      ) || spread.approved_scene || null;
      return {
        scene_number: Number(spread.scene_number || 0),
        text_page_number: Number(spread.text_page_number || 0),
        image_page_number: Number(spread.image_page_number || 0),
        repair_instructions: normalizedIssues
          .filter((issue) => issue.scene_number === Number(spread.scene_number || 0))
          .map((issue) => issue.repair_instruction),
        approved_action: String(approvedScene?.action || ""),
        approved_physical_characters: list(approvedScene?.characterPresences, 15)
          .filter((presence) => presence?.mode === "physical")
          .map((presence) => ({
            name: String(presence?.name || ""),
            action: String(presence?.action || ""),
          })),
        approved_object_states: list(approvedScene?.objectStates, 20),
      };
    });
  return {
    previous_plan: previousPlanForModel(previousPlan),
    validation_issues: normalizedIssues,
    repair_targets: repairTargets,
  };
}

export function normalizeSceneContract(raw, expected, canonicalCharacters) {
  const rawNamed = list(raw?.named_characters, 10);
  const approvedPresences = list(expected?.approved_scene?.characterPresences, 15);
  const approvedPhysical = approvedPresences.filter((presence) => presence?.mode === "physical");
  const approvedPhysicalNames = new Set(approvedPhysical.map((presence) => key(presence?.name)));
  const absentCanonicalNames = expected?.approved_scene
    ? canonicalCharacters
      .map((character) => character?.name)
      .filter((name) => name && !approvedPhysicalNames.has(key(name)))
    : [];
  const mentionsAbsentCharacter = (value) => absentCanonicalNames.some(
    (name) => hasName(value, name),
  );
  const namedSource = expected?.approved_scene
    ? approvedPhysical.map((presence) => {
      const supplied = rawNamed.find((item) => key(item?.name) === key(presence?.name));
      return {
        ...(supplied || {}),
        name: presence.name,
        visual_role: supplied?.visual_role || "visible",
        action: presence.action
          || supplied?.action
          || "physically present in the approved scene",
      };
    })
    : rawNamed.length
      ? rawNamed
      : list(expected.planned_cast, 10).map((name) => ({ name, visual_role: "visible", action: "as stated in the paired prose" }));
  const named = namedSource.map((item) => {
    const name = canonicalName(item?.name, canonicalCharacters);
    if (expected?.approved_scene && !approvedPhysicalNames.has(key(name))) return null;
    return name ? {
      name,
      visual_role: String(item?.visual_role || "background"),
      action: canonicalizeWrittenNames(item?.action, canonicalCharacters),
    } : null;
  }).filter(Boolean);
  const generic = list(raw?.generic_characters, 12)
    .filter((item) => !mentionsAbsentCharacter(
      `${item?.description || ""} ${item?.action || ""}`,
    ))
    .map((item, index) => ({
      id: String(item?.id || `generic_${index + 1}`).replace(/[^a-z0-9_-]/gi, "_").toLowerCase(),
      description: canonicalizeWrittenNames(item?.description, canonicalCharacters),
      visual_role: String(item?.visual_role || "background"),
      action: canonicalizeWrittenNames(item?.action, canonicalCharacters),
      must_not_resemble: [...new Set(list(item?.must_not_resemble, 10).map((name) => canonicalName(name, canonicalCharacters)).filter(Boolean))],
    }));
  const resolveActor = (value) => {
    const canonical = canonicalName(value, canonicalCharacters);
    if (canonical && expected?.approved_scene && !approvedPhysicalNames.has(key(canonical))) return "";
    return canonical
      || generic.find((item) => key(item.id) === key(value))?.id
      || String(value || "");
  };
  const firstPhysicalName = named[0]?.name || "";
  const rawSubject = String(raw?.main_action?.subject || "");
  const suppliedSubject = resolveActor(rawSubject);
  const suppliedTarget = resolveActor(raw?.main_action?.target);
  const rejectedCanonicalSubject = Boolean(
    rawSubject
    && !suppliedSubject
    && canonicalName(rawSubject, canonicalCharacters),
  );
  const nonphysicalRules = approvedPresences
    .filter((presence) => presence?.mode !== "physical")
    .map((presence) => `${presence.name} is present only as ${presence.mode}; ${presence.name} must not appear physically, touch anyone, travel or perform a visible action.`);
  const lockedSubject = suppliedSubject || firstPhysicalName;
  const lockedTarget = key(suppliedTarget) === key(lockedSubject) ? "" : suppliedTarget;
  const approvedSubjectAction = approvedPhysical.find(
    (presence) => key(presence?.name) === key(lockedSubject),
  )?.action;
  const approvedScene = expected?.approved_scene || null;
  const previousScene = expected?.previous_approved_scene || null;
  const nextScene = expected?.next_approved_scene || null;
  const visiblePhase = ["before", "during", "after"].includes(key(raw?.causal_frame?.visible_phase))
    ? key(raw.causal_frame.visible_phase)
    : (approvedScene?.transition?.kind && approvedScene.transition.kind !== "none" ? "during" : "after");
  const visibleLocation = visiblePhase === "before"
    ? approvedScene?.locationBefore
    : visiblePhase === "after"
      ? approvedScene?.locationAfter
      : String(raw?.causal_frame?.visible_location || approvedScene?.locationAfter || approvedScene?.locationBefore || "").trim();
  const contract = {
    spread_number: expected.spread_number,
    scene_number: expected.scene_number,
    text_page_number: expected.text_page_number,
    image_page_number: expected.image_page_number,
    story_beat: String(raw?.story_beat || expected.prose || expected.planned_image || "").trim(),
    source_prose: String(expected.prose || "").trim(),
    planned_image_context: String(expected.planned_image || "").trim(),
    main_action: {
      subject: lockedSubject,
      verb: String(
        rejectedCanonicalSubject
          ? approvedSubjectAction || "performs the approved scene action"
          : raw?.main_action?.verb || approvedSubjectAction || "",
      ).trim(),
      target: lockedTarget,
    },
    named_characters: named,
    generic_characters: generic,
    required_elements: list(raw?.required_elements, 15)
      .filter((item) => !mentionsAbsentCharacter(item?.description))
      .map((item) => ({
        description: String(item?.description || "").trim(),
        quantity: String(item?.quantity || "").trim(),
        scale: String(item?.scale || "").trim(),
      })).filter((item) => item.description),
    object_states: list(expected?.approved_scene?.objectStates?.length ? expected.approved_scene.objectStates : raw?.object_states, 20).map((item) => ({
      name: String(item?.name || "").trim(),
      owner: canonicalName(item?.owner, canonicalCharacters) || String(item?.owner || "").trim(),
      state: String(item?.state || "visible").trim(),
      quantity: Math.max(1, Number(item?.quantity || 1)),
      instruction: String(item?.instruction || "").trim(),
    })).filter((item) => item.name),
    spatial_relationships: list(raw?.spatial_relationships)
      .map(String)
      .filter((relationship) => !mentionsAbsentCharacter(relationship)),
    forbidden_elements: [...new Set([
      ...list(raw?.forbidden_elements).map(String),
      ...nonphysicalRules,
    ])],
    causal_frame: approvedScene ? {
      before: {
        location: String(approvedScene.locationBefore || "").trim(),
        inherited_from_scene: Number(previousScene?.sceneNumber || 0),
      },
      during: {
        action: String(approvedScene.action || "").trim(),
        transition_kind: String(approvedScene.transition?.kind || "none").trim(),
        transition_mechanism: String(approvedScene.transition?.mechanism || "").trim(),
        transition_mechanism_id: String(approvedScene.transition?.mechanismId || "").trim(),
        from: String(approvedScene.transition?.from || approvedScene.locationBefore || "").trim(),
        to: String(approvedScene.transition?.to || approvedScene.locationAfter || "").trim(),
      },
      after: {
        location: String(approvedScene.locationAfter || "").trim(),
        handed_to_scene: Number(nextScene?.sceneNumber || 0),
      },
      visible_phase: visiblePhase,
      visible_location: String(visibleLocation || "").trim(),
    } : null,
    continuity_from_previous: String(raw?.continuity_from_previous || "").trim(),
    continuity_to_next: String(raw?.continuity_to_next || "").trim(),
  };
  contract.render_snapshot = compilePhysicalRenderSnapshot({
    contract,
    approvedScene,
    previousScene,
    approvedScenario: expected?.approved_scenario || null,
    worldContract: expected?.world_contract || {},
  });
  return contract;
}

export async function storyScenePlannerAgent({
  blueprint,
  pageTexts,
  characterCanons = [],
  approvedScenario = null,
  childSafetyContract = null,
  sensitivityContract = null,
  previousPlan = null,
  validationIssues = [],
}, {
  backgroundExecution = null,
  backgroundStep = "story-plan",
  modelRole = "story_planner",
} = {}) {
  const canonicalCharacters = [
    ...characterCanons.map((item) => ({ name: item.name, role: item.role, relationship: item.relationship })),
    { name: blueprint?.hero?.name, role: "child" },
    ...(blueprint?.cast || []),
  ]
    .filter((item, index, all) => item?.name && all.findIndex((candidate) => key(candidate?.name) === key(item.name)) === index)
    .map((character) => enrichFamilyAddress(character, blueprint?.language));
  const textByPage = new Map(Object.entries(pageTexts || {}).map(([page, text]) => [Number(page), String(text || "")]));
  const spreads = (blueprint?.pages || []).filter((page) => page.page_type === "image").map((imagePage) => {
    const textPage = blueprint.pages.find((page) => page.spread_number === imagePage.spread_number && page.page_type === "text");
    const approvedScene = approvedScenario?.scenes?.find((scene) => Number(scene.sceneNumber) === Number(imagePage.scene_number)) || null;
    return textPage ? {
      spread_number: imagePage.spread_number,
      scene_number: imagePage.scene_number,
      text_page_number: textPage.page_number,
      image_page_number: imagePage.page_number,
      story_role: imagePage.story_role,
      prose: textByPage.get(textPage.page_number) || "",
      planned_image: imagePage.image_prompt || "",
      planned_cast: imagePage.cast_present || [],
      approved_scene: approvedScene,
      previous_approved_scene: approvedScenario?.scenes?.find((scene) => Number(scene.sceneNumber) === Number(imagePage.scene_number) - 1) || null,
      next_approved_scene: approvedScenario?.scenes?.find((scene) => Number(scene.sceneNumber) === Number(imagePage.scene_number) + 1) || null,
      world_contract: approvedScenario?.worldContract || {},
    } : null;
  }).filter(Boolean);
  const response = await runAgent({
    name: "storyScenePlanner",
    clientKind: "story",
    modelRole,
    jsonRepairModelRole: "story_repair",
    system: loadPrompt("story_scene_planner.txt"),
    user: (input) => `COMPLETE_BOOK_JSON:\n${JSON.stringify(input, null, 2)}\n\nReturn ONLY JSON as specified.`,
    backgroundExecution,
    backgroundStep,
    input: {
      language: blueprint?.language,
      canonical_characters: canonicalCharacters,
      page_texts: [...textByPage].map(([page_number, text]) => ({ page_number, text })),
      narrative_spreads: spreads,
      approved_scenario: approvedScenario,
      child_safety_contract: childSafetyContract,
      sensitivity_contract: sensitivityContract,
      ...storyPlanRepairEnvelope({
        previousPlan,
        validationIssues,
        spreads,
        approvedScenario,
      }),
    },
  });
  const candidate = response?.json ?? response?.data ?? response?.output ?? response;
  const plannedPageTexts = list(candidate?.page_texts, 50);
  const plannedTexts = new Map(plannedPageTexts.map((item) => [Number(item?.page_number), String(item?.text || "")]));
  const speechSegmentsByPage = Object.fromEntries(plannedPageTexts
    .map((item) => {
      const pageNumber = Number(item?.page_number || 0);
      const segments = list(item?.speech_segments, 20).map((segment) => ({
        speaker: canonicalName(segment?.speaker, canonicalCharacters) || String(segment?.speaker || "").trim(),
        mode: ["dialogue", "thought"].includes(key(segment?.mode)) ? key(segment.mode) : "dialogue",
        text: String(segment?.text || "").trim(),
      })).filter((segment) => segment.speaker && segment.text);
      return [pageNumber, segments];
    })
    .filter(([pageNumber]) => pageNumber));
  const finalPageTexts = Object.fromEntries([...textByPage].map(([pageNumber, original]) => [
    pageNumber,
    canonicalizeWrittenNames(plannedTexts.get(pageNumber) || original, canonicalCharacters),
  ]));
  const rawContracts = list(candidate?.scene_contracts, 30);
  const sceneContracts = spreads.map((expected) => {
    const raw = rawContracts.find((item) => Number(item?.image_page_number) === Number(expected.image_page_number)
      || Number(item?.spread_number) === Number(expected.spread_number)) || {};
    return normalizeSceneContract({ ...raw }, {
      ...expected,
      approved_scenario: approvedScenario,
      // The reader-visible prose returned by the whole-book pass is the final
      // authority, never the earlier sequential draft supplied as input.
      prose: finalPageTexts[expected.text_page_number] || expected.prose,
    }, canonicalCharacters);
  });
  return compileStoryPlan({
    pageTexts: finalPageTexts,
    speechSegmentsByPage,
    sceneContracts,
  }, {
    canonicalCharacters,
    heroName: blueprint?.hero?.name,
    language: blueprint?.language,
    issues: validationIssues,
  });
}

export function sceneContractImagePrompt({
  contract,
  stylePrompt = "",
  fallbackPrompt = "",
  visualAliases = [],
  safetyFallback = false,
} = {}) {
  const aliases = visualAliases.length ? visualAliases : aliasesFromSceneContract(contract);
  if (!contract) return neutralizeImageText(fallbackPrompt, aliases).trim();
  const compact = compactImageSceneContract(contract, aliases, { safetyFallback });
  const named = list(compact.named_characters, 10)
    .map((item) => `${item.name}: entity type ${item.entity_type || "unspecified"}${item.species ? `; species ${item.species}` : ""}; ${item.visual_role || "visible"}; action: ${item.action || "present in the scene"}`)
    .join(" | ");
  const generic = list(compact.generic_characters, 12)
    .map((item) => `${item.id}: ${item.description}; action: ${item.action}; must remain visually distinct from ${(item.must_not_resemble || []).join(", ") || "all recurring characters"}`)
    .join(" | ");
  const elements = list(compact.required_elements, 15)
    .map((item) => `${item.description}${item.quantity ? `; quantity: ${item.quantity}` : ""}${item.scale ? `; scale: ${item.scale}` : ""}`)
    .join(" | ");
  const objectStates = list(compact.render_snapshot?.visible_object_states || compact.object_states, 20)
    .map((item) => `${item.name}: state ${item.state}; owner ${item.owner || "none"}; quantity ${item.quantity ?? 1}; ${item.instruction || "keep exactly this state"}`)
    .join(" | ");
  return [
    safetyFallback
      ? "Create one policy-safe square children's-book illustration from this minimal visual specification. Every character is original and unbranded."
      : "Create one detailed square children's-book illustration from this compact visual specification.",
    `MAIN ACTION: ${compact.main_action.subject} ${compact.main_action.verb} ${compact.main_action.target}. The subject, gesture and target must be unmistakable.`,
    contract?.artifact_digest ? `CANONICAL CONTRACT DIGEST: ${contract.artifact_digest}. Do not reinterpret or expand this scene contract.` : "",
    named ? `VISIBLE CHARACTER ROLES: ${named}` : "",
    generic ? `GENERIC CHARACTERS: ${generic}` : "",
    elements ? `REQUIRED VISIBLE ELEMENTS: ${elements}` : "",
    objectStates ? `AUTHORITATIVE OBJECT STATES: ${objectStates}. Each object has exactly one state. A held wearable is not also worn; never duplicate it.` : "",
    compact.render_snapshot ? `ONLY VISIBLE PHYSICAL SNAPSHOT: phase ${compact.render_snapshot.visible_phase}; location ${compact.render_snapshot.location}; physical medium ${compact.render_snapshot.physical_medium}; action ${compact.render_snapshot.main_action.subject} ${compact.render_snapshot.main_action.verb} ${compact.render_snapshot.main_action.target}. Depict only this instant. Do not combine preparation, crossing, arrival, removal or storage from another phase.` : "",
    compact.render_snapshot?.camera_environment ? `CAMERA-SIDE WORLD TOPOLOGY: camera side ${compact.render_snapshot.camera_environment.camera_side}; ambient medium ${compact.render_snapshot.camera_environment.ambient_medium}; other-side medium ${compact.render_snapshot.camera_environment.other_side_medium}; entry passage ${compact.render_snapshot.camera_environment.entry_passage_id || "not visible"}. ${compact.render_snapshot.camera_environment.boundary_rule}` : "",
    compact.render_snapshot?.equipment?.length ? `CONDITIONAL EQUIPMENT: ${compact.render_snapshot.equipment.map((item) => `${item.owner}: ${item.name} is ${item.state}, exact quantity ${item.quantity}`).join(" | ")}. Equipment state overrides every wardrobe description.` : "",
    compact.render_snapshot?.forbidden?.length ? `PHYSICAL SNAPSHOT FORBIDS: ${compact.render_snapshot.forbidden.join(" | ")}` : "",
    compact.spatial_relationships.length ? `SPATIAL RELATIONSHIPS: ${compact.spatial_relationships.join(" | ")}` : "",
    compact.forbidden_elements.length ? `FORBIDDEN SUBSTITUTIONS OR ELEMENTS: ${compact.forbidden_elements.join(" | ")}` : "",
    stylePrompt ? `LOCKED RENDERING STYLE: ${neutralizeImageText(stylePrompt, aliases)}` : "",
    "Show one readable focal action, coherent physical scale and the exact requested number of people or objects. Do not render dialogue or written story text. No text, captions, logos, trademarks or watermarks inside the illustration.",
    "IDENTITY SEPARATION: every listed person or animal is one complete, separate individual with one coherent head and body. Never fuse, splice, morph or exchange faces, heads, bodies, limbs, species, clothing or markings between characters or reference images.",
    "ENTITY TYPE LOCK: every character marked as a non-human animal or plush toy must remain visibly non-human. Never replace it with a human child, teenager or adult.",
  ].filter(Boolean).join("\n");
}

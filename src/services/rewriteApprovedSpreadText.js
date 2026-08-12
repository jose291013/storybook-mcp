import { runAgent } from "./agentRunner.js";

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentions(text, name) {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(name)}(?=$|[^\\p{L}\\p{N}])`, "iu")
    .test(String(text || ""));
}

function canonicalNames(project, blueprintPage) {
  const cast = (Array.isArray(blueprintPage?.cast_present) ? blueprintPage.cast_present : [])
    .map((item) => typeof item === "string" ? item : item?.name);
  const canons = (Array.isArray(project.continuitySnapshot?.characterCanons)
    ? project.continuitySnapshot.characterCanons
    : []).map((item) => item?.name);
  const scenario = (Array.isArray(project.finalBlueprint?.approved_scenario?.characters)
    ? project.finalBlueprint.approved_scenario.characters
    : []).map((item) => item?.name);
  return [...new Set([...cast, ...canons, ...scenario].map((name) => String(name || "").trim()).filter(Boolean))];
}

export async function rewriteApprovedSpreadText({
  project,
  blueprintPage,
  currentText,
  instruction,
  requestId,
  strategy = "standard_scoped_edit",
}) {
  const sourceText = String(currentText || "").replace(/\s+/g, " ").trim();
  const currentWords = sourceText.split(/\s+/).filter(Boolean).length;
  const language = String(
    project.finalBlueprint?.language
      || project.questionnaire?.book_language
      || project.locale
      || "FR",
  );
  const result = await runAgent({
    name: "targeted-preview-text-revision",
    clientKind: "story",
    modelRole: "story_writer",
    system: [
      "You revise exactly one already-approved children's-book spread.",
      `Write only in the authoritative book language ${language}.`,
      "Preserve every established plot fact, chronology, location, physical cast, object state and outcome.",
      "Do not introduce or remove an event, character, object, portal crossing, discovery, promise or contradiction.",
      "Apply only the creator's local wording or minor-gesture request.",
      "A minor gesture may be reworded to match the preserved illustration only when it is not the scene's main action or causal event.",
      "Keep the same reading age, warm tone, point of view and approximate length.",
      strategy === "contract_minimal_reformulation"
        ? "This is the bounded second strategy: change the fewest words possible and prefer one local gesture or descriptive phrase; if the request requires a new event, location, cast or main action, preserve the approved text instead of inventing it."
        : "",
      "Return JSON exactly as {\"text\":\"...\"}.",
    ].join("\n"),
    user: () => JSON.stringify({
      request_id: requestId,
      creator_request: instruction,
      current_text: sourceText,
      target_words: currentWords,
      approved_scene: {
        title: blueprintPage?.scene_title || "",
        location: blueprintPage?.scene_location || "",
        action: blueprintPage?.scene_action || "",
        cast: blueprintPage?.cast_present || [],
        scene_contract: blueprintPage?.scene_contract || null,
      },
    }),
  });
  const text = String(result?.text || "").replace(/\s+/g, " ").trim();
  if (!text) throw new Error("The revised spread text is empty");
  for (const name of canonicalNames(project, blueprintPage)) {
    if (mentions(sourceText, name) !== mentions(text, name)) {
      throw new Error(`The revised spread text changed the approved named-character mentions for ${name}`);
    }
  }
  if (currentWords > 20) {
    const words = text.split(/\s+/).length;
    if (words < Math.floor(currentWords * 0.65) || words > Math.ceil(currentWords * 1.35)) {
      throw new Error("The revised spread text does not fit the existing page");
    }
  }
  return text;
}

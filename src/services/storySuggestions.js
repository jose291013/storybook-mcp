import { runAgent } from "./agentRunner.js";
import { bookLanguageInstruction, normalizeBookLanguage } from "../config/bookLanguages.js";
import { loadPrompt } from "./loadPrompt.js";

const IDS = ["teamwork", "discovery", "creation"];
const APPROACH_BY_ID = {
  teamwork: "relational",
  discovery: "symbolic",
  creation: "action",
};

function clean(value, maximum = 900) {
  return String(value || "").trim().slice(0, maximum);
}

function participantRefs(value, availableCast = []) {
  const allowed = new Set(availableCast.map((entry) => clean(entry?.ref, 160)).filter(Boolean));
  const required = new Set(availableCast
    .filter((entry) => ["hero", "ally", "companion"].includes(clean(entry?.story_role || entry?.storyRole, 40).toLowerCase()))
    .map((entry) => clean(entry?.ref, 160))
    .filter(Boolean));
  const supplied = Array.isArray(value) ? value.map((entry) => clean(entry, 160)).filter(Boolean) : [];
  if (!allowed.size) return supplied.length ? [...new Set(supplied)].slice(0, 8) : ["hero"];
  if (!supplied.length || supplied.some((entry) => !allowed.has(entry))) return null;
  const normalized = [...new Set(supplied)];
  if ([...required].some((entry) => !normalized.includes(entry))) return null;
  return normalized;
}

export function normalizeStorySuggestions(value, { availableCast = [] } = {}) {
  const supplied = Array.isArray(value?.suggestions) ? value.suggestions : [];
  return IDS.map((id) => {
    const item = supplied.find((candidate) => clean(candidate?.id, 40) === id);
    if (!item) return null;
    const normalized = {
      id,
      approach: APPROACH_BY_ID[id],
      title: clean(item.title, 120),
      starting_point: clean(item.starting_point || item.startingPoint || item.adventure, 400),
      dream: clean(item.dream, 300),
      challenge: clean(item.challenge, 300),
      first_step: clean(item.first_step, 400),
      effort: clean(item.effort, 700),
      active_role: clean(item.active_role || item.activeRole || item.effort, 500),
      reward: clean(item.reward, 400),
      adventure: clean(item.adventure, 900),
      moment: clean(item.moment, 500),
      resolution: clean(item.resolution || item.reward, 500),
      transformation: clean(item.transformation, 500),
      message: clean(item.message || item.transformation, 500),
      emotional_tone: clean(item.emotional_tone || item.emotionalTone || item.transformation, 300),
      participant_refs: participantRefs(item.participant_refs || item.participantRefs, availableCast),
    };
    return Object.values(normalized).every((entry) => Array.isArray(entry) ? entry.length > 0 : Boolean(entry)) ? normalized : null;
  }).filter(Boolean);
}

export async function createStorySuggestions(input = {}) {
  const language = normalizeBookLanguage(input.language || input.locale);
  const result = await runAgent({
    name: "storySuggestions",
    system: `${bookLanguageInstruction(language)}\n\n${loadPrompt("story_suggestions.txt")}`,
    user: (payload) => `INSPIRATION_INPUT_JSON:\n${JSON.stringify(payload, null, 2)}\n\nReturn ONLY the requested JSON object.`,
    input: {
      language,
      hero_name: clean(input.heroName, 120),
      age: clean(input.age, 20),
      favorite_activities: clean(input.favoriteActivities, 800),
      personality: clean(input.personality, 800),
      creator_situation: clean(input.creatorSituation, 1600),
      selected_intention: input.selectedIntention || {},
      universe_id: clean(input.universeId, 80),
      universe: clean(input.universe, 200),
      universe_story_contract: input.universeStoryContract || {},
      available_cast: (input.storyCast || []).slice(0, 8).map((entry) => ({
        ref: clean(entry?.ref, 160),
        name: clean(entry?.name, 120),
        story_role: clean(entry?.storyRole || entry?.story_role, 40),
        relationship: clean(entry?.relationship, 120),
      })).filter((entry) => entry.ref && entry.name && entry.story_role),
      sensitivity_contract: input.sensitivityContract || null,
    },
  });
  const suggestions = normalizeStorySuggestions(result, { availableCast: input.storyCast || [] });
  if (suggestions.length !== IDS.length) throw new Error("The inspiration model returned an incomplete suggestion set");
  return suggestions;
}

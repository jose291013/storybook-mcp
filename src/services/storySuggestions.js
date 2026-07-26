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

export function normalizeStorySuggestions(value) {
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
    };
    return Object.values(normalized).every(Boolean) ? normalized : null;
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
    },
  });
  const suggestions = normalizeStorySuggestions(result);
  if (suggestions.length !== IDS.length) throw new Error("The inspiration model returned an incomplete suggestion set");
  return suggestions;
}

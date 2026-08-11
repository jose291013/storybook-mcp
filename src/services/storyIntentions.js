import { runAgent } from "./agentRunner.js";
import { bookLanguageInstruction, normalizeBookLanguage } from "../config/bookLanguages.js";
import { loadPrompt } from "./loadPrompt.js";

const IDS = ["approach_1", "approach_2", "approach_3"];

function clean(value, maximum = 900) {
  return String(value || "").trim().slice(0, maximum);
}

export function normalizeStoryIntentions(value) {
  const supplied = Array.isArray(value?.intentions) ? value.intentions : [];
  return IDS.map((id) => {
    const item = supplied.find((candidate) => clean(candidate?.id, 40) === id);
    if (!item) return null;
    const normalized = {
      id,
      title: clean(item.title, 140),
      understanding: clean(item.understanding, 700),
      desired_change: clean(item.desired_change, 400),
      protective_doubt: clean(item.protective_doubt, 400),
      first_step: clean(item.first_step, 400),
      motivation: clean(item.motivation, 400),
      reward: clean(item.reward, 400),
      message: clean(item.message, 500),
    };
    return Object.values(normalized).every(Boolean) ? normalized : null;
  }).filter(Boolean);
}

export async function createStoryIntentions(input = {}) {
  const language = normalizeBookLanguage(input.language || input.locale);
  const result = await runAgent({
    name: "storyIntentions",
    system: `${bookLanguageInstruction(language)}\n\n${loadPrompt("story_intentions.txt")}`,
    user: (payload) => `PARENT_INTENTION_INPUT_JSON:\n${JSON.stringify(payload, null, 2)}\n\nReturn ONLY the requested JSON object.`,
    input: {
      language,
      child_age: Number(input.childAge),
      creator_situation: clean(input.creatorSituation, 1600),
      ideation_round: Math.max(1, Math.min(3, Number(input.roundNumber || 1))),
      previous_interpretations: (Array.isArray(input.previousInterpretations)
        ? input.previousInterpretations
        : []).slice(0, 6).map((item) => ({
        title: clean(item?.title, 140),
        understanding: clean(item?.understanding, 700),
        first_step: clean(item?.first_step, 400),
      })),
      sensitivity_contract: input.sensitivityContract || null,
    },
  });
  const intentions = normalizeStoryIntentions(result);
  if (intentions.length !== IDS.length) throw new Error("The intention model returned an incomplete interpretation set");
  return intentions;
}

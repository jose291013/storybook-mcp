import { runAgent } from "../services/agentRunner.js";
import { bookLanguageInstruction, normalizeBookLanguage } from "../config/bookLanguages.js";
import { loadPrompt } from "../services/loadPrompt.js";
import { STORYBOARD_FIRST_CONTRACT_VERSION } from "../services/specDrivenIllustrationPlan.js";

export function manuscriptReviewFidelityIssues(review = {}, visualStoryboard = null, boundPageTexts = null) {
  if (Number(visualStoryboard?.storyboardFirstVersion || 0) < STORYBOARD_FIRST_CONTRACT_VERSION) return [];
  const contracts = Array.isArray(visualStoryboard?.sceneContracts) ? visualStoryboard.sceneContracts : [];
  const fidelity = Array.isArray(review?.fidelity) ? review.fidelity : [];
  const issues = [];
  const seenPages = new Set();
  const expectedPages = new Set(contracts.map((contract) => Number(contract?.text_page_number || 0)));
  for (const entry of fidelity) {
    const pageNumber = Number(entry?.page_number || 0);
    if (!pageNumber || seenPages.has(pageNumber)) issues.push(`manuscript fidelity page ${pageNumber || "unknown"} is duplicated or invalid`);
    if (pageNumber && !expectedPages.has(pageNumber)) issues.push(`manuscript fidelity page ${pageNumber} is unexpected`);
    seenPages.add(pageNumber);
  }
  const correctedPages = new Set((Array.isArray(review?.pages) ? review.pages : [])
    .map((page) => Number(page?.page_number || 0))
    .filter(Boolean));
  for (const contract of contracts) {
    const pageNumber = Number(contract?.text_page_number || 0);
    const entry = fidelity.find((candidate) => Number(candidate?.page_number) === pageNumber);
    if (!entry) {
      issues.push(`manuscript fidelity is missing for page ${pageNumber}`);
      continue;
    }
    if (String(entry.visual_beat_digest || "") !== String(contract?.visual_beat_digest || "")) {
      issues.push(`manuscript fidelity digest is invalid for page ${pageNumber}`);
    }
    if (!["aligned", "corrected"].includes(entry.status)) {
      issues.push(`manuscript fidelity is unresolved for page ${pageNumber}`);
    }
    if (entry.status === "corrected" && !correctedPages.has(pageNumber)) {
      issues.push(`manuscript fidelity correction is missing for page ${pageNumber}`);
    }
    if (entry.status === "corrected" && boundPageTexts) {
      const correction = (Array.isArray(review?.pages) ? review.pages : [])
        .find((page) => Number(page?.page_number) === pageNumber);
      const boundText = boundPageTexts instanceof Map
        ? boundPageTexts.get(pageNumber)
        : boundPageTexts?.[pageNumber] ?? boundPageTexts?.[String(pageNumber)];
      if (correction && String(boundText || "") !== String(correction.text || "")) {
        issues.push(`manuscript fidelity correction was not applied for page ${pageNumber}`);
      }
    }
  }
  return [...new Set(issues)];
}

export async function manuscriptEditorAgent({
  language = "FR",
  pages = [],
  canonicalCharacters = [],
  approvedScenario = null,
  visualStoryboard = null,
} = {}, {
  backgroundExecution = null,
  backgroundStep = "",
} = {}) {
  const targetLanguage = normalizeBookLanguage(language);
  const result = await runAgent({
    name: "manuscriptEditor",
    clientKind: "story",
    modelRole: "manuscript_editor",
    jsonRepairModelRole: "manuscript_editor",
    system: `${bookLanguageInstruction(targetLanguage)}\n\n${loadPrompt("manuscript_editor.txt")}`,
    user: (input) => `COMPLETE_MANUSCRIPT_JSON:\n${JSON.stringify(input, null, 2)}\n\nReturn ONLY the requested JSON object.`,
    input: {
      language: targetLanguage,
      pages,
      canonical_characters: canonicalCharacters,
      approved_scenario: approvedScenario,
      visual_beats: (Array.isArray(visualStoryboard?.sceneContracts) ? visualStoryboard.sceneContracts : [])
        .map((contract) => ({
          page_number: Number(contract?.text_page_number || 0),
          visual_beat_digest: String(contract?.visual_beat_digest || ""),
          main_action: contract?.main_action || {},
          named_characters: contract?.named_characters || [],
          object_states: contract?.object_states || [],
          causal_frame: contract?.causal_frame || {},
          render_snapshot: contract?.render_snapshot || {},
          forbidden_elements: contract?.forbidden_elements || [],
        }))
        .filter((beat) => beat.page_number > 0),
    },
    backgroundExecution,
    backgroundStep,
  });
  return {
    status: result?.status === "corrected" ? "corrected" : "approved",
    pages: (Array.isArray(result?.pages) ? result.pages : []).map((page) => ({
      page_number: Number(page?.page_number),
      text: String(page?.text || "").trim(),
      reason: String(page?.reason || "").trim(),
    })).filter((page) => page.page_number > 0 && page.text),
    fidelity: (Array.isArray(result?.fidelity) ? result.fidelity : []).map((entry) => ({
      page_number: Number(entry?.page_number || 0),
      visual_beat_digest: String(entry?.visual_beat_digest || "").trim(),
      status: ["aligned", "corrected", "rejected"].includes(entry?.status)
        ? entry.status
        : "rejected",
    })).filter((entry) => entry.page_number > 0),
  };
}

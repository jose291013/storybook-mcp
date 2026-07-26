export const READING_PAGE_COUNTS = [24, 28, 32, 36, 40, 44];

const AGE_PROFILES = [
  { id: "early", minAge: 1, maxAge: 5, sampleAge: 4, recommendedPageCounts: [24] },
  { id: "emerging", minAge: 6, maxAge: 7, sampleAge: 6, recommendedPageCounts: [24, 28] },
  { id: "independent", minAge: 8, maxAge: 9, sampleAge: 8, recommendedPageCounts: [24, 28, 32] },
  { id: "advanced", minAge: 10, maxAge: 11, sampleAge: 10, recommendedPageCounts: [28, 32, 36] },
  { id: "preteen", minAge: 12, maxAge: 14, sampleAge: 12, recommendedPageCounts: [32, 36] },
];

function numericAge(ageValue) {
  const age = Number.parseInt(String(ageValue || "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(age) ? Math.max(1, Math.min(14, age)) : 8;
}

export function getWordsTargetByAge(ageValue, pageType = "text") {
  const age = numericAge(ageValue);
  let target;
  if (age <= 3) target = 28;
  else if (age === 4) target = 45;
  else if (age === 5) target = 55;
  else if (age === 6) target = 70;
  else if (age === 7) target = 85;
  else if (age === 8) target = 105;
  else if (age <= 10) target = 125;
  else target = 135;

  if (["opening_text", "closing_text"].includes(pageType)) target = Math.round(target * 0.58);
  return { target, tolerance: Math.max(8, Math.round(target * 0.16)) };
}

function readingRate(age) {
  if (age <= 5) return 75;
  if (age <= 7) return 90;
  if (age <= 9) return 110;
  if (age <= 11) return 130;
  return 145;
}

function usageForPageCount(pageCount) {
  if (pageCount <= 28) return "single_sitting";
  if (pageCount <= 36) return "full_adventure";
  return "multiple_sittings";
}

export function readingGuidanceForAge(ageValue, pageCountValue) {
  const age = numericAge(ageValue);
  const pageCount = READING_PAGE_COUNTS.includes(Number(pageCountValue)) ? Number(pageCountValue) : 24;
  const profile = AGE_PROFILES.find((candidate) => age >= candidate.minAge && age <= candidate.maxAge) || AGE_PROFILES[2];
  const sceneCount = (pageCount - 2) / 2;
  const normalTarget = getWordsTargetByAge(age, "text").target;
  const shortTarget = getWordsTargetByAge(age, "opening_text").target;
  const estimatedWords = sceneCount * normalTarget + shortTarget * 2;
  const baseMinutes = estimatedWords / readingRate(age);
  const minutesMin = Math.max(4, Math.round(baseMinutes * 0.85));
  const minutesMax = Math.max(minutesMin + 1, Math.round(baseMinutes * 1.2));
  return {
    pageCount,
    sceneCount,
    estimatedWords,
    minutesMin,
    minutesMax,
    usage: usageForPageCount(pageCount),
    recommended: profile.recommendedPageCounts.includes(pageCount),
  };
}

export function buildReadingGuidanceProfiles() {
  return AGE_PROFILES.map((profile) => ({
    id: profile.id,
    minAge: profile.minAge,
    maxAge: profile.maxAge,
    recommendedPageCounts: [...profile.recommendedPageCounts],
    options: READING_PAGE_COUNTS.map((pageCount) => readingGuidanceForAge(profile.sampleAge, pageCount)),
  }));
}

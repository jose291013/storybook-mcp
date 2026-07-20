export const NARRATION_CATALOG_VERSION = "v1";

export const NARRATION_VOICES = Object.freeze([
  { id: "marin", labels: { fr: "Chaleureuse", es: "Cálida", en: "Warm" }, description: { fr: "Ronde et naturelle", es: "Redonda y natural", en: "Rounded and natural" } },
  { id: "cedar", labels: { fr: "Profonde", es: "Profunda", en: "Deep" }, description: { fr: "Posée et enveloppante", es: "Serena y envolvente", en: "Calm and immersive" } },
  { id: "coral", labels: { fr: "Claire", es: "Clara", en: "Clear" }, description: { fr: "Lumineuse et expressive", es: "Luminosa y expresiva", en: "Bright and expressive" } },
  { id: "ballad", labels: { fr: "Douce", es: "Suave", en: "Gentle" }, description: { fr: "Tendre et imagée", es: "Tierna y evocadora", en: "Tender and evocative" } },
]);

export const NARRATION_STYLES = Object.freeze([
  { id: "gentle", labels: { fr: "Doux et rassurant", es: "Dulce y tranquilizador", en: "Gentle and reassuring" } },
  { id: "adventure", labels: { fr: "Aventure et émerveillement", es: "Aventura y asombro", en: "Adventure and wonder" } },
  { id: "bedtime", labels: { fr: "Histoire du soir", es: "Cuento para dormir", en: "Bedtime story" } },
  { id: "theatrical", labels: { fr: "Théâtral et expressif", es: "Teatral y expresivo", en: "Theatrical and expressive" } },
]);

const STYLE_INSTRUCTIONS = {
  gentle: "Use a warm, tender and reassuring delivery, with clear articulation and a calm natural pace.",
  adventure: "Use a lively, wondrous and adventurous delivery with gentle dynamic changes; remain child-safe and never frightening.",
  bedtime: "Use a slow, soothing bedtime-story delivery, with soft pauses and a peaceful tone.",
  theatrical: "Use an expressive, storybook delivery with subtle character colour, without caricature, shouting or frightening effects.",
};

export function narrationChoice(voiceId, styleId) {
  const voice = NARRATION_VOICES.find((item) => item.id === String(voiceId || ""));
  const style = NARRATION_STYLES.find((item) => item.id === String(styleId || ""));
  return voice && style ? { voice, style } : null;
}

export function narrationInstruction(styleId, language) {
  const languageName = String(language || "fr-FR").toLowerCase().startsWith("es") ? "Spanish"
    : String(language || "fr-FR").toLowerCase().startsWith("en") ? "English" : "French";
  return `Narrate in ${languageName}. ${STYLE_INSTRUCTIONS[styleId] || STYLE_INSTRUCTIONS.gentle} Read the supplied text exactly, without adding, removing, translating or paraphrasing any word.`;
}

export function localizedNarrationCatalog(language = "fr") {
  const locale = String(language).toLowerCase().slice(0, 2);
  const key = ["fr", "es", "en"].includes(locale) ? locale : "fr";
  return {
    version: NARRATION_CATALOG_VERSION,
    voices: NARRATION_VOICES.map(({ id, labels, description }) => ({ id, label: labels[key], description: description[key] })),
    styles: NARRATION_STYLES.map(({ id, labels }) => ({ id, label: labels[key] })),
  };
}

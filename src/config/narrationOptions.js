export const NARRATION_CATALOG_VERSION = "v2";

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
  const locale = String(language || "fr-FR").toLowerCase();
  const languageInstruction = locale.startsWith("es")
    ? "Speak in neutral European Spanish from Spain (es-ES), with natural Castilian pronunciation and peninsular intonation. Use distincion when pronouncing z and c before e or i. Do not use a Latin American accent."
    : locale.startsWith("en")
      ? "Speak in clear, neutral English."
      : "Speak in neutral Metropolitan French from France (fr-FR).";
  return `${languageInstruction} ${STYLE_INSTRUCTIONS[styleId] || STYLE_INSTRUCTIONS.gentle} Read only the exact input text. Do not add any preface, explanation, commentary, question, interpretation or closing words. Do not remove, translate, paraphrase or repeat any word. If the input itself contains a question, read it normally without answering it.`;
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

export const ILLUSTRATION_STYLES = [
  {
    id: "soft_watercolor",
    name: "Aquarelle douce",
    description: "Des couleurs transparentes, des textures de papier et une lumière tendre.",
    palette: ["#e7b9a8", "#f4d9a4", "#a9c9bd"],
    prompt: "Illustration d'album jeunesse à l'aquarelle douce, texture de papier subtile, contours délicats, lumière chaleureuse, couleurs naturelles et poétiques, finition éditoriale imprimable.",
  },
  {
    id: "modern_gouache",
    name: "Gouache moderne",
    description: "Des aplats généreux et un rendu éditorial vivant et chaleureux.",
    palette: ["#ef8354", "#f6bd60", "#5f8f86"],
    prompt: "Illustration d'album jeunesse à la gouache moderne, aplats mats, formes expressives, détails peints à la main, palette chaleureuse, composition éditoriale claire et imprimable.",
  },
  {
    id: "paper_cut",
    name: "Papier découpé",
    description: "Un univers tactile composé de formes superposées et d’ombres légères.",
    palette: ["#d97b73", "#f2cc8f", "#81b29a"],
    prompt: "Illustration d'album jeunesse en papier découpé, couches de papier coloré, bords artisanaux, ombres douces, profondeur légère, formes simples et charmantes, finition propre pour l'impression.",
  },
  {
    id: "pastel_pencil",
    name: "Crayons pastel",
    description: "Un trait sensible et rassurant, proche d’un dessin fait à la main.",
    palette: ["#c9ada7", "#f2e9e4", "#9a8c98"],
    prompt: "Illustration d'album jeunesse aux crayons de couleur et pastels, trait fait main, grain visible, expressions douces, couleurs poudrées, ambiance intime et rassurante, qualité éditoriale.",
  },
  {
    id: "gentle_3d",
    name: "3D douce",
    description: "Des personnages expressifs, des volumes moelleux et une lumière lumineuse.",
    palette: ["#8ecae6", "#ffb703", "#fb8500"],
    prompt: "Illustration 3D douce pour album jeunesse, volumes arrondis, matières moelleuses, personnages très expressifs, lumière cinématographique chaleureuse, couleurs vibrantes sans photoréalisme.",
  },
  {
    id: "enchanted_ink",
    name: "Encre enchantée",
    description: "Des lignes fines, des détails merveilleux et des touches de couleur lumineuses.",
    palette: ["#355070", "#6d597a", "#e56b6f"],
    prompt: "Illustration d'album jeunesse à l'encre fine et lavis coloré, détails merveilleux, lignes élégantes, touches lumineuses, atmosphère magique mais non effrayante, finition éditoriale imprimable.",
  },
];

export function findIllustrationStyle(id) {
  return ILLUSTRATION_STYLES.find((style) => style.id === id) || ILLUSTRATION_STYLES[0];
}

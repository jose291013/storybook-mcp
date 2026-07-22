const REFERENCE_IMAGE = "/assets/examples/styles/reference-child.webp";

export const RENDERING_MODES = [
  {
    id: "photorealistic",
    likeness: "maximum",
    name: "Ressemblance maximale",
    description: "Un visage naturel, proche de la photo, dans un décor de conte réaliste.",
  },
  {
    id: "illustrated_faithful",
    likeness: "strong",
    name: "Illustré et reconnaissable",
    description: "La technique change, mais les proportions et les traits du visage restent fidèles.",
    recommended: true,
  },
  {
    id: "cartoon",
    likeness: "interpreted",
    name: "Cartoon assumé",
    description: "Les traits restent identifiables, avec une transformation artistique plus visible.",
  },
];

const identityRule = "Le médium artistique peut changer, mais pas l'identité : conserver fidèlement la géométrie naturelle du visage, la forme et l'espacement des yeux, le nez, la bouche, les oreilles, la ligne du visage, la coiffure et les signes distinctifs visibles de chaque référence.";

export const ILLUSTRATION_STYLES = [
  {
    id: "photoreal_story",
    renderingMode: "photorealistic",
    likeness: "maximum",
    name: "Conte photoréaliste",
    description: "Peau, visage et lumière naturels dans un monde magique mais crédible.",
    palette: ["#455f55", "#d5a557", "#1f3440"],
    previewImage: "/assets/examples/styles/photoreal_story.webp",
    referenceImage: REFERENCE_IMAGE,
    prompt: `Photographie narrative féerique photoréaliste pour album jeunesse, géométrie naturelle du visage, vraie texture de peau et de tissu, lumière cinématographique crédible, décor magique mais physiquement plausible. ${identityRule} Ne jamais transformer l'enfant en cartoon, poupée, figurine ou rendu CGI; ne pas agrandir les yeux ni lisser artificiellement la peau.`,
  },
  {
    id: "soft_watercolor",
    renderingMode: "illustrated_faithful",
    likeness: "strong",
    name: "Aquarelle douce",
    description: "Des pigments transparents et un visage fidèle, peint avec délicatesse.",
    palette: ["#e7b9a8", "#f4d9a4", "#a9c9bd"],
    previewImage: "/assets/examples/styles/soft_watercolor.webp",
    referenceImage: REFERENCE_IMAGE,
    prompt: `Illustration d'album jeunesse à l'aquarelle douce, texture de papier subtile, pigments transparents, contours délicats, lumière chaleureuse, couleurs naturelles et finition éditoriale imprimable. ${identityRule}`,
  },
  {
    id: "modern_gouache",
    renderingMode: "illustrated_faithful",
    likeness: "strong",
    name: "Gouache moderne",
    description: "Des aplats mats et chaleureux sans remplacer les traits de l'enfant.",
    palette: ["#ef8354", "#f6bd60", "#5f8f86"],
    previewImage: "/assets/examples/styles/modern_gouache.webp",
    referenceImage: REFERENCE_IMAGE,
    prompt: `Illustration d'album jeunesse à la gouache moderne, aplats mats, détails peints à la main, palette chaleureuse, composition éditoriale claire et imprimable, proportions faciales naturelles. ${identityRule}`,
  },
  {
    id: "pastel_pencil",
    renderingMode: "illustrated_faithful",
    likeness: "strong",
    name: "Crayons pastel",
    description: "Un dessin sensible au grain visible, avec des traits reconnaissables.",
    palette: ["#c9ada7", "#f2e9e4", "#9a8c98"],
    previewImage: "/assets/examples/styles/pastel_pencil.webp",
    referenceImage: REFERENCE_IMAGE,
    prompt: `Illustration d'album jeunesse aux crayons de couleur et pastels, trait fait main, grain visible, ombres douces, couleurs poudrées, ambiance intime et qualité éditoriale, proportions faciales naturelles. ${identityRule}`,
  },
  {
    id: "enchanted_ink",
    renderingMode: "illustrated_faithful",
    likeness: "strong",
    name: "Encre enchantée",
    description: "Des lignes fines et des lavis lumineux qui respectent le visage.",
    palette: ["#355070", "#6d597a", "#e56b6f"],
    previewImage: "/assets/examples/styles/enchanted_ink.webp",
    referenceImage: REFERENCE_IMAGE,
    prompt: `Illustration d'album jeunesse à l'encre fine et lavis coloré, lignes élégantes, hachures délicates, touches lumineuses, atmosphère magique non effrayante et finition éditoriale imprimable. ${identityRule}`,
  },
  {
    id: "gentle_3d",
    renderingMode: "cartoon",
    likeness: "interpreted",
    name: "3D cartoon douce",
    description: "Des volumes expressifs : la coiffure et les signes distinctifs restent, le visage est stylisé.",
    palette: ["#8ecae6", "#ffb703", "#fb8500"],
    previewImage: "/assets/examples/styles/gentle_3d.webp",
    referenceImage: REFERENCE_IMAGE,
    prompt: "Illustration 3D cartoon douce pour album jeunesse, volumes arrondis, matières tactiles, lumière cinématographique chaleureuse et couleurs vibrantes, clairement stylisée et non photoréaliste. Préserver la coiffure, la palette, la forme générale du visage et les signes distinctifs visibles, sans copier un style de studio connu. Ne pas utiliser d'yeux géants ni de proportions de bébé.",
  },
  {
    id: "paper_cut",
    renderingMode: "cartoon",
    likeness: "interpreted",
    name: "Papier découpé",
    description: "Un collage tactile qui simplifie volontairement le visage en formes de papier.",
    palette: ["#d97b73", "#f2cc8f", "#81b29a"],
    previewImage: "/assets/examples/styles/paper_cut.webp",
    referenceImage: REFERENCE_IMAGE,
    prompt: "Illustration d'album jeunesse en papier découpé, couches de papier coloré, bords artisanaux, ombres douces, faible profondeur et finition propre pour l'impression. Conserver la coiffure, la palette, la forme générale du visage et les signes distinctifs visibles tout en assumant la simplification graphique du papier découpé.",
  },
];

export function findIllustrationStyle(id) {
  return ILLUSTRATION_STYLES.find((style) => style.id === id)
    || ILLUSTRATION_STYLES.find((style) => style.id === "soft_watercolor");
}

export function findRenderingMode(id) {
  return RENDERING_MODES.find((mode) => mode.id === id) || RENDERING_MODES[1];
}

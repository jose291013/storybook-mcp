export const ALLOWED_PAGE_COUNTS = [24, 28, 32, 36, 40, 44];
export const PAGE_PRICE_EUR = 1.2458;

export function calculateBookPrice(pageCount) {
  return Math.round(normalizePageCount(pageCount) * PAGE_PRICE_EUR * 100) / 100;
}

export const PAGE_COUNT_OPTIONS = ALLOWED_PAGE_COUNTS.map((pageCount) => ({
  pageCount,
  illustrationCount: (pageCount - 2) / 2,
  variationKey: `pages_${pageCount}`,
  priceEur: calculateBookPrice(pageCount),
}));

export const TYPOGRAPHY_OPTIONS = [
  {
    id: "school_round",
    preview: "Il était une fois une grande aventure...",
    description: "Lettres rondes, très lisibles et proches de l'apprentissage de la lecture.",
  },
  {
    id: "handwritten_story",
    preview: "Il était une fois une grande aventure...",
    description: "Une écriture manuscrite douce, comme dans un carnet d'histoires.",
  },
  {
    id: "rounded_playful",
    preview: "Il était une fois une grande aventure...",
    description: "Des lettres rondes et joyeuses, très présentes sans être difficiles à lire.",
  },
  {
    id: "comic_bubble",
    preview: "Il était une fois une grande aventure...",
    description: "Une écriture vive et spontanée, inspirée des albums et bandes dessinées.",
  },
  {
    id: "storybook_bold",
    preview: "Il était une fois une grande aventure...",
    description: "Des formes généreuses et ludiques pour une histoire pleine d'énergie.",
  },
  {
    id: "cursive_magic",
    preview: "Il était une fois une grande aventure...",
    description: "Une écriture cursive élégante pour une ambiance de conte merveilleux.",
  },
];

export const UNIVERSE_OPTIONS = [
  {
    id: "enchanted_forest",
    name: "Foret enchantee",
    description: "Une foret lumineuse peuplee de sentiers secrets, de fleurs brillantes et d'animaux bienveillants.",
    prompt: "une foret enchantee chaleureuse, sentiers moussus, arbres majestueux, fleurs lumineuses et magie douce",
    palette: ["#244f3f", "#f1b85b", "#8bc4a8"],
    previewImage: "/assets/examples/universes/enchanted_forest.webp",
  },
  {
    id: "starry_space",
    name: "Espace etoile",
    description: "Des planetes colorees, des constellations amicales et une aventure cosmique non effrayante.",
    prompt: "un espace etoile merveilleux, planetes colorees, constellations amicales et lumiere cosmique douce",
    palette: ["#252a62", "#7868d8", "#f5ca69"],
    previewImage: "/assets/examples/universes/starry_space.webp",
  },
  {
    id: "coral_ocean",
    name: "Ocean de corail",
    description: "Un monde sous-marin clair et joyeux avec des poissons curieux et des jardins de corail.",
    prompt: "un ocean de corail clair et joyeux, poissons curieux, jardins sous-marins et rayons de soleil turquoise",
    palette: ["#167c8d", "#68c5c0", "#ff9c7d"],
    previewImage: "/assets/examples/universes/coral_ocean.webp",
  },
  {
    id: "cloud_castle",
    name: "Chateau des nuages",
    description: "Un royaume aerien aux ponts de nuages, tours dorees et creatures fantastiques gentilles.",
    prompt: "un chateau merveilleux dans les nuages, tours dorees, ponts aeriens et creatures fantastiques bienveillantes",
    palette: ["#92b7e8", "#f2d087", "#d9b5e8"],
    previewImage: "/assets/examples/universes/cloud_castle.webp",
  },
  {
    id: "dinosaur_valley",
    name: "Vallee des dinosaures",
    description: "Une vallee prehistorique luxuriante avec des dinosaures attachants et aucune scene effrayante.",
    prompt: "une vallee prehistorique luxuriante, dinosaures attachants, fougeres geantes et aventure douce",
    palette: ["#527a45", "#b8cb6b", "#e68a5f"],
    previewImage: "/assets/examples/universes/dinosaur_valley.webp",
  },
  {
    id: "wonder_city",
    name: "Ville merveilleuse",
    description: "Une ville fantastique pleine d'ateliers, de toits colores et de petits passages secrets.",
    prompt: "une ville fantastique chaleureuse, toits colores, ateliers merveilleux, ruelles fleuries et passages secrets",
    palette: ["#4d6f91", "#e88974", "#f0c96d"],
    previewImage: "/assets/examples/universes/wonder_city.webp",
  },
];

export function normalizePageCount(value) {
  const parsed = Number.parseInt(value, 10);
  return ALLOWED_PAGE_COUNTS.includes(parsed) ? parsed : ALLOWED_PAGE_COUNTS[0];
}

export function normalizeTypography(value) {
  return TYPOGRAPHY_OPTIONS.some((option) => option.id === value) ? value : TYPOGRAPHY_OPTIONS[0].id;
}

export function findUniverse(id) {
  return UNIVERSE_OPTIONS.find((option) => option.id === id) || UNIVERSE_OPTIONS[0];
}

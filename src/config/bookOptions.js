export const ALLOWED_PAGE_COUNTS = [24, 28, 32, 36, 40, 44];
export const PRINT_PAGE_PRICE_EUR = 1.2458;
export const EBOOK_PAGE_PRICE_EUR = 0.27875;
export const PAGE_PRICE_EUR = PRINT_PAGE_PRICE_EUR;
export const PRODUCT_TYPES = ["print", "ebook"];
const UNIVERSE_REFERENCE_IMAGE = "/assets/examples/styles/reference-child.webp";

export function calculateBookPrice(pageCount, productType = "print") {
  const unitPrice = productType === "ebook" ? EBOOK_PAGE_PRICE_EUR : PRINT_PAGE_PRICE_EUR;
  return Math.round(normalizePageCount(pageCount) * unitPrice * 100) / 100;
}

export const PAGE_COUNT_OPTIONS = ALLOWED_PAGE_COUNTS.map((pageCount) => ({
  pageCount,
  illustrationCount: (pageCount - 2) / 2,
  variationKey: `pages_${pageCount}`,
  priceEur: calculateBookPrice(pageCount, "print"),
  printPriceEur: calculateBookPrice(pageCount, "print"),
  ebookPriceEur: calculateBookPrice(pageCount, "ebook"),
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
    previewImage: "/assets/examples/universes/enchanted_forest-likeness.webp",
    referenceImage: UNIVERSE_REFERENCE_IMAGE,
    storyContract: {
      id: "enchanted_forest",
      adventureZone: "the established enchanted forest",
      storyBridge: "Real-world passions become useful ways to observe, cooperate, create or make a brave choice inside the forest.",
      entryRule: "Choose one stable origin. If the story starts outside the forest, discover its path or threshold before entering and explain the return.",
      physicalRules: [
        "Paths, distances, carried objects and character locations remain continuous between scenes.",
        "A magical plant, light or creature may help only after its ability is visibly introduced.",
      ],
      requiredMechanisms: [],
      objectRule: "Ordinary personal objects keep one stable state and do not gain unexplained powers.",
    },
  },
  {
    id: "starry_space",
    name: "Espace etoile",
    description: "Des planetes colorees, des constellations amicales et une aventure cosmique non effrayante.",
    prompt: "un espace etoile merveilleux, planetes colorees, constellations amicales et lumiere cosmique douce",
    palette: ["#252a62", "#7868d8", "#f5ca69"],
    previewImage: "/assets/examples/universes/starry_space-likeness.webp",
    referenceImage: UNIVERSE_REFERENCE_IMAGE,
    storyContract: {
      id: "starry_space",
      adventureZone: "a friendly cosmos reached through a protected spacecraft or established magical vessel",
      storyBridge: "Real-world dreams become navigation, teamwork, observation, communication or creation skills during the cosmic mission.",
      entryRule: "Introduce the spacecraft, portal or vessel before launch and show every physical traveler boarding before appearing in space.",
      physicalRules: [
        "Every physical character in open space remains inside a protected breathable environment.",
        "Gravity, movement and communication follow the established vessel or one visible magical rule.",
      ],
      requiredMechanisms: [
        { id: "protected_space_environment", appliesTo: "every physical traveler in space", purpose: "air, pressure and safe movement" },
      ],
      objectRule: "Ordinary devices work only inside the protected cabin unless a space-compatible replacement is introduced.",
    },
  },
  {
    id: "coral_ocean",
    name: "Ocean de corail",
    description: "Un monde sous-marin clair et joyeux avec des poissons curieux et des jardins de corail.",
    prompt: "un ocean de corail clair et joyeux, poissons curieux, jardins sous-marins et rayons de soleil turquoise",
    palette: ["#167c8d", "#68c5c0", "#ff9c7d"],
    previewImage: "/assets/examples/universes/coral_ocean-likeness.webp",
    referenceImage: UNIVERSE_REFERENCE_IMAGE,
    storyContract: {
      id: "coral_ocean",
      adventureZone: "the fully underwater coral ocean",
      storyBridge: "Real-world passions become observation, coordination, courage or mutual-help skills; incompatible real-world activities are not forced literally underwater.",
      entryRule: "Introduce the passage and the stable breathing mechanism before submersion; every physical traveler crosses before appearing in the reef.",
      physicalRules: [
        "Every fully underwater person individually has the same visible breathing mechanism in prose and illustration.",
        "Underwater speech is possible only through the established bubble or communication mechanism.",
        "Water level, buoyancy, refraction and movement remain coherent.",
      ],
      requiredMechanisms: [
        { id: "breathing_and_voice_bubble", appliesTo: "every physical underwater person", purpose: "air and understandable communication" },
      ],
      objectRule: "Ordinary phones and non-waterproof electronics remain dry, stored or absent; they never work loose underwater.",
    },
  },
  {
    id: "cloud_castle",
    name: "Chateau des nuages",
    description: "Un royaume aerien aux ponts de nuages, tours dorees et creatures fantastiques gentilles.",
    prompt: "un chateau merveilleux dans les nuages, tours dorees, ponts aeriens et creatures fantastiques bienveillantes",
    palette: ["#92b7e8", "#f2d087", "#d9b5e8"],
    previewImage: "/assets/examples/universes/cloud_castle-likeness.webp",
    referenceImage: UNIVERSE_REFERENCE_IMAGE,
    storyContract: {
      id: "cloud_castle",
      adventureZone: "a castle and islands above the clouds",
      storyBridge: "The child's interests become ways to plan, cooperate, perform, repair or find a safe route through the sky kingdom.",
      entryRule: "Introduce the airship, staircase, portal or stable cloud path before arrival and name every traveler.",
      physicalRules: [
        "Every elevated route is visibly broad, stable and protected, or uses one introduced flying mechanism.",
        "No child stands at an unprotected edge or falls through clouds.",
      ],
      requiredMechanisms: [
        { id: "safe_sky_route", appliesTo: "every physical traveler between sky locations", purpose: "stable protected travel" },
      ],
      objectRule: "Carried objects remain secured during aerial travel and do not float away without a stated cause.",
    },
  },
  {
    id: "dinosaur_valley",
    name: "Vallee des dinosaures",
    description: "Une vallee prehistorique luxuriante avec des dinosaures attachants et aucune scene effrayante.",
    prompt: "une vallee prehistorique luxuriante, dinosaures attachants, fougeres geantes et aventure douce",
    palette: ["#527a45", "#b8cb6b", "#e68a5f"],
    previewImage: "/assets/examples/universes/dinosaur_valley-likeness.webp",
    referenceImage: UNIVERSE_REFERENCE_IMAGE,
    storyContract: {
      id: "dinosaur_valley",
      adventureZone: "a vast prehistoric valley with giant ferns and gentle dinosaurs",
      storyBridge: "The child's passions become observation, teamwork, pattern recognition or courage while helping the valley's inhabitants.",
      entryRule: "Choose a prehistoric starting world or introduce and cross a passage before any modern traveler appears in the valley.",
      physicalRules: [
        "Giant ferns, dinosaur size and travel distances keep a stable readable scale.",
        "Dinosaurs remain gentle, non-predatory and at a safe distance unless a calm supervised interaction is established.",
      ],
      requiredMechanisms: [],
      objectRule: "Modern objects remain stable, unique and useful only in physically plausible ways unless one visible magical property is introduced.",
    },
  },
  {
    id: "wonder_city",
    name: "Ville merveilleuse",
    description: "Une ville fantastique pleine d'ateliers, de toits colores et de petits passages secrets.",
    prompt: "une ville fantastique chaleureuse, toits colores, ateliers merveilleux, ruelles fleuries et passages secrets",
    palette: ["#4d6f91", "#e88974", "#f0c96d"],
    previewImage: "/assets/examples/universes/wonder_city-likeness.webp",
    referenceImage: UNIVERSE_REFERENCE_IMAGE,
    storyContract: {
      id: "wonder_city",
      adventureZone: "a warm fantasy city of workshops, bridges and secret passages",
      storyBridge: "The child's interests become practical talents for meeting others, solving a civic puzzle, creating or repairing something together.",
      entryRule: "Keep districts and routes continuous. Discover a secret passage before crossing it and explain every arrival in a new district.",
      physicalRules: [
        "Streets, workshops, bridges and interiors retain stable spatial relationships.",
        "Magical machines reveal their function before the child relies on them.",
      ],
      requiredMechanisms: [],
      objectRule: "Tools and devices have one clear function and cannot change hands or abilities without an explicit scene.",
    },
  },
];

export function normalizePageCount(value) {
  const parsed = Number.parseInt(value, 10);
  return ALLOWED_PAGE_COUNTS.includes(parsed) ? parsed : ALLOWED_PAGE_COUNTS[0];
}

export function normalizeProductType(value) {
  return PRODUCT_TYPES.includes(String(value || "").toLowerCase()) ? String(value).toLowerCase() : PRODUCT_TYPES[0];
}

export function normalizeTypography(value) {
  return TYPOGRAPHY_OPTIONS.some((option) => option.id === value) ? value : TYPOGRAPHY_OPTIONS[0].id;
}

export function findUniverse(id) {
  return UNIVERSE_OPTIONS.find((option) => option.id === id) || UNIVERSE_OPTIONS[0];
}

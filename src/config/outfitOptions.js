export const OUTFIT_PREFERENCES = ["auto_universe", "preserve_photo", "selected"];

const OUTFITS = {
  enchanted_forest: [
    { id: "forest_explorer", prompt: "a moss-green explorer jacket, cream top, ochre practical trousers and brown ankle boots" },
    { id: "woodland_storyteller", prompt: "a soft teal cardigan, rust-colored practical trousers and dark green ankle boots" },
    { id: "magical_botanist", prompt: "a leaf-green utility vest over a long-sleeve cream top, brown trousers and sturdy boots" },
  ],
  starry_space: [
    { id: "space_explorer", prompt: "a navy and turquoise child-safe space suit with secured gloves and boots" },
    { id: "cosmic_pilot", prompt: "a deep-blue flight suit with coral piping, secured footwear and a compact safety belt" },
    { id: "star_researcher", prompt: "a plum and silver research suit with practical boots" },
  ],
  coral_ocean: [
    { id: "reef_explorer", prompt: "a turquoise and coral full-body child-safe wetsuit with reef shoes" },
    { id: "ocean_scientist", prompt: "a navy and aqua marine exploration suit with a secured utility belt and reef shoes" },
    { id: "aquatic_adventurer", prompt: "a streamlined teal aquatic suit with warm coral accents and flexible reef shoes" },
  ],
  cloud_castle: [
    { id: "sky_explorer", prompt: "a pale-blue windproof jacket, secured short cape, navy trousers and sturdy cloud-walking boots" },
    { id: "cloud_guardian", prompt: "a cream and gold practical tunic with a secured belt, soft blue trousers and ankle boots" },
    { id: "airship_crew", prompt: "a teal flight suit, warm ochre utility vest and secured boots" },
  ],
  dinosaur_valley: [
    { id: "field_explorer", prompt: "a sand-colored long-sleeve field shirt, olive cargo trousers, sturdy walking boots and a soft sun hat" },
    { id: "fossil_researcher", prompt: "a rust utility vest over a cream top, durable green trousers and brown walking boots" },
    { id: "valley_adventurer", prompt: "a light teal field jacket, ochre practical trousers and sturdy dark boots" },
  ],
  wonder_city: [
    { id: "workshop_apprentice", prompt: "a teal rolled-sleeve top, rust workshop apron, navy trousers and sturdy closed shoes" },
    { id: "city_explorer", prompt: "a coral jacket, cream top, comfortable teal trousers and plain walking shoes" },
    { id: "young_inventor", prompt: "a deep-green utility vest over a cream shirt, ochre trousers and sturdy boots" },
  ],
};

export function outfitOptionsForUniverse(universeId) {
  return OUTFITS[universeId] || OUTFITS.enchanted_forest;
}

export function normalizeOutfitSelection(photo = {}, universeId = "enchanted_forest") {
  const explicit = Object.hasOwn(photo || {}, "outfit_preference") || Object.hasOwn(photo || {}, "outfitPreference");
  if (photo?.role === "mascot") {
    return { preference: "preserve_photo", outfitId: "", resolvedDescription: "", explicit };
  }
  if (!explicit) {
    return {
      preference: "preserve_photo",
      outfitId: "",
      resolvedDescription: "the exact generic, unbranded clothing visible in the private reference photo",
      explicit: false,
    };
  }
  const requestedPreference = String(photo?.outfit_preference || photo?.outfitPreference || "auto_universe").trim().toLowerCase();
  const preference = OUTFIT_PREFERENCES.includes(requestedPreference) ? requestedPreference : "auto_universe";
  const options = outfitOptionsForUniverse(universeId);
  const requestedId = String(photo?.outfit_id || photo?.outfitId || "").trim();
  const selected = options.find((option) => option.id === requestedId) || options[0];
  if (preference === "preserve_photo") {
    return {
      preference,
      outfitId: "",
      resolvedDescription: "the exact generic, unbranded clothing visible in the private reference photo",
      explicit,
    };
  }
  return {
    preference,
    outfitId: preference === "selected" ? selected.id : options[0].id,
    resolvedDescription: selected.prompt,
    explicit,
  };
}

export function outfitCatalogForClient() {
  return Object.fromEntries(Object.entries(OUTFITS).map(([universeId, options]) => [
    universeId,
    options.map(({ id }) => ({ id })),
  ]));
}

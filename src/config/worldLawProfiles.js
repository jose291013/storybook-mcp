export const WORLD_LAW_PROFILES = Object.freeze({
  enchanted_forest: Object.freeze({
    media: ["breathable_air", "breathable_air", "forest_threshold"],
    gravity: "ordinary_gravity", locomotion: ["walk", "climb", "assisted_magic"],
    postures: ["stand", "sit", "kneel", "walk"], survival: [],
    scales: [["person", 0.5, 2.2], ["creature", 0.05, 4], ["landmark", 1, 80]],
    native: ["trees", "moss", "gentle_forest_creatures", "introduced_magic"], forbidden: ["unintroduced_technology", "predatory_threat"],
    capabilities: [["introduced_forest_magic", "magic", "must_be_visibly_introduced_before_use"]],
  }),
  starry_space: Object.freeze({
    media: ["breathable_air", "protected_breathable_space_environment", "sealed_space_boundary"],
    gravity: "vessel_defined_gravity", locomotion: ["walk_inside_habitat", "secured_vehicle_travel"],
    postures: ["stand", "sit", "kneel", "secured_float"], survival: [],
    scales: [["person", 0.5, 2.2], ["vehicle", 2, 500], ["landmark", 10, 1000000]],
    native: ["stars", "planets", "protected_spacecraft", "cosmic_habitat"], forbidden: ["unprotected_person_in_vacuum", "loose_ordinary_electronics_outside_habitat"],
    capabilities: [["protected_space_environment", "technology", "works_only_inside_the_declared_protected_habitat"]],
  }),
  coral_ocean: Object.freeze({
    media: ["breathable_air", "fully_underwater", "passage_transition"],
    gravity: "underwater_buoyancy", locomotion: ["swim", "kneel_on_seabed", "assisted_underwater_walk"],
    postures: ["swim", "float", "kneel", "stand_on_seabed"],
    survival: [Object.freeze({ id: "breathing_voice_bubble", scope: "per_character", activeStateId: "breathing_voice_bubble_worn", inactiveStateId: "breathing_voice_bubble_stored", requiredMediumIds: ["fully_underwater"] })],
    scales: [["person", 0.5, 2.2], ["creature", 0.03, 20], ["landmark", 0.2, 200]],
    native: ["coral", "reef_fish", "underwater_flora", "seabed"], forbidden: ["loose_non_waterproof_electronics", "unprotected_breathing_person"],
    capabilities: [["underwater_voice_bubble", "technology", "one_complete_visible_mechanism_per_physical_person"]],
  }),
  cloud_castle: Object.freeze({
    media: ["breathable_air", "protected_sky_environment", "protected_sky_boundary"],
    gravity: "ordinary_gravity_with_declared_flight", locomotion: ["walk_on_protected_route", "secured_airship", "introduced_flight"],
    postures: ["stand", "sit", "kneel", "secured_flight"], survival: [],
    scales: [["person", 0.5, 2.2], ["vehicle", 2, 300], ["landmark", 1, 1000]],
    native: ["cloud_islands", "protected_bridges", "sky_castle", "gentle_flying_creatures"], forbidden: ["unprotected_edge", "unsupported_fall"],
    capabilities: [["safe_sky_route", "magic_or_technology", "every_elevated_route_is_stable_or_explicitly_supported"]],
  }),
  dinosaur_valley: Object.freeze({
    media: ["breathable_air", "breathable_air", "prehistoric_threshold"],
    gravity: "ordinary_gravity", locomotion: ["walk", "supervised_vehicle_travel"],
    postures: ["stand", "sit", "kneel", "walk"], survival: [],
    scales: [["person", 0.5, 2.2], ["creature", 0.2, 35], ["landmark", 1, 500]],
    native: ["giant_ferns", "gentle_dinosaurs", "prehistoric_valley"], forbidden: ["predatory_attack", "unintroduced_modern_infrastructure"],
    capabilities: [["gentle_dinosaur_interaction", "natural", "calm_supervised_and_at_safe_distance"]],
  }),
  wonder_city: Object.freeze({
    media: ["breathable_air", "breathable_air", "city_passage_threshold"],
    gravity: "ordinary_gravity", locomotion: ["walk", "declared_city_transport"],
    postures: ["stand", "sit", "kneel", "walk"], survival: [],
    scales: [["person", 0.5, 2.2], ["vehicle", 1, 30], ["landmark", 1, 300]],
    native: ["workshops", "bridges", "flowered_streets", "introduced_magical_machines"], forbidden: ["unintroduced_machine_power", "discontinuous_city_route"],
    capabilities: [["introduced_city_machine", "magic_or_technology", "function_must_be_revealed_before_use"]],
  }),
});

export function worldLawProfileForUniverse(universeId) {
  return WORLD_LAW_PROFILES[String(universeId || "")] || null;
}

export const SAFETY_RESOURCE_REGISTRY_VERSION = 1;
export const SAFETY_RESOURCE_LAST_REVIEWED_AT = "2026-07-28";

const UI = {
  FR: {
    countryPrompt: "Dans quel pays se trouve l’enfant actuellement ?",
    countryPlaceholder: "Choisissez le pays actuel",
    immediateDanger: "Si l’enfant ou une autre personne est en danger immédiat, contactez maintenant les services d’urgence du pays où il se trouve.",
    localFallback: "Calitiki n’a pas encore vérifié de coordonnées spécialisées pour ce pays. Contactez les services d’urgence locaux ou un professionnel de santé ou de protection de l’enfance.",
    source: "Source officielle",
    call: "Appeler",
    visit: "Consulter",
    kinds: {
      emergency: "Urgence immédiate",
      crisis: "Crise suicidaire ou détresse aiguë",
      child_protection: "Protection et aide à l’enfance",
    },
    countries: {
      FR: "France",
      ES: "Espagne",
      BE: "Belgique",
      CH: "Suisse",
      GB: "Royaume-Uni",
      US: "États-Unis",
      CA: "Canada",
      EU_OTHER: "Autre pays de l’Union européenne",
      OTHER: "Autre pays",
    },
  },
  ES: {
    countryPrompt: "¿En qué país se encuentra el menor en este momento?",
    countryPlaceholder: "Elige el país actual",
    immediateDanger: "Si el menor u otra persona está en peligro inmediato, contacta ahora con los servicios de emergencia del país donde se encuentra.",
    localFallback: "Calitiki todavía no ha verificado recursos especializados para este país. Contacta con los servicios de emergencia locales o con un profesional sanitario o de protección de menores.",
    source: "Fuente oficial",
    call: "Llamar",
    visit: "Consultar",
    kinds: {
      emergency: "Emergencia inmediata",
      crisis: "Crisis suicida o angustia aguda",
      child_protection: "Protección y ayuda a la infancia",
    },
    countries: {
      FR: "Francia",
      ES: "España",
      BE: "Bélgica",
      CH: "Suiza",
      GB: "Reino Unido",
      US: "Estados Unidos",
      CA: "Canadá",
      EU_OTHER: "Otro país de la Unión Europea",
      OTHER: "Otro país",
    },
  },
  EN: {
    countryPrompt: "Which country is the child currently in?",
    countryPlaceholder: "Choose the current country",
    immediateDanger: "If the child or anyone else is in immediate danger, contact the emergency services in the country where they are now.",
    localFallback: "Calitiki has not yet verified specialist contacts for this country. Contact local emergency services or a health or child-protection professional.",
    source: "Official source",
    call: "Call",
    visit: "Open",
    kinds: {
      emergency: "Immediate emergency",
      crisis: "Suicide crisis or acute distress",
      child_protection: "Child protection and support",
    },
    countries: {
      FR: "France",
      ES: "Spain",
      BE: "Belgium",
      CH: "Switzerland",
      GB: "United Kingdom",
      US: "United States",
      CA: "Canada",
      EU_OTHER: "Another European Union country",
      OTHER: "Another country",
    },
  },
};

const EUROPEAN_EMERGENCY = {
  id: "eu-emergency-112",
  kind: "emergency",
  phone: "112",
  website: "https://digital-strategy.ec.europa.eu/en/policies/112",
  sourceUrl: "https://digital-strategy.ec.europa.eu/en/policies/112",
};

const REGISTRY = {
  FR: [
    EUROPEAN_EMERGENCY,
    {
      id: "fr-crisis-3114",
      kind: "crisis",
      phone: "3114",
      website: "https://3114.fr/",
      sourceUrl: "https://3114.fr/",
    },
    {
      id: "fr-child-protection-119",
      kind: "child_protection",
      phone: "119",
      website: "https://www.allo119.gouv.fr/",
      sourceUrl: "https://www.service-public.fr/particuliers/vosdroits/F781",
    },
  ],
  ES: [
    EUROPEAN_EMERGENCY,
    {
      id: "es-crisis-024",
      kind: "crisis",
      phone: "024",
      website: "https://www.sanidad.gob.es/linea024/home.htm",
      sourceUrl: "https://www.sanidad.gob.es/linea024/home.htm",
    },
    {
      id: "es-child-help-anar",
      kind: "child_protection",
      phone: "900 20 20 10",
      website: "https://www.anar.org/que-hacemos/telefono-chat-anar/",
      sourceUrl: "https://www.anar.org/que-hacemos/telefono-chat-anar/",
    },
  ],
  BE: [
    EUROPEAN_EMERGENCY,
    {
      id: "be-crisis-1813",
      kind: "crisis",
      phone: "1813",
      website: "https://www.zelfmoord1813.be/",
      sourceUrl: "https://www.belgium.be/nl/gezondheid/gezondheidszorg/spoedgevallen",
    },
    {
      id: "be-child-protection-1712",
      kind: "child_protection",
      phone: "1712",
      website: "https://www.1712.be/",
      sourceUrl: "https://www.belgium.be/nl/gezondheid/gezondheidszorg/spoedgevallen",
    },
  ],
  CH: [
    EUROPEAN_EMERGENCY,
    {
      id: "ch-child-crisis-147",
      kind: "child_protection",
      phone: "147",
      website: "https://www.147.ch/fr/",
      sourceUrl: "https://www.projuventute.ch/fr/parents/famille-et-societe/147",
    },
  ],
  GB: [
    {
      id: "gb-emergency-999",
      kind: "emergency",
      phone: "999",
      website: "https://www.nhs.uk/nhs-services/urgent-and-emergency-care-services/when-to-call-999/",
      sourceUrl: "https://www.nhs.uk/nhs-services/urgent-and-emergency-care-services/when-to-call-999/",
    },
    {
      id: "gb-urgent-mental-health-111",
      kind: "crisis",
      phone: "111",
      website: "https://www.nhs.uk/nhs-services/mental-health-services/where-to-get-urgent-help-for-mental-health/",
      sourceUrl: "https://www.nhs.uk/nhs-services/mental-health-services/where-to-get-urgent-help-for-mental-health/",
    },
    {
      id: "gb-childline-08001111",
      kind: "child_protection",
      phone: "0800 1111",
      website: "https://www.childline.org.uk/get-support/contacting-childline/",
      sourceUrl: "https://www.nhs.uk/every-mind-matters/urgent-support/",
    },
  ],
  US: [
    {
      id: "us-emergency-911",
      kind: "emergency",
      phone: "911",
      website: "https://www.samhsa.gov/find-support/in-crisis",
      sourceUrl: "https://www.samhsa.gov/find-support/in-crisis",
    },
    {
      id: "us-crisis-988",
      kind: "crisis",
      phone: "988",
      website: "https://988lifeline.org/",
      sourceUrl: "https://www.samhsa.gov/mental-health/988",
    },
    {
      id: "us-childhelp",
      kind: "child_protection",
      phone: "1-800-422-4453",
      website: "https://www.childhelphotline.org/",
      sourceUrl: "https://www.childwelfare.gov/pubPDFs/educator.pdf",
    },
  ],
  CA: [
    {
      id: "ca-emergency-911",
      kind: "emergency",
      phone: "911",
      website: "https://www.canada.ca/en/public-health/services/suicide-prevention/warning-signs.html",
      sourceUrl: "https://www.canada.ca/en/public-health/services/suicide-prevention/warning-signs.html",
    },
    {
      id: "ca-crisis-988",
      kind: "crisis",
      phone: "988",
      website: "https://988.ca/",
      sourceUrl: "https://www.canada.ca/en/public-health/services/suicide-prevention/warning-signs.html",
    },
    {
      id: "ca-kids-help-phone",
      kind: "child_protection",
      phone: "1-800-668-6868",
      website: "https://kidshelpphone.ca/",
      sourceUrl: "https://www.canada.ca/en/public-health/services/suicide-prevention/warning-signs.html",
    },
  ],
  EU_OTHER: [EUROPEAN_EMERGENCY],
  OTHER: [],
};

export function normalizeSafetyCountry(value) {
  const country = String(value || "").trim().toUpperCase();
  return Object.hasOwn(REGISTRY, country) ? country : "";
}

export function safetyCountryOptions(locale = "FR") {
  const language = UI[locale] ? locale : "FR";
  return Object.keys(REGISTRY).map((code) => ({
    code,
    label: UI[language].countries[code],
  }));
}

export function localizedSafetyResources({ countryCode = "", locale = "FR" } = {}) {
  const language = UI[locale] ? locale : "FR";
  const copy = UI[language];
  const country = normalizeSafetyCountry(countryCode);
  const resources = country
    ? REGISTRY[country].map((resource) => ({
      ...resource,
      label: copy.kinds[resource.kind],
      callLabel: copy.call,
      visitLabel: copy.visit,
      sourceLabel: copy.source,
    }))
    : [];

  return {
    version: SAFETY_RESOURCE_REGISTRY_VERSION,
    reviewedAt: SAFETY_RESOURCE_LAST_REVIEWED_AT,
    countryCode: country,
    countryRequired: !country,
    countryPrompt: copy.countryPrompt,
    countryPlaceholder: copy.countryPlaceholder,
    immediateDanger: copy.immediateDanger,
    fallbackMessage: country && resources.length ? "" : copy.localFallback,
    countries: safetyCountryOptions(language),
    resources,
  };
}

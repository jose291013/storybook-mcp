import { translate } from "./i18n.js";

const initialUrl = new URL(window.location.href);
const queryLocale = String(initialUrl.searchParams.get("uiLanguage") || "").toUpperCase();
let referrerLocale = "";
try {
  const referrer = new URL(document.referrer);
  if (referrer.hostname === "calitiki.com" || referrer.hostname.endsWith(".calitiki.com")) {
    referrerLocale = ({ fr: "FR", es: "ES", en: "EN" })[referrer.pathname.split("/").filter(Boolean)[0]] || "FR";
  }
} catch { referrerLocale = ""; }
const requestedUiLanguage = ["FR", "ES", "EN"].includes(queryLocale) ? queryLocale : referrerLocale;

const STOREFRONT_RETURN_KEY = "calitiki-storefront-return-v1";
const FLOW_VERSION = 3;
const STEP_COUNT = 7;
const REVIEW_STEP = 6;

function safeCalitikiReturnUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const isCalitikiHost = url.hostname === "calitiki.com" || url.hostname.endsWith(".calitiki.com");
    if (url.protocol !== "https:" || !isCalitikiHost) return "";
    return `${url.origin}${url.pathname}`;
  } catch {
    return "";
  }
}

try {
  const referrer = new URL(document.referrer);
  const safeReferrer = safeCalitikiReturnUrl(referrer.href);
  if (safeReferrer && !referrer.searchParams.has("calitiki_connect")) sessionStorage.setItem(STOREFRONT_RETURN_KEY, safeReferrer);
} catch {
  // A direct visit to the creator uses the localized storefront fallback.
}

function storefrontReturnUrl(locale) {
  let remembered = "";
  try { remembered = safeCalitikiReturnUrl(sessionStorage.getItem(STOREFRONT_RETURN_KEY)); } catch { remembered = ""; }
  if (remembered && new URL(remembered).pathname !== "/") return remembered;
  if (locale === "ES") return "https://calitiki.com/es/";
  if (locale === "EN") return "https://calitiki.com/en/";
  return "https://calitiki.com/";
}

const state = {
  config: null,
  locale: requestedUiLanguage || localStorage.getItem("storybook-ui-language") || "FR",
  step: 0,
  selectedStyle: "",
  selectedUniverse: "",
  storyIntentions: [],
  storyIntentionsBusy: false,
  storySuggestions: [],
  storySuggestionMode: "",
  storySuggestionsBusy: false,
  fontStyle: "school_round",
  pageCount: 24,
  productType: "ebook",
  photos: [],
  jobId: "",
  projectId: "",
  previewComplete: false,
  awaitingPreviewConfirmation: false,
  storyScenario: null,
  storyScenarioBusy: false,
  storyScenarioUpdateFailed: false,
  storyScenarioDirty: false,
  storyScenarioAddedCharacters: [],
  referenceRecoveryMode: false,
  referenceRecoveryAvailable: false,
  currentPreview: null,
  readerGoToPage: null,
  previewModification: null,
  previewModificationQuote: null,
  previewModificationPoll: null,
  creditSummary: null,
  customerSession: { authenticated: false, customer: null },
};

const LOCAL_DRAFT_KEY = "storybook-anonymous-draft-v1";
const PENDING_PREVIEW_KEY = "storybook-pending-preview-v1";
const PENDING_CREDIT_PURCHASE_KEY = "storybook-pending-credit-purchase-v1";
let localDraftTimer;

function consumeNewBookRequest() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("newBook")) return false;
  localStorage.removeItem(LOCAL_DRAFT_KEY);
  localStorage.removeItem(PENDING_PREVIEW_KEY);
  localStorage.removeItem(PENDING_CREDIT_PURCHASE_KEY);
  url.searchParams.delete("newBook");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  return true;
}

const newBookRequested = consumeNewBookRequest();
const requestedProductType = ["ebook", "print"].includes(initialUrl.searchParams.get("productType")) ? initialUrl.searchParams.get("productType") : "";

const elements = {
  form: document.querySelector("#bookForm"), childQuestions: document.querySelector("#childQuestions"), storyQuestions: document.querySelector("#storyQuestions"),
  styleGrid: document.querySelector("#styleGrid"), universeGrid: document.querySelector("#universeGrid"), universeSelectionSummary: document.querySelector("#universeSelectionSummary"), intentionExampleList: document.querySelector("#intentionExampleList"), interpretIntentionButton: document.querySelector("#interpretIntentionButton"), intentionLoading: document.querySelector("#intentionLoading"), storyIntentionGrid: document.querySelector("#storyIntentionGrid"), intentionChoiceStatus: document.querySelector("#intentionChoiceStatus"), adventureProposals: document.querySelector("#adventureProposals"), suggestionUniverseSummary: document.querySelector("#suggestionUniverseSummary"), suggestionLoading: document.querySelector("#suggestionLoading"), storySuggestionGrid: document.querySelector("#storySuggestionGrid"), refreshStorySuggestions: document.querySelector("#refreshStorySuggestions"), customStoryChoice: document.querySelector("#customStoryChoice"), suggestionChoiceStatus: document.querySelector("#suggestionChoiceStatus"), selectedSuggestionSummary: document.querySelector("#selectedSuggestionSummary"), fontGrid: document.querySelector("#fontGrid"), productTypeGrid: document.querySelector("#productTypeGrid"), pageCountGrid: document.querySelector("#pageCountGrid"),
  photoInput: document.querySelector("#photoInput"), photoDropZone: document.querySelector("#photoDropZone"), photoList: document.querySelector("#photoList"), photoCount: document.querySelector("#photoCount"),
  reviewCard: document.querySelector("#reviewCard"), prevButton: document.querySelector("#prevButton"), nextButton: document.querySelector("#nextButton"), formError: document.querySelector("#formError"),
  generationPanel: document.querySelector("#generationPanel"), generationKicker: document.querySelector("#generationKicker"), generationTitle: document.querySelector("#generationTitle"), generationMessage: document.querySelector("#generationMessage"), generationNextStep: document.querySelector("#generationNextStep"), generationBar: document.querySelector("#generationBar"), generationStep: document.querySelector("#generationStep"), resultSection: document.querySelector("#resultSection"), bookPreview: document.querySelector("#bookPreview"),
  visualProofPanel: document.querySelector("#visualProofPanel"), visualProofKicker: document.querySelector("#visualProofKicker"), visualProofTitle: document.querySelector("#visualProofTitle"), visualProofLead: document.querySelector("#visualProofLead"), visualProofChecklist: document.querySelector("#visualProofChecklist"), visualProofImage: document.querySelector("#visualProofImage"), visualProofNote: document.querySelector("#visualProofNote"), visualProofFeedback: document.querySelector("#visualProofFeedback"), approveVisualProofButton: document.querySelector("#approveVisualProofButton"), regenerateVisualProofButton: document.querySelector("#regenerateVisualProofButton"),
  notifyPreviewEmail: document.querySelector("#notifyPreviewEmail"), generationFailurePanel: document.querySelector("#generationFailurePanel"), retryPreviewButton: document.querySelector("#retryPreviewButton"), generationFailureSupport: document.querySelector("#generationFailureSupport"),
  qualityReviewNotice: document.querySelector("#qualityReviewNotice"), qualityReviewKicker: document.querySelector("#qualityReviewKicker"), qualityReviewTitle: document.querySelector("#qualityReviewTitle"), qualityReviewMessage: document.querySelector("#qualityReviewMessage"), qualityReviewPages: document.querySelector("#qualityReviewPages"), qualityReviewSupport: document.querySelector("#qualityReviewSupport"),
  mobileStepLabel: document.querySelector("#mobileStepLabel"), mobileProgressBar: document.querySelector("#mobileProgressBar"), uiLanguage: document.querySelector("#uiLanguage"), storefrontReturnLink: document.querySelector("#storefrontReturnLink"), creditReturnNotice: document.querySelector("#creditReturnNotice"), costNote: document.querySelector("#costNote"),
  heroStartingPrice: document.querySelector("#heroStartingPrice"), heroPageRange: document.querySelector("#heroPageRange"), resultTitle: document.querySelector("#resultTitle"),
  accountStatus: document.querySelector("#accountStatus"), logoutButton: document.querySelector("#logoutButton"), newBookButton: document.querySelector("#newBookButton"), resultNewBookButton: document.querySelector("#resultNewBookButton"), headerCreditBalance: document.querySelector("#headerCreditBalance"), headerCreditBalanceValue: document.querySelector("#headerCreditBalanceValue"),
  creditPanel: document.querySelector("#creditPanel"), previewCreditPrice: document.querySelector("#previewCreditPrice"), creditBalance: document.querySelector("#creditBalance"), creditMissing: document.querySelector("#creditMissing"), promoCodeInput: document.querySelector("#promoCodeInput"), redeemPromoButton: document.querySelector("#redeemPromoButton"), buyCreditsLink: document.querySelector("#buyCreditsLink"), creditFeedback: document.querySelector("#creditFeedback"), confirmPreviewButton: document.querySelector("#confirmPreviewButton"), previewActionCenter: document.querySelector("#previewActionCenter"), previewRebateText: document.querySelector("#previewRebateText"), actionRecoverReferences: document.querySelector("#actionRecoverReferences"), actionReadInteractive: document.querySelector("#actionReadInteractive"), actionBuyCredits: document.querySelector("#actionBuyCredits"), actionRequestChange: document.querySelector("#actionRequestChange"), actionBuyEbook: document.querySelector("#actionBuyEbook"), actionBuyPrint: document.querySelector("#actionBuyPrint"),
  previewModificationPanel: document.querySelector("#previewModificationPanel"), closeModificationPanel: document.querySelector("#closeModificationPanel"), modificationSpread: document.querySelector("#modificationSpread"), modificationInstruction: document.querySelector("#modificationInstruction"), modificationPrice: document.querySelector("#modificationPrice"), modificationBalance: document.querySelector("#modificationBalance"), modificationMissing: document.querySelector("#modificationMissing"), modificationBuyCredits: document.querySelector("#modificationBuyCredits"), submitModification: document.querySelector("#submitModification"), approveModification: document.querySelector("#approveModification"), rejectModification: document.querySelector("#rejectModification"), modificationStatus: document.querySelector("#modificationStatus"),
  seriesDraftNotice: document.querySelector("#seriesDraftNotice"),
  storyScenarioPanel: document.querySelector("#storyScenarioPanel"), storyScenarioKicker: document.querySelector("#storyScenarioKicker"), storyScenarioTitle: document.querySelector("#storyScenarioTitle"), storyScenarioSummary: document.querySelector("#storyScenarioSummary"), scenarioWorldContract: document.querySelector("#scenarioWorldContract"), scenarioPreparingState: document.querySelector("#scenarioPreparingState"), scenarioPreparingLead: document.querySelector("#scenarioPreparingLead"), scenarioPreparingSteps: document.querySelector("#scenarioPreparingSteps"), scenarioPreparationFeedback: document.querySelector("#scenarioPreparationFeedback"), retryInitialScenarioButton: document.querySelector("#retryInitialScenarioButton"), scenarioReviewContent: document.querySelector("#scenarioReviewContent"), scenarioDiagnostics: document.querySelector("#scenarioDiagnostics"), scenarioDiagnosticList: document.querySelector("#scenarioDiagnosticList"), scenarioClarifications: document.querySelector("#scenarioClarifications"), scenarioQuestionList: document.querySelector("#scenarioQuestionList"), scenarioNewCharacterName: document.querySelector("#scenarioNewCharacterName"), scenarioAddCharacterButton: document.querySelector("#scenarioAddCharacterButton"), scenarioActs: document.querySelector("#scenarioActs"), scenarioFeedback: document.querySelector("#scenarioFeedback"), reviseScenarioButton: document.querySelector("#reviseScenarioButton"), approveScenarioButton: document.querySelector("#approveScenarioButton"), scenarioStatus: document.querySelector("#scenarioStatus"), scenarioFeedbackMessage: document.querySelector("#scenarioFeedbackMessage"),
};

class TechnicalGenerationError extends Error {
  constructor(message, code = "preview_generation_failed") { super(message); this.code = code; this.technical = true; }
}

const IMPROVABLE_QUESTION_IDS = new Set(["favorite_activities", "personality", "dream", "challenge", "message", "signature_object", "important_people", "extra_notes"]);

const INTENTION_EXAMPLES = {
  FR: ["Il abandonne quand quelque chose lui paraît difficile.", "Elle n'ose pas aller vers les autres.", "Il aimerait apprendre quelque chose, mais il a peur de ne pas réussir.", "Je ne sais pas exactement : aidez-moi à trouver."],
  ES: ["Abandona cuando algo le parece difícil.", "No se atreve a acercarse a los demás.", "Le gustaría aprender algo, pero teme no conseguirlo.", "No lo sé exactamente: ayúdame a encontrarlo."],
  EN: ["They give up when something feels difficult.", "They do not dare to approach other children.", "They would like to learn something but fear not succeeding.", "I am not quite sure: help me work it out."],
};

const QUESTION_TEXT = {
  FR: {
    hero_name: ["Comment s'appelle l'enfant ?", "Le prénom qui apparaîtra dans l'histoire."], age: ["Quel âge a l'enfant ?", "Cela adapte la longueur des phrases et le vocabulaire."], favorite_activities: ["Qu'est-ce qu'il ou elle adore faire ?", "Jeux, passions, animaux, musique, sport ou activité favorite."], personality: ["Quels mots décrivent le mieux l'enfant ?", "Par exemple : curieux, drôle, sensible, courageux ou rêveur."], dream: ["Quel objectif lui donnera envie d'avancer ?", "Ce souhait devient l'objectif concret du héros."], challenge: ["Qu'est-ce qui pourrait le faire hésiter ?", "Une peur ou un doute protecteur, jamais présenté comme un défaut."], message: ["Qu'aimeriez-vous qu'il découvre grâce à ses essais ?", "Par exemple : chaque tentative me fait avancer."], signature_object: ["Quel objet spécial doit accompagner l'enfant ?", "Un doudou, un sac, un instrument ou un objet inventé."], important_people: ["Qui doit l'accompagner dans l'histoire ?", "Mascotte, ami, frère, sœur ou autre proche."],
  },
  ES: {
    hero_name: ["¿Cómo se llama el niño?", "El nombre que aparecerá en la historia."], age: ["¿Qué edad tiene?", "Adapta el vocabulario y la longitud de las frases."], favorite_activities: ["¿Qué le encanta hacer?", "Juegos, aficiones, animales, música o deporte."], personality: ["¿Qué palabras le describen mejor?", "Por ejemplo: curioso, divertido, sensible o valiente."], dream: ["¿Qué objetivo le dará ganas de avanzar?", "Este deseo se convierte en el objetivo concreto del protagonista."], challenge: ["¿Qué podría hacerle dudar?", "Un miedo o duda protectora, nunca presentada como un defecto."], message: ["¿Qué te gustaría que descubriera gracias a sus intentos?", "Por ejemplo: cada intento me ayuda a avanzar."], signature_object: ["¿Qué objeto especial debe acompañarle?", "Un peluche, bolso, instrumento u objeto inventado."], important_people: ["¿Quién debe acompañarle en la historia?", "Mascota, amigo, hermano, hermana u otro ser querido."],
  },
  EN: {
    hero_name: ["What is the child's name?", "The name that will appear in the story."], age: ["How old is the child?", "This adapts vocabulary and sentence length."], favorite_activities: ["What do they love doing?", "Games, hobbies, animals, music, sport or a favorite activity."], personality: ["Which words describe the child best?", "For example: curious, funny, sensitive, brave or dreamy."], dream: ["What goal will make them want to move forward?", "This wish becomes the hero's concrete goal."], challenge: ["What might make them hesitate?", "A protective fear or doubt, never presented as a flaw."], message: ["What would you like them to discover through their attempts?", "For example: every attempt helps me move forward."], signature_object: ["What special object should travel with the child?", "A comfort toy, bag, instrument or invented object."], important_people: ["Who should join them in the story?", "A mascot, friend, sibling or another loved one."],
  },
};

const STYLE_TEXT = {
  photoreal_story: { FR: ["Conte photoréaliste", "Peau, visage et lumière naturels dans un monde magique crédible."], ES: ["Cuento fotorrealista", "Piel, rostro y luz naturales en un mundo mágico creíble."], EN: ["Photoreal story", "Natural skin, face and light in a believable magical world."] },
  soft_watercolor: { FR: ["Aquarelle douce", "Pigments transparents et visage fidèle, peint avec délicatesse."], ES: ["Acuarela suave", "Pigmentos transparentes y un rostro fiel, pintado con delicadeza."], EN: ["Soft watercolor", "Transparent pigments and a faithful face, painted delicately."] },
  modern_gouache: { FR: ["Gouache moderne", "Aplats mats et chaleureux sans remplacer les traits de l'enfant."], ES: ["Gouache moderno", "Colores mates y cálidos sin sustituir los rasgos del niño."], EN: ["Modern gouache", "Warm matte color without replacing the child's features."] },
  paper_cut: { FR: ["Papier découpé", "Collage tactile qui simplifie volontairement le visage."], ES: ["Papel recortado", "Collage táctil que simplifica el rostro de forma intencionada."], EN: ["Paper cut", "A tactile collage that deliberately simplifies the face."] },
  pastel_pencil: { FR: ["Crayons pastel", "Trait au grain visible, avec des caractéristiques reconnaissables."], ES: ["Lápices pastel", "Trazo de grano visible con rasgos reconocibles."], EN: ["Pastel pencils", "Visible pencil grain with recognizable features."] },
  gentle_3d: { FR: ["3D cartoon douce", "Coiffure et signes distinctifs conservés, avec un visage volontairement stylisé."], ES: ["3D cartoon suave", "Conserva el peinado y los rasgos distintivos con un rostro estilizado."], EN: ["Soft cartoon 3D", "Keeps the hairstyle and key markers with a deliberately stylized face."] },
  enchanted_ink: { FR: ["Encre enchantée", "Lignes fines et lavis lumineux qui respectent le visage."], ES: ["Tinta encantada", "Líneas finas y aguadas luminosas que respetan el rostro."], EN: ["Enchanted ink", "Fine lines and luminous washes that preserve the face."] },
};

const STYLE_MODE_TEXT = {
  photorealistic: { FR: ["Ressemblance maximale", "Le choix le plus proche d'une vraie photo."], ES: ["Semejanza máxima", "La opción más cercana a una foto real."], EN: ["Maximum likeness", "The choice closest to a real photograph."] },
  illustrated_faithful: { FR: ["Illustré et reconnaissable", "Recommandé · La technique change, pas l'identité."], ES: ["Ilustrado y reconocible", "Recomendado · Cambia la técnica, no la identidad."], EN: ["Illustrated and recognizable", "Recommended · The medium changes, not the identity."] },
  cartoon: { FR: ["Cartoon assumé", "Une transformation artistique plus visible."], ES: ["Cartoon definido", "Una transformación artística más visible."], EN: ["Clearly cartoon", "A more visible artistic transformation."] },
};

const STYLE_UI_TEXT = {
  FR: { lead: "Choisissez d'abord le niveau de réalisme, puis la technique. Survolez un exemple pour comparer avec la même photo fictive.", before: "PHOTO DE RÉFÉRENCE", after: "RENDU DU LIVRE", maximum: "Ressemblance maximale", strong: "Forte ressemblance", interpreted: "Traits interprétés", show: "Voir la photo de référence", hide: "Voir le rendu" },
  ES: { lead: "Elige primero el nivel de realismo y después la técnica. Pasa sobre un ejemplo para compararlo con la misma foto ficticia.", before: "FOTO DE REFERENCIA", after: "RESULTADO DEL LIBRO", maximum: "Semejanza máxima", strong: "Gran semejanza", interpreted: "Rasgos interpretados", show: "Ver la foto de referencia", hide: "Ver el resultado" },
  EN: { lead: "Choose the level of realism first, then the medium. Hover over an example to compare it with the same fictional photo.", before: "REFERENCE PHOTO", after: "BOOK RENDER", maximum: "Maximum likeness", strong: "Strong likeness", interpreted: "Interpreted features", show: "View reference photo", hide: "View book render" },
};

const VISUAL_PROOF_TEXT = {
  FR: { kicker: "PREUVE VISUELLE", title: "Vérifiez le visage et le rendu avant les autres illustrations", lead: "Cette couverture utilise votre style et vos références. Le reste du livre ne sera illustré qu'après votre validation.", checks: ["Le personnage est-il reconnaissable ?", "Le niveau de réalisme correspond-il à votre choix ?", "La technique vous convient-elle pour tout le livre ?"], approve: "Valider et illustrer le livre", regenerate: "Réessayer cette couverture", note: "Un nouvel essai de couverture est inclus. Il ne consomme pas un second crédit.", limit: "Le nouvel essai inclus a été utilisé. Validez cette couverture ou contactez Calitiki avant de poursuivre.", working: "Calitiki prépare votre demande…", alt: "Couverture d'essai à valider" },
  ES: { kicker: "PRUEBA VISUAL", title: "Comprueba el rostro y el acabado antes de las demás ilustraciones", lead: "Esta portada utiliza tu estilo y tus referencias. El resto del libro solo se ilustrará después de tu aprobación.", checks: ["¿El personaje es reconocible?", "¿El nivel de realismo corresponde a tu elección?", "¿Te gusta esta técnica para todo el libro?"], approve: "Aprobar e ilustrar el libro", regenerate: "Reintentar esta portada", note: "Se incluye un nuevo intento de portada. No consume un segundo crédito.", limit: "Ya se ha utilizado el nuevo intento incluido. Aprueba esta portada o contacta con Calitiki.", working: "Calitiki está preparando tu solicitud…", alt: "Portada de prueba para aprobar" },
  EN: { kicker: "VISUAL PROOF", title: "Check the face and rendering before the remaining illustrations", lead: "This cover uses your selected style and references. The rest of the book will only be illustrated after your approval.", checks: ["Is the character recognizable?", "Does the realism level match your choice?", "Would you like this medium across the whole book?"], approve: "Approve and illustrate the book", regenerate: "Retry this cover", note: "One additional cover proof is included. It does not use a second credit.", limit: "The included retry has been used. Approve this cover or contact Calitiki before continuing.", working: "Calitiki is preparing your request…", alt: "Cover proof awaiting approval" },
};

const QUALITY_REVIEW_TEXT = {
  FR: {
    kicker: "VÉRIFICATION DE QUALITÉ",
    title: "Votre livre est conservé, quelques illustrations doivent encore être vérifiées",
    message: "Toutes les pages ont été créées. Calitiki a isolé les illustrations ci-dessous au lieu d’interrompre ou de recommencer votre livre.",
    page: "Page {page} · vérification en cours",
    support: "Aucun achat n’est possible tant que ces pages ne sont pas validées. Votre crédit reste réservé, il n’est pas débité une seconde fois.",
    badge: "Illustration en vérification",
    reason: "Vérifiez que les personnages et l’action correspondent bien au texte.",
    view: "Voir cette page",
    approve: "Conserver cette illustration",
    repair: "Créer une proposition alternative gratuite",
    detectedTitle: "Pourquoi Calitiki vous demande de vérifier :",
    issueMissing: "Un personnage prévu dans cette scène semble absent.",
    issueAction: "L’action principale ne semble pas assez fidèle au texte.",
    issueFusion: "Deux personnages ou leurs traits semblent avoir été mélangés.",
    issueGeneric: "La composition visuelle ne permet pas de confirmer toute la scène avec suffisamment de certitude.",
    instructionLabel: "Que souhaitez-vous améliorer ? (facultatif)",
    instructionPlaceholder: "Par exemple : montrer plus clairement la présence de Maman, tout en gardant la même scène.",
    instructionHelp: "Votre indication guide le rendu visuel, sans modifier le scénario, les personnages prévus ni l’action.",
    current: "Illustration actuelle",
    proposed: "Nouvelle proposition",
    candidateReady: "La nouvelle proposition est prête. Comparez les deux images avant de choisir.",
    keepOriginal: "Conserver l’originale",
    useCandidate: "Utiliser la nouvelle",
    keepConfirm: "Conserver l’illustration actuelle et écarter la nouvelle proposition pour cette page ? Les deux resteront archivées dans le projet.",
    useConfirm: "Remplacer l’illustration actuelle par cette nouvelle proposition ? L’originale reste conservée dans l’historique du projet.",
    approveConfirm: "Confirmez-vous que cette illustration vous convient ? Cette décision permettra de poursuivre lorsque toutes les pages seront validées.",
    approving: "Validation en cours…",
    repairing: "Création d’une nouvelle proposition pour la page {page}… L’illustration actuelle reste inchangée.",
    choosing: "Enregistrement de votre choix…",
    repairExhausted: "La correction automatique n’a pas suffi. Vous pouvez accepter l’image si elle vous convient ou contacter Calitiki.",
    actionError: "La décision n’a pas pu être enregistrée. Votre livre reste conservé ; réessayez.",
  },
  ES: {
    kicker: "CONTROL DE CALIDAD",
    title: "Tu libro está guardado; aún debemos revisar algunas ilustraciones",
    message: "Todas las páginas han sido creadas. Calitiki ha aislado las ilustraciones indicadas en lugar de interrumpir o reiniciar el libro.",
    page: "Página {page} · revisión en curso",
    support: "No se puede comprar el libro hasta validar estas páginas. Tu crédito sigue reservado y no se cobrará una segunda vez.",
    badge: "Ilustración en revisión",
    reason: "Comprueba que los personajes y la acción correspondan al texto.",
    view: "Ver esta página",
    approve: "Conservar esta ilustración",
    repair: "Crear una propuesta alternativa gratuita",
    detectedTitle: "Por qué Calitiki te pide que la revises:",
    issueMissing: "Parece faltar un personaje previsto en esta escena.",
    issueAction: "La acción principal no parece suficientemente fiel al texto.",
    issueFusion: "Dos personajes o sus rasgos parecen haberse mezclado.",
    issueGeneric: "La composición visual no permite confirmar toda la escena con suficiente seguridad.",
    instructionLabel: "¿Qué te gustaría mejorar? (opcional)",
    instructionPlaceholder: "Por ejemplo: mostrar más claramente la presencia de Mamá, manteniendo la misma escena.",
    instructionHelp: "Tu indicación guía el resultado visual sin cambiar el guion, los personajes previstos ni la acción.",
    current: "Ilustración actual",
    proposed: "Nueva propuesta",
    candidateReady: "La nueva propuesta está lista. Compara las dos imágenes antes de elegir.",
    keepOriginal: "Conservar la original",
    useCandidate: "Usar la nueva",
    keepConfirm: "¿Conservar la ilustración actual y descartar la nueva propuesta para esta página? Ambas quedarán archivadas en el proyecto.",
    useConfirm: "¿Sustituir la ilustración actual por esta nueva propuesta? La original seguirá guardada en el historial del proyecto.",
    approveConfirm: "¿Confirmas que esta ilustración te gusta? El libro podrá continuar cuando se validen todas las páginas.",
    approving: "Validando…",
    repairing: "Creando una nueva propuesta para la página {page}… La ilustración actual no cambiará.",
    choosing: "Guardando tu elección…",
    repairExhausted: "La corrección automática no ha sido suficiente. Puedes aceptar la imagen si te gusta o contactar con Calitiki.",
    actionError: "No se ha podido guardar la decisión. Tu libro sigue guardado; inténtalo de nuevo.",
  },
  EN: {
    kicker: "QUALITY REVIEW",
    title: "Your book is safely saved; a few illustrations still need review",
    message: "Every page has been created. Calitiki isolated the illustrations below instead of interrupting or rebuilding your book.",
    page: "Page {page} · review in progress",
    support: "Purchase remains unavailable until these pages are approved. Your credit stays reserved and will not be charged a second time.",
    badge: "Illustration under review",
    reason: "Check that the characters and main action match the text.",
    view: "View this page",
    approve: "Keep this illustration",
    repair: "Create a free alternative",
    detectedTitle: "Why Calitiki is asking you to review it:",
    issueMissing: "A character expected in this scene appears to be missing.",
    issueAction: "The main action may not match the story closely enough.",
    issueFusion: "Two characters or their features appear to have been mixed.",
    issueGeneric: "The visual composition does not let Calitiki confirm the whole scene with enough confidence.",
    instructionLabel: "What would you like to improve? (optional)",
    instructionPlaceholder: "For example: show Mum more clearly while keeping the same scene.",
    instructionHelp: "Your note guides the visual result without changing the approved story, cast or action.",
    current: "Current illustration",
    proposed: "New proposal",
    candidateReady: "The new proposal is ready. Compare both images before choosing.",
    keepOriginal: "Keep the original",
    useCandidate: "Use the new one",
    keepConfirm: "Keep the current illustration and reject the new proposal for this page? Both will remain archived in the project.",
    useConfirm: "Replace the current illustration with this new proposal? The original remains preserved in the project history.",
    approveConfirm: "Do you confirm that this illustration works for you? The book can continue once every page is approved.",
    approving: "Saving approval…",
    repairing: "Creating a new proposal for page {page}… The current illustration remains unchanged.",
    choosing: "Saving your choice…",
    repairExhausted: "The automatic correction was not sufficient. You may accept the image if it works for you or contact Calitiki.",
    actionError: "The decision could not be saved. Your book remains safe; please retry.",
  },
};

const GENERATION_STAGE_TEXT = {
  FR: {
    cover: { kicker: "COUVERTURE EN PRÉPARATION", title: "Calitiki prépare d’abord votre couverture", message: "Nous écrivons le livre et créons une première couverture avec votre style et vos références.", next: "Prochaine étape : vous devrez valider cette couverture avant que les illustrations intérieures ne commencent. Vous pouvez laisser cette page ouverte ou revenir plus tard depuis Mes créations Calitiki." },
    regenerate: { kicker: "NOUVELLE COUVERTURE", title: "Calitiki prépare votre nouvel essai", message: "Le style et les références restent identiques pendant la création de cette seconde proposition.", next: "Vous devrez valider cette nouvelle couverture avant que les illustrations intérieures ne commencent." },
    interior: { kicker: "ILLUSTRATIONS EN COURS", title: "Votre couverture est validée", message: "Calitiki crée maintenant les pages intérieures à partir du scénario et de la couverture approuvés.", next: "Vous pouvez laisser cette page ouverte ou revenir plus tard depuis Mes créations Calitiki. Aucun autre choix n’est requis avant l’aperçu complet." },
  },
  ES: {
    cover: { kicker: "PORTADA EN PREPARACIÓN", title: "Calitiki prepara primero tu portada", message: "Estamos escribiendo el libro y creando una primera portada con tu estilo y tus referencias.", next: "Siguiente paso: tendrás que aprobar esta portada antes de que empiecen las ilustraciones interiores. Puedes dejar esta página abierta o volver más tarde desde Mis creaciones Calitiki." },
    regenerate: { kicker: "NUEVA PORTADA", title: "Calitiki prepara tu nuevo intento", message: "El estilo y las referencias se mantienen durante la creación de esta segunda propuesta.", next: "Tendrás que aprobar esta nueva portada antes de que empiecen las ilustraciones interiores." },
    interior: { kicker: "ILUSTRACIONES EN CURSO", title: "Tu portada está aprobada", message: "Calitiki crea ahora las páginas interiores a partir del guion y de la portada aprobados.", next: "Puedes dejar esta página abierta o volver más tarde desde Mis creaciones Calitiki. No se necesita ninguna otra decisión antes de la vista previa completa." },
  },
  EN: {
    cover: { kicker: "COVER IN PROGRESS", title: "Calitiki is preparing your cover first", message: "We are writing the book and creating a first cover with your selected style and references.", next: "Next step: you will need to approve this cover before any interior illustrations begin. You can leave this page open or return later from My Calitiki creations." },
    regenerate: { kicker: "NEW COVER", title: "Calitiki is preparing your new attempt", message: "The selected style and references remain locked while this second proposal is created.", next: "You will need to approve this new cover before any interior illustrations begin." },
    interior: { kicker: "ILLUSTRATIONS IN PROGRESS", title: "Your cover is approved", message: "Calitiki is now creating the interior pages from the approved story plan and cover.", next: "You can leave this page open or return later from My Calitiki creations. No further decision is required before the complete preview." },
  },
};

const SCENARIO_PREPARATION_TEXT = {
  FR: { kicker: "CRÉATION DU SCÉNARIO", title: "Calitiki prépare votre première proposition", lead: "Nous transformons vos réponses en un déroulement clair en trois actes. Aucun crédit n'est utilisé pendant cette étape.", steps: ["Organiser le début, le défi et la résolution", "Vérifier les lieux, passages et personnages", "Préparer les cartes que vous pourrez relire et modifier"], error: "La première proposition n'a pas pu être préparée. Votre crédit n'a pas été utilisé et vos réponses sont conservées.", retry: "Réessayer gratuitement" },
  ES: { kicker: "CREACIÓN DEL GUION", title: "Calitiki prepara tu primera propuesta", lead: "Transformamos tus respuestas en una historia clara en tres actos. No se utiliza ningún crédito durante esta etapa.", steps: ["Organizar el inicio, el reto y la resolución", "Comprobar los lugares, pasos y personajes", "Preparar las tarjetas que podrás revisar y modificar"], error: "No se pudo preparar la primera propuesta. Tu crédito no se ha utilizado y tus respuestas están guardadas.", retry: "Reintentar gratis" },
  EN: { kicker: "CREATING THE STORY PLAN", title: "Calitiki is preparing your first proposal", lead: "We are turning your answers into a clear three-act story plan. No credit is used during this step.", steps: ["Organize the beginning, challenge and resolution", "Check locations, passages and characters", "Prepare the cards you can review and edit"], error: "The first proposal could not be prepared. Your credit was not used and your answers are saved.", retry: "Retry for free" },
};

const UNIVERSE_TEXT = {
  enchanted_forest: { FR: ["Forêt enchantée", "Sentiers secrets, fleurs brillantes et animaux bienveillants."], ES: ["Bosque encantado", "Senderos secretos, flores luminosas y animales amables."], EN: ["Enchanted forest", "Secret paths, glowing flowers and friendly animals."] },
  starry_space: { FR: ["Espace étoilé", "Planètes colorées et constellations amicales."], ES: ["Espacio estrellado", "Planetas de colores y constelaciones amistosas."], EN: ["Starry space", "Colorful planets and friendly constellations."] },
  coral_ocean: { FR: ["Océan de corail", "Poissons curieux et jardins sous-marins lumineux."], ES: ["Océano de coral", "Peces curiosos y jardines submarinos luminosos."], EN: ["Coral ocean", "Curious fish and bright underwater gardens."] },
  cloud_castle: { FR: ["Château des nuages", "Tours dorées, ponts aériens et magie douce."], ES: ["Castillo de nubes", "Torres doradas, puentes aéreos y magia suave."], EN: ["Cloud castle", "Golden towers, sky bridges and gentle magic."] },
  dinosaur_valley: { FR: ["Vallée des dinosaures", "Dinosaures attachants et fougères géantes."], ES: ["Valle de dinosaurios", "Dinosaurios entrañables y helechos gigantes."], EN: ["Dinosaur valley", "Lovable dinosaurs and giant ferns."] },
  wonder_city: { FR: ["Ville merveilleuse", "Ateliers magiques, toits colorés et passages secrets."], ES: ["Ciudad maravillosa", "Talleres mágicos, tejados de colores y pasadizos."], EN: ["Wonder city", "Magical workshops, colorful roofs and secret passages."] },
};

const UNIVERSE_CONTRACT_TEXT = {
  enchanted_forest: {
    FR: { adventure: "Les chemins et clairières d'une forêt réellement enchantée.", entry: "L'aventure commence à son entrée ou après la découverte d'un passage clairement montré.", rules: ["La magie visible peut ouvrir ou éclairer un chemin.", "Les objets ordinaires restent soumis aux règles normales."], mechanisms: ["Le passage ou le signe magique est découvert avant d'être utilisé."] },
    ES: { adventure: "Los senderos y claros de un bosque verdaderamente encantado.", entry: "La aventura empieza en su entrada o tras descubrir un paso claramente visible.", rules: ["La magia visible puede abrir o iluminar un camino.", "Los objetos corrientes conservan sus reglas normales."], mechanisms: ["El paso o la señal mágica se descubre antes de utilizarse."] },
    EN: { adventure: "The paths and clearings of a genuinely enchanted forest.", entry: "The adventure starts at its edge or after a clearly shown passage is discovered.", rules: ["Visible magic may open or light a path.", "Ordinary objects keep their normal rules."], mechanisms: ["The passage or magical sign is discovered before use."] },
  },
  starry_space: {
    FR: { adventure: "Une exploration de planètes, lunes et jardins célestes.", entry: "Chaque voyageur part dans une capsule ou par un passage spatial sûr montré avant le départ.", rules: ["Le vide, la gravité et la respiration exigent une protection stable.", "La capsule suit les voyageurs d'une étape à l'autre."], mechanisms: ["Transport spatial sûr.", "Air et communication pour tous les voyageurs."] },
    ES: { adventure: "Una exploración de planetas, lunas y jardines celestes.", entry: "Cada viajero sale en una cápsula o por un paso espacial seguro mostrado antes de partir.", rules: ["El vacío, la gravedad y la respiración exigen una protección estable.", "La cápsula acompaña a los viajeros entre etapas."], mechanisms: ["Transporte espacial seguro.", "Aire y comunicación para todos los viajeros."] },
    EN: { adventure: "An exploration of planets, moons and celestial gardens.", entry: "Every traveler leaves in a capsule or through a safe space passage shown before departure.", rules: ["Vacuum, gravity and breathing require stable protection.", "The capsule remains with the travelers between stops."], mechanisms: ["Safe space transport.", "Air and communication for every traveler."] },
  },
  coral_ocean: {
    FR: { adventure: "Un récif sous-marin lumineux et ses chemins de corail.", entry: "Chaque personnage physique reçoit sa bulle avant de plonger.", rules: ["La bulle assure respiration, pression et parole.", "Un téléphone ordinaire reste sec, rangé ou absent."], mechanisms: ["Une bulle complète par voyageur.", "Un moyen stable de parler sous l'eau."] },
    ES: { adventure: "Un arrecife submarino luminoso y sus caminos de coral.", entry: "Cada personaje físico recibe su burbuja antes de sumergirse.", rules: ["La burbuja permite respirar, soportar la presión y hablar.", "Un teléfono normal permanece seco, guardado o ausente."], mechanisms: ["Una burbuja completa por viajero.", "Una forma estable de hablar bajo el agua."] },
    EN: { adventure: "A luminous underwater reef and its coral paths.", entry: "Every physical character receives a bubble before diving.", rules: ["The bubble provides breathing, pressure safety and speech.", "An ordinary phone remains dry, stored or absent."], mechanisms: ["One complete bubble per traveler.", "A stable way to speak underwater."] },
  },
  cloud_castle: {
    FR: { adventure: "Les tours, ponts et salles d'un château au-dessus des nuages.", entry: "Un pont, un aéronef ou un passage magique sûr est montré avant l'arrivée.", rules: ["Le support contre la chute reste visible et stable.", "Personne n'apparaît soudainement dans le château."], mechanisms: ["Un trajet aérien sûr pour chaque personnage physique."] },
    ES: { adventure: "Las torres, puentes y salas de un castillo sobre las nubes.", entry: "Antes de llegar se muestra un puente, aeronave o paso mágico seguro.", rules: ["La protección contra la caída permanece visible y estable.", "Nadie aparece de repente dentro del castillo."], mechanisms: ["Un trayecto aéreo seguro para cada personaje físico."] },
    EN: { adventure: "The towers, bridges and rooms of a castle above the clouds.", entry: "A safe bridge, aircraft or magical passage is shown before arrival.", rules: ["Protection from falling stays visible and stable.", "Nobody suddenly appears inside the castle."], mechanisms: ["A safe aerial route for every physical character."] },
  },
  dinosaur_valley: {
    FR: { adventure: "Une vaste vallée préhistorique aux fougères géantes et dinosaures amicaux.", entry: "Le portail est découvert et ouvert avant que quiconque ne le traverse.", rules: ["Seuls les personnages qui franchissent le portail sont présents physiquement.", "Les dinosaures gardent une taille cohérente."], mechanisms: ["Découverte du portail.", "Traversée explicite de chaque voyageur."] },
    ES: { adventure: "Un gran valle prehistórico con helechos gigantes y dinosaurios amistosos.", entry: "El portal se descubre y abre antes de que nadie lo cruce.", rules: ["Solo están físicamente presentes quienes cruzan el portal.", "Los dinosaurios mantienen un tamaño coherente."], mechanisms: ["Descubrimiento del portal.", "Cruce explícito de cada viajero."] },
    EN: { adventure: "A vast prehistoric valley with giant ferns and friendly dinosaurs.", entry: "The portal is discovered and opened before anyone crosses it.", rules: ["Only characters who cross the portal are physically present.", "Dinosaurs keep a coherent scale."], mechanisms: ["Portal discovery.", "Explicit crossing by every traveler."] },
  },
  wonder_city: {
    FR: { adventure: "Les ateliers, toits et passages secrets d'une ville merveilleuse.", entry: "Le héros entre par une rue, une porte ou un passage découvert avant usage.", rules: ["Les inventions magiques montrent comment elles fonctionnent.", "Les objets réels ne gagnent pas de pouvoirs sans explication."], mechanisms: ["L'entrée ou le passage est établi.", "Toute invention utile est introduite avant son usage."] },
    ES: { adventure: "Los talleres, tejados y pasadizos secretos de una ciudad maravillosa.", entry: "El protagonista entra por una calle, puerta o paso descubierto antes de usarlo.", rules: ["Los inventos mágicos muestran cómo funcionan.", "Los objetos reales no obtienen poderes sin explicación."], mechanisms: ["Se establece la entrada o el pasadizo.", "Todo invento útil se presenta antes de usarlo."] },
    EN: { adventure: "The workshops, rooftops and secret passages of a wonder city.", entry: "The hero enters through a street, gate or passage discovered before use.", rules: ["Magical inventions show how they work.", "Real objects do not gain powers without explanation."], mechanisms: ["The entrance or passage is established.", "Every useful invention is introduced before use."] },
  },
};

function localizedUniverseContract(id = state.selectedUniverse) {
  return UNIVERSE_CONTRACT_TEXT[id]?.[state.locale] || UNIVERSE_CONTRACT_TEXT[id]?.FR || null;
}

const ROLE_LABELS = {
  FR: { child: "L'enfant", mascot: "Mascotte / animal", friend: "Ami(e)", family: "Famille", other: "Autre personnage", hero: "Héros / héroïne", guide: "Guide", ally: "Allié(e)", companion: "Compagnon", supporter: "Soutien", guest: "Invité(e)" },
  ES: { child: "El niño", mascot: "Mascota / animal", friend: "Amigo/a", family: "Familia", other: "Otro personaje", hero: "Protagonista", guide: "Guía", ally: "Aliado/a", companion: "Compañero/a", supporter: "Apoyo", guest: "Invitado/a" },
  EN: { child: "The child", mascot: "Mascot / animal", friend: "Friend", family: "Family", other: "Other character", hero: "Hero", guide: "Guide", ally: "Ally", companion: "Companion", supporter: "Supporter", guest: "Guest" },
};

const defaultStoryRole = (role) => ({ child: "hero", mascot: "companion", friend: "ally", family: "guide", other: "guest" }[role] || "guest");
const tr = (key, params) => translate(state.locale, key, params);
const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const formatPrice = (value) => new Intl.NumberFormat(state.locale === "EN" ? "en-IE" : state.locale === "ES" ? "es-ES" : "fr-FR", { style: "currency", currency: "EUR" }).format(value);
const selectedPageOption = () => state.config?.pageCountOptions?.find((option) => option.pageCount === state.pageCount);
const isProductAvailable = (productType) => productType === "ebook" || state.config?.productAvailability?.[productType]?.enabled === true;
const availableProductType = (productType) => isProductAvailable(productType) ? productType : "ebook";
const selectedUnitPrice = () => state.productType === "ebook" ? state.config?.pricing?.ebookUnitPagePrice : state.config?.pricing?.printUnitPagePrice;
const selectedProductPrice = () => {
  const option = selectedPageOption();
  return state.productType === "ebook" ? option?.ebookPriceEur : option?.printPriceEur;
};

function formValues() { return Object.fromEntries(new FormData(elements.form).entries()); }
function restoreValues(values) { Object.entries(values).forEach(([name, value]) => { const input = elements.form.elements.namedItem(name); if (input && typeof input.value !== "undefined") input.value = value; }); }
function readLocalDraft() { try { return JSON.parse(localStorage.getItem(LOCAL_DRAFT_KEY) || "null"); } catch { return null; } }
function persistLocalDraft() {
  if (!state.config) return;
  localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify({
    flowVersion: FLOW_VERSION, values: formValues(), step: state.step, locale: state.locale, selectedStyle: state.selectedStyle,
    selectedUniverse: state.selectedUniverse, fontStyle: state.fontStyle, pageCount: state.pageCount,
    productType: state.productType, projectId: state.projectId, storyIntentions: state.storyIntentions, storySuggestions: state.storySuggestions,
    storySuggestionMode: state.storySuggestionMode, updatedAt: new Date().toISOString(),
  }));
}
function scheduleLocalDraft() { window.clearTimeout(localDraftTimer); localDraftTimer = window.setTimeout(persistLocalDraft, 250); }

function setPreviewComplete(complete) {
  state.previewComplete = Boolean(complete);
  const submit = elements.form.querySelector("[type=submit]");
  if (!submit) return;
  submit.disabled = state.previewComplete;
  if (state.previewComplete) submit.innerHTML = `<span>${escapeHtml(tr("previewAlreadyGenerated"))}</span>`;
}

async function saveServerDraft(questionnaire, photos, status = "ready_for_preview") {
  const body = JSON.stringify({
    status, title: questionnaire.hero_name || "", locale: state.locale,
    questionnaire, photos, productConfiguration: productConfiguration(),
  });
  let response = state.projectId
    ? await fetch(`/api/drafts/${state.projectId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body })
    : null;
  if (response && !response.ok) {
    response = await fetch(`/api/projects/${state.projectId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body });
  }
  if (!response?.ok) response = await fetch("/api/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Draft could not be saved");
  state.projectId = payload.project.id;
  persistLocalDraft();
  return payload.project;
}

async function readCustomerSession() {
  const response = await fetch("/api/auth/session", { cache: "no-store" });
  return response.ok ? response.json() : { authenticated: false };
}

function renderCustomerSession() {
  const connected = Boolean(state.customerSession?.authenticated);
  elements.accountStatus.dataset.state = connected ? "connected" : "disconnected";
  elements.accountStatus.textContent = tr(connected ? "accountConnected" : "accountDisconnected");
  elements.logoutButton.hidden = !connected;
  elements.headerCreditBalance.hidden = !connected;
}

function creditPurchaseUrl(baseUrl, context = "preview") {
  if (!baseUrl || !state.projectId) return baseUrl || "#";
  try {
    const url = new URL(baseUrl, window.location.origin);
    url.searchParams.set("calitiki_project", state.projectId);
    url.searchParams.set("calitiki_context", ["preview", "action_center", "modification"].includes(context) ? context : "preview");
    url.searchParams.set("calitiki_locale", state.locale);
    return url.toString();
  } catch {
    return baseUrl;
  }
}

function setCreditPurchaseLink(link, baseUrl, context) {
  link.hidden = !baseUrl;
  link.dataset.creditReturnContext = context;
  if (baseUrl) link.href = creditPurchaseUrl(baseUrl, context);
}

function rememberCreditPurchase(event) {
  if (!state.projectId) return;
  persistLocalDraft();
  try {
    localStorage.setItem(PENDING_CREDIT_PURCHASE_KEY, JSON.stringify({
      projectId: state.projectId,
      context: event.currentTarget.dataset.creditReturnContext || "preview",
      balanceCents: Number(state.creditSummary?.balanceCents || 0),
      startedAt: Date.now(),
    }));
  } catch {
    // The signed WooCommerce return remains authoritative if browser storage is unavailable.
  }
}

function showCreditReturnNotice(status, summary) {
  const normalized = ["paid", "syncing", "pending", "failed", "cancelled", "back"].includes(status) ? status : "back";
  const key = normalized === "paid"
    ? "creditReturnPaid"
    : normalized === "syncing"
      ? "creditReturnSyncing"
      : normalized === "pending"
        ? "creditReturnPending"
        : ["failed", "cancelled"].includes(normalized)
          ? "creditReturnFailed"
          : "creditReturnBack";
  elements.creditReturnNotice.textContent = tr(key, {
    balance: formatPrice((summary?.balanceCents || 0) / 100),
  });
  elements.creditReturnNotice.className = `credit-return-notice${["syncing", "pending"].includes(normalized) ? " is-pending" : ["failed", "cancelled"].includes(normalized) ? " is-error" : ""}`;
  elements.creditReturnNotice.hidden = false;
}

async function monitorCreditReturnBalance(projectId, previousBalanceCents) {
  if (!Number.isFinite(previousBalanceCents)) return;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 2500));
    const summary = await refreshCreditSummary(projectId).catch(() => null);
    if (summary && Number(summary.balanceCents || 0) > previousBalanceCents) {
      showCreditReturnNotice("paid", summary);
      return;
    }
  }
}

function renderCreditSummary(summary, { showPanel = false } = {}) {
  const enabled = Boolean(summary?.enabled);
  state.creditSummary = summary;
  elements.headerCreditBalanceValue.textContent = formatPrice((summary?.balanceCents || 0) / 100);
  elements.creditPanel.hidden = !showPanel;
  elements.previewCreditPrice.textContent = formatPrice((summary.requiredCents || 0) / 100);
  elements.creditBalance.textContent = formatPrice((summary.balanceCents || 0) / 100);
  elements.creditMissing.textContent = formatPrice((summary.missingCents || 0) / 100);
  elements.creditMissing.closest("div").classList.toggle("has-missing-credit", summary.missingCents > 0);
  setCreditPurchaseLink(elements.buyCreditsLink, summary.buyCreditsUrl, "preview");
  if (showPanel) {
    elements.confirmPreviewButton.disabled = enabled && summary.missingCents > 0;
    elements.confirmPreviewButton.textContent = enabled ? tr("confirmPreviewDebit", { amount: formatPrice((summary.requiredCents || 0) / 100) }) : tr("confirmPreviewFree");
  }
  return summary;
}

async function refreshCreditSummary(projectId = state.projectId) {
  if (!state.customerSession?.authenticated) return null;
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
  const response = await fetch(`/api/credits/summary${query}`, { cache: "no-store" });
  const summary = await response.json();
  if (!response.ok) throw new Error(summary.error || tr("creditError"));
  return renderCreditSummary(summary, { showPanel: Boolean(projectId) });
}

async function preparePreviewAuthorization(projectId) {
  const summary = await refreshCreditSummary(projectId);
  document.querySelector("#creator").hidden = false;
  showStep(REVIEW_STEP, false);
  state.awaitingPreviewConfirmation = true;
  elements.creditPanel.scrollIntoView({ behavior: "smooth", block: "center" });
  elements.creditFeedback.textContent = summary?.missingCents > 0
    ? tr("creditRequired", { amount: formatPrice(summary.missingCents / 100) })
    : tr("previewAwaitingConfirmation");
}

async function confirmPreviewAuthorization() {
  if (!state.projectId || !state.awaitingPreviewConfirmation) return;
  const summary = await refreshCreditSummary(state.projectId);
  if (summary?.enabled && summary.missingCents > 0) {
    elements.creditFeedback.textContent = tr("creditRequired", { amount: formatPrice(summary.missingCents / 100) });
    return;
  }
  const original = elements.confirmPreviewButton.textContent;
  elements.confirmPreviewButton.disabled = true;
  elements.confirmPreviewButton.textContent = tr("confirmingPreview");
  elements.creditFeedback.textContent = tr("scenarioPreparing");
  try {
    state.awaitingPreviewConfirmation = false;
    await requestStoryScenario();
  } catch (error) {
    if (error?.technical) {
      elements.confirmPreviewButton.disabled = false;
      elements.confirmPreviewButton.textContent = original;
      await showGenerationFailure();
      return;
    }
    state.awaitingPreviewConfirmation = true;
    document.querySelector("#creator").hidden = false;
    elements.generationPanel.hidden = true;
    showStep(REVIEW_STEP, false);
    await refreshCreditSummary(state.projectId).catch(() => null);
    elements.confirmPreviewButton.disabled = false;
    elements.confirmPreviewButton.textContent = original;
    elements.creditFeedback.textContent = (SCENARIO_PREPARATION_TEXT[state.locale] || SCENARIO_PREPARATION_TEXT.FR).error;
  }
}

function scenarioClarificationAnswers() {
  return Object.fromEntries([...elements.scenarioQuestionList.querySelectorAll("[data-scenario-question]")]
    .map((input) => [input.dataset.scenarioQuestion, input.value.trim()])
    .filter(([, answer]) => answer));
}

function scenarioSceneEdits() {
  return [...elements.scenarioActs.querySelectorAll("[data-scenario-scene]")].map((card) => {
    const title = card.querySelector("[data-scene-title]");
    const location = card.querySelector("[data-scene-location]");
    const action = card.querySelector("[data-scene-action]");
    return {
      scene_number: Number(card.dataset.scenarioScene),
      ...(title?.dataset.creatorEdited === "true" ? { title: title.value } : {}),
      ...(location?.dataset.creatorEdited === "true" ? { location: location.value } : {}),
      ...(action?.dataset.creatorEdited === "true" ? { action: action.value } : {}),
      ...(card.dataset.presencesEdited === "true" ? { character_presences: [...card.querySelectorAll("[data-presence-character]")].map((select) => ({
        name: select.dataset.presenceCharacter,
        mode: select.value,
      })) } : {}),
    };
  }).filter((edit) => Object.keys(edit).length > 1);
}

function scenarioPresenceModeLabel(mode) {
  return tr({ physical: "scenarioPresencePhysical", thought: "scenarioPresenceThought", memory: "scenarioPresenceMemory", voice: "scenarioPresenceVoice", absent: "scenarioPresenceAbsent" }[mode] || "scenarioPresenceAbsent");
}

function scenarioPresenceControl(name, mode = "absent") {
  const options = ["absent", "physical", "thought", "memory", "voice"];
  return `<label class="scenario-presence-control"><span>${escapeHtml(name)}</span><select data-presence-character="${escapeHtml(name)}" aria-label="${escapeHtml(tr("scenarioPresenceFor", { name }))}">${options.map((option) => `<option value="${option}"${option === mode ? " selected" : ""}>${escapeHtml(scenarioPresenceModeLabel(option))}</option>`).join("")}</select></label>`;
}

function updateScenarioPresenceSummary(card) {
  const selections = [...card.querySelectorAll("[data-presence-character]")].map((select) => ({ name: select.dataset.presenceCharacter, mode: select.value }));
  const physical = selections.filter(({ mode }) => mode === "physical").map(({ name }) => name);
  const evoked = selections.filter(({ mode }) => ["thought", "memory", "voice"].includes(mode)).map(({ name, mode }) => `${name} (${scenarioPresenceModeLabel(mode).toLowerCase()})`);
  card.querySelector("[data-physical-summary]").textContent = physical.length ? physical.join(", ") : tr("scenarioNone");
  card.querySelector("[data-evoked-summary]").textContent = evoked.length ? evoked.join(", ") : tr("scenarioNone");
}

function markStoryScenarioDirty() {
  if (!state.storyScenario || state.storyScenarioBusy) return;
  state.storyScenarioDirty = true;
  elements.approveScenarioButton.disabled = true;
  setScenarioStatus(tr("scenarioUnsavedChanges"));
}

function addScenarioCharacter() {
  const name = elements.scenarioNewCharacterName.value.trim();
  if (!name) return;
  const exists = (state.storyScenario?.characters || []).some((character) => character.name.localeCompare(name, undefined, { sensitivity: "base" }) === 0);
  if (exists) {
    setScenarioStatus(tr("scenarioCharacterExists", { name }), "error");
    return;
  }
  const character = { name, role: "story_character", storyRole: "guest", initialLocation: "", defaultPresenceMode: "physical" };
  state.storyScenario.characters ||= [];
  state.storyScenario.characters.push(character);
  state.storyScenarioAddedCharacters.push({ name });
  elements.scenarioActs.querySelectorAll("[data-presence-editor]").forEach((editor) => editor.insertAdjacentHTML("beforeend", scenarioPresenceControl(name)));
  elements.scenarioNewCharacterName.value = "";
  markStoryScenarioDirty();
}

function scenarioHasUnansweredClarifications() {
  return (state.storyScenario?.clarifications || []).some((item) => {
    const answer = state.storyScenario?.creatorClarifications?.[item.id] || item.suggestedAnswer || "";
    return !String(answer).trim();
  });
}

function scenarioNeedsRevision() {
  return state.storyScenario?.validation?.valid === false;
}

function setScenarioStatus(message, kind = "") {
  elements.scenarioFeedbackMessage.textContent = message;
  elements.scenarioStatus.classList.toggle("is-loading", kind === "loading");
  elements.scenarioStatus.classList.toggle("is-error", kind === "error");
}

function scenarioApiMessage(payload, fallbackKey) {
  const messages = {
    scenario_invalid: "scenarioCoherenceError",
    scenario_update_in_progress: "scenarioAlreadyUpdating",
    scenario_locked: "scenarioLocked",
    scenario_stale: "scenarioStale",
    scenario_clarification_required: "scenarioNeedsAnswers",
  };
  return tr(messages[payload?.code] || fallbackKey);
}

function setStoryScenarioBusy(busy, action = "update") {
  state.storyScenarioBusy = busy;
  elements.storyScenarioPanel.setAttribute("aria-busy", String(busy));
  elements.storyScenarioPanel.querySelectorAll("input, textarea, select, [data-toggle-presences]").forEach((control) => { control.disabled = busy; });
  elements.scenarioAddCharacterButton.disabled = busy;
  elements.retryInitialScenarioButton.disabled = busy;
  elements.reviseScenarioButton.disabled = busy;
  elements.approveScenarioButton.disabled = busy || !state.storyScenario || state.storyScenarioDirty || scenarioHasUnansweredClarifications() || scenarioNeedsRevision();
  elements.reviseScenarioButton.textContent = state.storyScenarioUpdateFailed ? tr("scenarioRetryUpdate") : tr("reviseScenario");
  elements.approveScenarioButton.textContent = tr("approveScenario");
  if (busy && action === "update") elements.reviseScenarioButton.innerHTML = `<span class="button-spinner" aria-hidden="true"></span>${escapeHtml(tr("scenarioUpdatingAction"))}`;
  if (busy && action === "approve") elements.approveScenarioButton.innerHTML = `<span class="button-spinner" aria-hidden="true"></span>${escapeHtml(tr("scenarioApprovingAction"))}`;
  if (!busy) elements.scenarioStatus.classList.remove("is-loading");
}

function showInitialScenarioPreparation() {
  const copy = SCENARIO_PREPARATION_TEXT[state.locale] || SCENARIO_PREPARATION_TEXT.FR;
  document.querySelector("#creator").hidden = true;
  elements.generationPanel.hidden = true;
  elements.generationFailurePanel.hidden = true;
  elements.resultSection.hidden = true;
  elements.storyScenarioPanel.hidden = false;
  elements.storyScenarioKicker.textContent = copy.kicker;
  elements.storyScenarioTitle.textContent = copy.title;
  elements.scenarioPreparingLead.textContent = copy.lead;
  elements.scenarioPreparingSteps.innerHTML = copy.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("");
  elements.scenarioPreparationFeedback.textContent = "";
  elements.scenarioPreparationFeedback.hidden = true;
  elements.retryInitialScenarioButton.textContent = copy.retry;
  elements.retryInitialScenarioButton.hidden = true;
  elements.scenarioPreparingState.hidden = false;
  elements.scenarioReviewContent.hidden = true;
  elements.storyScenarioPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderStoryScenario(scenario, { scroll = true } = {}) {
  state.storyScenario = scenario;
  state.storyScenarioUpdateFailed = false;
  state.storyScenarioDirty = false;
  state.storyScenarioAddedCharacters = [];
  document.querySelector("#creator").hidden = true;
  elements.generationPanel.hidden = true;
  elements.generationFailurePanel.hidden = true;
  elements.resultSection.hidden = true;
  elements.storyScenarioPanel.hidden = false;
  elements.scenarioPreparingState.hidden = true;
  elements.scenarioReviewContent.hidden = false;
  elements.storyScenarioKicker.textContent = tr("scenarioKicker");
  elements.storyScenarioTitle.textContent = scenario.title || tr("scenarioTitle");
  elements.storyScenarioSummary.textContent = scenario.summary || "";
  const worldContract = scenario.worldContract || {};
  const localizedContract = localizedUniverseContract(worldContract.id);
  const contractRules = [
    [tr("scenarioContractAdventure"), localizedContract?.adventure || worldContract.adventureZone],
    [tr("scenarioContractEntry"), localizedContract?.entry || worldContract.entryRule],
    [tr("scenarioContractRules"), (localizedContract?.rules || worldContract.physicalRules || []).join(" · ")],
    [tr("scenarioContractMechanisms"), (localizedContract?.mechanisms || worldContract.requiredMechanisms || []).join(" · ")],
  ].filter(([, value]) => String(value || "").trim());
  elements.scenarioWorldContract.hidden = !contractRules.length;
  elements.scenarioWorldContract.innerHTML = contractRules.length
    ? `<h3>${escapeHtml(tr("scenarioContractTitle"))}</h3><p>${escapeHtml(tr("scenarioContractLead"))}</p><dl>${contractRules.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>`
    : "";
  const clarifications = scenario.clarifications || [];
  const validation = scenario.validation || { valid: true, categories: [], sceneNumbers: [], categoryScenes: {} };
  const needsRevision = validation.valid === false;
  elements.scenarioDiagnostics.hidden = !needsRevision;
  const diagnosticKeys = new Set(["passage", "object", "travel", "order", "incomplete"]);
  elements.scenarioDiagnosticList.innerHTML = needsRevision ? (validation.categories || ["incomplete"]).map((category) => {
    const safeCategory = diagnosticKeys.has(category) ? category : "incomplete";
    const numbers = validation.categoryScenes?.[safeCategory] || validation.sceneNumbers || [];
    const scenes = numbers.length ? numbers.join(", ") : tr("scenarioDiagnosticSeveral");
    return `<li>${escapeHtml(tr(`scenarioDiagnostic_${safeCategory}`, { scenes }))}</li>`;
  }).join("") : "";
  elements.scenarioClarifications.hidden = !clarifications.length;
  elements.scenarioQuestionList.innerHTML = clarifications.map((item) => `<label class="scenario-question"><strong>${escapeHtml(item.question)}</strong>${item.reason ? `<small>${escapeHtml(item.reason)}</small>` : ""}<input type="text" data-scenario-question="${escapeHtml(item.id)}" value="${escapeHtml(scenario.creatorClarifications?.[item.id] || item.suggestedAnswer || "")}" /></label>`).join("");
  const acts = new Map();
  for (const scene of scenario.scenes || []) {
    const scenes = acts.get(scene.act) || [];
    scenes.push(scene); acts.set(scene.act, scenes);
  }
  elements.scenarioActs.innerHTML = [...acts].sort(([left], [right]) => left - right).map(([act, scenes]) => `<section class="scenario-act"><h3>${escapeHtml(tr("scenarioAct", { number: act }))}</h3>${scenes.map((scene) => {
    const physical = (scene.characterPresences || []).filter((presence) => presence.mode === "physical").map((presence) => presence.name);
    const nonphysical = (scene.characterPresences || []).filter((presence) => presence.mode !== "physical").map((presence) => `${presence.name} (${scenarioPresenceModeLabel(presence.mode).toLowerCase()})`);
    const presenceByName = new Map((scene.characterPresences || []).map((presence) => [presence.name, presence.mode]));
    return `<article class="scenario-scene" data-scenario-scene="${scene.sceneNumber}"><span class="scenario-scene-number">${scene.sceneNumber}</span><div class="scenario-scene-fields"><input data-scene-title value="${escapeHtml(scene.title)}" aria-label="${escapeHtml(scene.title)}" /><label><span>${escapeHtml(tr("scenarioLocation"))}</span><input data-scene-location value="${escapeHtml(scene.locationAfter)}" /></label><label><span>${escapeHtml(tr("scenarioAction"))}</span><textarea data-scene-action>${escapeHtml(scene.action)}</textarea></label><div class="scenario-presences"><div><strong>${escapeHtml(tr("scenarioPhysical"))} :</strong> <span data-physical-summary>${escapeHtml(physical.length ? physical.join(", ") : tr("scenarioNone"))}</span></div><div><strong>${escapeHtml(tr("scenarioNonphysical"))} :</strong> <span data-evoked-summary>${escapeHtml(nonphysical.length ? nonphysical.join(", ") : tr("scenarioNone"))}</span></div></div><button type="button" class="text-button scenario-presence-toggle" data-toggle-presences aria-expanded="false">${escapeHtml(tr("scenarioEditPresences"))}</button><div class="scenario-presence-editor" data-presence-editor hidden>${(scenario.characters || []).map((character) => scenarioPresenceControl(character.name, presenceByName.get(character.name) || "absent")).join("")}</div></div></article>`;
  }).join("")}</section>`).join("");
  const invalidScenes = new Set(validation.sceneNumbers || []);
  elements.scenarioActs.querySelectorAll("[data-scenario-scene]").forEach((card) => {
    card.classList.toggle("has-validation-issue", invalidScenes.has(Number(card.dataset.scenarioScene)));
  });
  const unansweredClarifications = scenarioHasUnansweredClarifications();
  elements.approveScenarioButton.disabled = unansweredClarifications || needsRevision;
  setScenarioStatus(
    needsRevision ? tr("scenarioNeedsRevision") : unansweredClarifications ? tr("scenarioNeedsAnswers") : clarifications.length ? tr("scenarioDefaultsReady") : tr("scenarioReady"),
    needsRevision || unansweredClarifications ? "error" : "",
  );
  if (scroll) elements.storyScenarioPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function requestStoryScenario({ includeEdits = false } = {}) {
  if (!state.projectId || state.storyScenarioBusy) return;
  const initialRequest = !state.storyScenario && !includeEdits;
  if (initialRequest) showInitialScenarioPreparation();
  else {
    elements.storyScenarioPanel.hidden = false;
    document.querySelector("#creator").hidden = true;
    setScenarioStatus(tr("scenarioUpdating"), "loading");
  }
  setStoryScenarioBusy(true, initialRequest ? "prepare" : "update");
  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(state.projectId)}/story-scenario`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clarifications: scenarioClarificationAnswers(),
        sceneEdits: includeEdits ? scenarioSceneEdits() : [],
        addedCharacters: state.storyScenarioAddedCharacters,
        feedback: elements.scenarioFeedback.value.trim(),
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      if (payload.scenario) {
        renderStoryScenario(payload.scenario);
        state.storyScenarioUpdateFailed = true;
        setScenarioStatus(scenarioApiMessage(payload, "scenarioRevisionError"), "error");
        return;
      }
      throw new Error(scenarioApiMessage(payload, "scenarioRevisionError"));
    }
    elements.scenarioFeedback.value = "";
    renderStoryScenario(payload.scenario);
  } catch (error) {
    if (initialRequest) {
      const copy = SCENARIO_PREPARATION_TEXT[state.locale] || SCENARIO_PREPARATION_TEXT.FR;
      elements.scenarioPreparationFeedback.textContent = copy.error;
      elements.scenarioPreparationFeedback.hidden = false;
      elements.retryInitialScenarioButton.hidden = false;
      return;
    }
    state.storyScenarioUpdateFailed = true;
    setScenarioStatus(error.message || tr("scenarioRevisionError"), "error");
  } finally {
    setStoryScenarioBusy(false);
  }
}

async function approveStoryScenario() {
  if (!state.projectId || !state.storyScenario || elements.approveScenarioButton.disabled || state.storyScenarioBusy) return;
  setStoryScenarioBusy(true, "approve");
  setScenarioStatus(tr("confirmingPreview"), "loading");
  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(state.projectId)}/story-scenario/approve`, { method: "POST" });
    const payload = await response.json();
    if (!response.ok) throw new Error(scenarioApiMessage(payload, "scenarioApprovalError"));
    state.storyScenario = payload.scenario;
    elements.storyScenarioPanel.hidden = true;
    await generatePreviewForProject(state.projectId);
  } catch (error) {
    elements.storyScenarioPanel.hidden = false;
    setScenarioStatus(error.message || tr("scenarioApprovalError"), "error");
  } finally {
    setStoryScenarioBusy(false);
  }
}

async function redeemPromotion() {
  const code = elements.promoCodeInput.value.trim();
  if (!code || !state.projectId) { elements.creditFeedback.textContent = tr("promoNeedsCode"); return; }
  elements.redeemPromoButton.disabled = true;
  try {
    const response = await fetch("/api/credits/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: state.projectId, code }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || tr("creditError"));
    elements.promoCodeInput.value = "";
    elements.creditFeedback.textContent = tr("promoApplied", { amount: formatPrice(payload.amountCents / 100) });
    await refreshCreditSummary();
  } catch (error) { elements.creditFeedback.textContent = error.message; }
  finally { elements.redeemPromoButton.disabled = false; }
}

async function renderPreviewActionCenter({ locked = false, qualityReview = false } = {}) {
  if (qualityReview) {
    elements.previewActionCenter.hidden = true;
    return;
  }
  const summary = await refreshCreditSummary().catch(() => null);
  elements.previewActionCenter.hidden = false;
  if (locked) {
    elements.actionReadInteractive.removeAttribute("href");
    elements.actionReadInteractive.setAttribute("aria-disabled", "true");
  } else {
    elements.actionReadInteractive.href = `/interactive-reader/?project=${encodeURIComponent(state.projectId)}`;
    elements.actionReadInteractive.removeAttribute("aria-disabled");
  }
  elements.actionRecoverReferences.hidden = !state.referenceRecoveryAvailable;
  elements.previewRebateText.textContent = summary ? tr("previewRebate", { amount: formatPrice((summary.rebateCents || 0) / 100), balance: formatPrice((summary.balanceCents || 0) / 100) }) : tr("checkoutReady");
  setCreditPurchaseLink(elements.actionBuyCredits, summary?.buyCreditsUrl, "action_center");
  elements.actionBuyEbook.disabled = locked;
  elements.actionRequestChange.disabled = locked;
  elements.actionBuyPrint.disabled = locked || !isProductAvailable("print");
  elements.actionBuyPrint.textContent = isProductAvailable("print") ? tr("buyPrint") : tr("printComingSoonAction");
}

function selectedModificationScope() {
  return document.querySelector('input[name="modificationScope"]:checked')?.value || "illustration";
}

function setModificationStatus(message = "", kind = "") {
  elements.modificationStatus.textContent = message;
  elements.modificationStatus.className = `preview-modification-status${kind ? ` is-${kind}` : ""}`;
}

function setModificationBusy(busy) {
  elements.previewModificationPanel.setAttribute("aria-busy", String(Boolean(busy)));
  elements.submitModification.disabled = Boolean(busy) || Number(state.previewModificationQuote?.missingCents || 0) > 0;
  elements.approveModification.disabled = Boolean(busy);
  elements.rejectModification.disabled = Boolean(busy);
  elements.actionRequestChange.disabled = Boolean(busy);
  elements.actionBuyEbook.disabled = Boolean(busy);
  elements.actionBuyPrint.disabled = Boolean(busy) || !isProductAvailable("print");
}

function firstModificationSpread() {
  return (state.currentPreview?.final_blueprint?.pages || [])
    .find((page) => page.page_type === "image" && Number(page.spread_number) > 0)?.spread_number || 1;
}

async function loadModificationQuote({ preserveSelection = true } = {}) {
  if (!state.projectId) return null;
  const spreadNumber = Number(elements.modificationSpread.value || firstModificationSpread());
  const scope = selectedModificationScope();
  const response = await fetch(`/api/projects/${encodeURIComponent(state.projectId)}/preview-modifications/quote?spreadNumber=${encodeURIComponent(spreadNumber)}&scope=${encodeURIComponent(scope)}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || tr("creditError"));
  const selected = preserveSelection ? Number(elements.modificationSpread.value || payload.spread.spreadNumber) : payload.spread.spreadNumber;
  elements.modificationSpread.innerHTML = payload.availableSpreads.map((spread) => `<option value="${spread.spreadNumber}">${escapeHtml(tr("modificationSpreadLabel", {
    spread: spread.spreadNumber,
    textPage: spread.textPageNumber,
    imagePage: spread.imagePageNumber,
  }))}</option>`).join("");
  elements.modificationSpread.value = String(payload.availableSpreads.some((spread) => spread.spreadNumber === selected) ? selected : payload.spread.spreadNumber);
  elements.modificationPrice.textContent = formatPrice(payload.amountCents / 100);
  elements.modificationBalance.textContent = formatPrice(payload.balanceCents / 100);
  elements.modificationMissing.textContent = formatPrice(payload.missingCents / 100);
  setCreditPurchaseLink(elements.modificationBuyCredits, payload.buyCreditsUrl, "modification");
  state.previewModificationQuote = payload;
  elements.submitModification.disabled = payload.missingCents > 0;
  setModificationStatus(payload.missingCents > 0
    ? tr("modificationInsufficient", { amount: formatPrice(payload.missingCents / 100) })
    : "");
  return payload;
}

function renderModificationCandidate(modification) {
  const candidate = modification?.candidateSnapshot;
  if (!candidate?.previewResult || !candidate?.finalBlueprint) return;
  state.previewModification = modification;
  const imagePageNumber = candidate.finalBlueprint.pages?.find((page) => (
    page.page_type === "image" && Number(page.spread_number) === Number(modification.spreadNumber)
  ))?.page_number || 0;
  renderBook({
    result: candidate.previewResult,
    final_blueprint: candidate.finalBlueprint,
    projectStatus: "preview_modification_review",
  }, {
    initialPageNumber: imagePageNumber,
  });
  elements.previewModificationPanel.hidden = false;
  elements.submitModification.hidden = true;
  elements.approveModification.hidden = false;
  elements.rejectModification.hidden = false;
  elements.actionBuyEbook.disabled = true;
  elements.actionBuyPrint.disabled = true;
  setModificationBusy(false);
  elements.actionBuyEbook.disabled = true;
  elements.actionBuyPrint.disabled = true;
  setModificationStatus(tr("modificationAwaitingApproval"));
}

async function refreshLatestModification({ schedule = true } = {}) {
  if (!state.projectId || !state.previewComplete) return null;
  const response = await fetch(`/api/projects/${encodeURIComponent(state.projectId)}/preview-modifications/latest`, { cache: "no-store" });
  if (!response.ok) return null;
  const { modification } = await response.json();
  state.previewModification = modification;
  if (!modification || ["approved", "rejected"].includes(modification.status)) return modification;

  elements.previewModificationPanel.hidden = false;
  elements.modificationInstruction.value = modification.instruction || "";
  document.querySelectorAll('input[name="modificationScope"]').forEach((input) => { input.checked = input.value === modification.changeScope; });
  await loadModificationQuote({ preserveSelection: false }).catch(() => null);
  elements.modificationSpread.value = String(modification.spreadNumber);

  if (modification.status === "awaiting_approval") {
    renderModificationCandidate(modification);
    return modification;
  }
  if (modification.status === "failed") {
    setModificationBusy(false);
    elements.submitModification.hidden = false;
    elements.approveModification.hidden = true;
    elements.rejectModification.hidden = true;
    elements.submitModification.textContent = tr("retryPreviewFree");
    setModificationStatus(tr("modificationRetry"), "error");
    return modification;
  }
  if (["reserved", "generating"].includes(modification.status)) {
    setModificationBusy(true);
    elements.submitModification.hidden = false;
    elements.approveModification.hidden = true;
    elements.rejectModification.hidden = true;
    setModificationStatus(tr("modificationWorking"), "working");
    if (schedule) {
      window.clearTimeout(state.previewModificationPoll);
      state.previewModificationPoll = window.setTimeout(() => refreshLatestModification().catch(() => null), 3000);
    }
  }
  return modification;
}

async function openModificationPanel() {
  elements.previewModificationPanel.hidden = false;
  elements.submitModification.hidden = false;
  elements.approveModification.hidden = true;
  elements.rejectModification.hidden = true;
  elements.submitModification.textContent = tr("modificationGenerate");
  setModificationStatus("");
  try {
    const latest = await refreshLatestModification({ schedule: false });
    if (latest && ["reserved", "generating", "awaiting_approval", "failed"].includes(latest.status)) return;
    state.previewModification = null;
    await loadModificationQuote({ preserveSelection: false });
    elements.previewModificationPanel.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) {
    setModificationStatus(error.message || tr("creditError"), "error");
  }
}

async function submitPreviewModification() {
  if (!state.projectId || elements.submitModification.disabled) return;
  const retrying = state.previewModification?.status === "failed";
  if (!retrying && elements.modificationInstruction.value.trim().length < 8) {
    setModificationStatus(tr("modificationRequest"), "error");
    return;
  }
  setModificationBusy(true);
  setModificationStatus(tr("modificationWorking"), "working");
  try {
    const url = retrying
      ? `/api/projects/${encodeURIComponent(state.projectId)}/preview-modifications/${encodeURIComponent(state.previewModification.id)}/retry`
      : `/api/projects/${encodeURIComponent(state.projectId)}/preview-modifications`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: retrying ? "{}" : JSON.stringify({
        spreadNumber: Number(elements.modificationSpread.value),
        scope: selectedModificationScope(),
        instruction: elements.modificationInstruction.value.trim(),
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      if (response.status === 402 && payload.buyCreditsUrl) {
        setCreditPurchaseLink(elements.modificationBuyCredits, payload.buyCreditsUrl, "modification");
      }
      throw new Error(payload.error || tr("generationFailed"));
    }
    state.previewModification = payload.modification;
    await pollJob(payload.jobId).catch(() => null);
    await refreshLatestModification({ schedule: false });
  } catch (error) {
    await refreshLatestModification({ schedule: false }).catch(() => null);
    if (state.previewModification?.status !== "failed") setModificationStatus(error.message || tr("generationFailed"), "error");
  } finally {
    if (!["reserved", "generating"].includes(state.previewModification?.status)) setModificationBusy(false);
  }
}

async function decidePreviewModification(action) {
  const modification = state.previewModification;
  if (!modification?.id || modification.status !== "awaiting_approval") return;
  setModificationBusy(true);
  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(state.projectId)}/preview-modifications/${encodeURIComponent(modification.id)}/${action}`, { method: "POST" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || tr("generationFailed"));
    const projectResponse = await fetch(`/api/projects/${encodeURIComponent(state.projectId)}`, { cache: "no-store" });
    const projectPayload = await projectResponse.json();
    if (!projectResponse.ok) throw new Error(projectPayload.error || tr("generationFailed"));
    const project = projectPayload.project;
    showCompletedPreview({
      result: project.previewResult,
      final_blueprint: project.finalBlueprint,
      projectStatus: project.status,
      referenceRecoveryAvailable: project.referenceRecoveryAvailable,
    }, { scroll: false });
    elements.previewModificationPanel.hidden = true;
    setModificationStatus(action === "approve" ? tr("modificationApproved") : tr("modificationRejected"));
  } catch (error) {
    setModificationStatus(error.message || tr("generationFailed"), "error");
  } finally {
    setModificationBusy(false);
  }
}

async function beginReferenceRecovery() {
  if (!state.projectId || !state.referenceRecoveryAvailable) return;
  if (!window.confirm(tr("recoverReferencesConfirm"))) return;
  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(state.projectId)}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || tr("recoverReferencesError"));
    const project = payload.project;
    const questionnaire = project.questionnaire || {};
    state.pageCount = Number(questionnaire.page_count || project.productConfiguration?.page_count || state.pageCount);
    state.selectedStyle = questionnaire.style_id || project.productConfiguration?.style_id || state.selectedStyle;
    state.selectedUniverse = questionnaire.universe_id || project.productConfiguration?.universe_id || state.selectedUniverse;
    state.fontStyle = questionnaire.font_style || project.productConfiguration?.font_style || state.fontStyle;
    state.productType = availableProductType(questionnaire.product_type || project.productConfiguration?.product_type || state.productType);
    state.storyIntentions = Array.isArray(questionnaire.story_intentions) ? questionnaire.story_intentions : [];
    state.storySuggestions = Array.isArray(questionnaire.story_suggestions) ? questionnaire.story_suggestions : [];
    state.storySuggestionMode = questionnaire.story_seed_id ? "suggestion" : "custom";
    renderQuestions(questionnaire);
    restoreValues(questionnaire);
    renderUniverses(); renderStoryIntentions(); renderStorySuggestions(); renderSelectedSuggestionSummary(); renderStyles(); renderFonts(); renderProductTypes(); renderPageCounts();
    state.photos.forEach((photo) => URL.revokeObjectURL(photo.url));
    state.photos = [];
    state.referenceRecoveryMode = true;
    state.referenceRecoveryAvailable = false;
    renderPhotos();
    setPreviewComplete(false);
    elements.resultSection.hidden = true;
    document.querySelector("#creator").hidden = false;
    showStep(5);
    elements.formError.textContent = tr("recoverReferencesInstructions");
  } catch (error) {
    elements.previewRebateText.textContent = error.message || tr("recoverReferencesError");
  }
}

async function openConfiguredCheckout(productType, button) {
  if (!state.projectId || !state.previewComplete) return;
  if (!isProductAvailable(productType)) {
    elements.previewRebateText.textContent = tr("printUnavailable");
    return;
  }
  const original = button.textContent;
  button.disabled = true; button.textContent = tr("checkoutPreparing");
  try {
    const response = await fetch("/api/commerce/checkout-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: state.projectId, productType }) });
    const payload = await response.json();
    if (!response.ok || !payload.checkoutUrl) throw new Error(payload.error || tr("checkoutError"));
    window.location.assign(payload.checkoutUrl);
  } catch (error) {
    button.disabled = false; button.textContent = original;
    elements.previewRebateText.textContent = error.message || tr("checkoutError");
  }
}

async function refreshCustomerSession() {
  state.customerSession = await readCustomerSession();
  renderCustomerSession();
  return state.customerSession;
}

function startNewBook() {
  if (!window.confirm(tr("newBookConfirm"))) return;
  window.clearTimeout(localDraftTimer);
  localStorage.removeItem(LOCAL_DRAFT_KEY);
  localStorage.removeItem(PENDING_PREVIEW_KEY);
  localStorage.removeItem(PENDING_CREDIT_PURCHASE_KEY);
  const reloadUrl = new URL(window.location.origin);
  reloadUrl.searchParams.set("newBook", Date.now().toString());
  reloadUrl.hash = "creator";
  window.location.replace(reloadUrl.toString());
}

async function logoutCustomer() {
  const response = await fetch("/api/auth/logout", { method: "POST" });
  if (!response.ok) throw new Error(tr("startError"));
  state.customerSession = { authenticated: false, customer: null };
  renderCustomerSession();
}

async function claimProject(projectId) {
  let response = await fetch(`/api/drafts/${encodeURIComponent(projectId)}/claim`, { method: "POST" });
  if (response.status === 404) response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || tr("startError"));
  return payload.project;
}

function applyTranslations() {
  document.documentElement.lang = state.locale.toLowerCase();
  document.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = tr(node.dataset.i18n); });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => { node.placeholder = tr(node.dataset.i18nPlaceholder); });
  elements.uiLanguage.value = state.locale;
  if (elements.storefrontReturnLink) {
    elements.storefrontReturnLink.href = storefrontReturnUrl(state.locale);
    elements.storefrontReturnLink.setAttribute("aria-label", tr("returnToStore"));
    elements.storefrontReturnLink.title = tr("returnToStore");
  }
  const firstPrice = state.config?.pageCountOptions?.[0]?.ebookPriceEur;
  if (elements.heroStartingPrice && firstPrice != null) elements.heroStartingPrice.textContent = tr("startingAt", { price: formatPrice(firstPrice) });
  if (elements.heroPageRange) elements.heroPageRange.textContent = tr("pageRange", { min: 24, max: 44 });
  const universeIndex = state.config?.questions?.findIndex((question) => question.id === "universe") ?? -1;
  if (elements.universeTitle && universeIndex >= 0) elements.universeTitle.textContent = `${universeIndex + 1}. ${tr("universeTitle")}`;
  renderCustomerSession();
  updateBookMetrics();
}

function renderQuestion(question, index) {
  const [label, help] = QUESTION_TEXT[state.locale][question.id] || [question.label, question.help];
  const isTextArea = question.type === "textarea";
  const input = isTextArea
    ? `<textarea id="${question.id}" name="${question.id}" ${question.required ? "required" : ""} placeholder="${escapeHtml(tr("answerPlaceholder"))}"></textarea>`
    : `<input id="${question.id}" name="${question.id}" type="${question.type}" ${question.required ? "required" : ""} ${question.type === "number" ? 'min="1" max="14"' : ""} placeholder="${escapeHtml(tr("answerPlaceholder"))}" />`;
  const improveButton = IMPROVABLE_QUESTION_IDS.has(question.id) ? `<button type="button" class="improve-answer" data-improve-question="${question.id}"><span aria-hidden="true">✦</span>${escapeHtml(tr("improveAnswer"))}</button>` : "";
  return `<div class="field${isTextArea ? " is-wide" : ""}"><div class="field-heading"><label for="${question.id}">${index + 1}. ${escapeHtml(label)}${question.required ? " *" : ""}</label>${improveButton}</div>${input}<small>${escapeHtml(help)}</small></div>`;
}

async function improveAnswer(button) {
  const questionId = button.dataset.improveQuestion;
  const input = document.querySelector(`#${questionId}`);
  const field = button.closest(".field");
  const question = field?.querySelector("label")?.textContent || questionId;
  if (!input?.value.trim()) { input?.classList.add("is-invalid"); elements.formError.textContent = tr("improveNeedsAnswer"); input?.focus(); return; }
  const originalLabel = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<span class="button-spinner" aria-hidden="true"></span>${escapeHtml(tr("improvingAnswer"))}`;
  elements.formError.textContent = "";
  try {
    const response = await fetch("/api/improve-answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId, question, answer: input.value, locale: state.locale }) });
    const payload = await response.json();
    if (!response.ok) {
      if (payload.code === "improve_rate_limited") throw new Error(tr("improveRateLimit"));
      if (payload.code === "improve_temporarily_unavailable") throw new Error(tr("improveError"));
      throw new Error(payload.error || tr("improveError"));
    }
    input.value = payload.improvedAnswer;
    input.classList.remove("is-invalid");
    input.focus();
    button.innerHTML = `<span aria-hidden="true">✦</span>${escapeHtml(tr("improveAgain"))}`;
  } catch (error) {
    elements.formError.textContent = error.message || tr("improveError");
    button.innerHTML = originalLabel;
  } finally {
    button.disabled = false;
  }
}

function bindImproveButtons() {
  document.querySelectorAll("[data-improve-question]").forEach((button) => button.addEventListener("click", () => improveAnswer(button)));
}

function renderQuestions(values = {}) {
  const questions = state.config.questions;
  elements.childQuestions.innerHTML = questions.slice(0, 4).map(renderQuestion).join("");
  elements.storyQuestions.innerHTML = questions.filter((question, index) => index >= 4 && question.id !== "universe").map((question) => renderQuestion(question, questions.findIndex((item) => item.id === question.id))).join("");
  elements.storyQuestions.insertAdjacentHTML("beforeend", `<div class="field is-wide"><div class="field-heading"><label for="extra_notes">${escapeHtml(tr("extraLabel"))}</label><button type="button" class="improve-answer" data-improve-question="extra_notes"><span aria-hidden="true">✦</span>${escapeHtml(tr("improveAnswer"))}</button></div><textarea id="extra_notes" name="extra_notes" placeholder="${escapeHtml(tr("extraPlaceholder"))}"></textarea><small>${escapeHtml(tr("extraHelp"))}</small></div>`);
  restoreValues(values);
  bindImproveButtons();
}

function selectedUniverseOption() {
  return state.config?.universeOptions?.find((option) => option.id === state.selectedUniverse);
}

const INTENTION_FIELD_MAP = {
  id: "story_intent_id",
  title: "story_intent_title",
  understanding: "story_intent_understanding",
  desired_change: "story_intent_desired_change",
  protective_doubt: "story_intent_protective_doubt",
  first_step: "story_intent_first_step",
  motivation: "story_intent_motivation",
  reward: "story_intent_reward",
  message: "story_intent_message",
};

function selectedStoryIntention() {
  const selectedId = document.querySelector("#story_intent_id")?.value || "";
  return state.storyIntentions.find((intention) => intention.id === selectedId) || null;
}

function clearIntentionChoice({ preserveSituation = true } = {}) {
  Object.values(INTENTION_FIELD_MAP).forEach((id) => {
    const input = document.querySelector(`#${id}`);
    if (input) input.value = "";
  });
  state.storyIntentions = [];
  if (!preserveSituation) {
    const situation = document.querySelector("#creator_situation");
    if (situation) situation.value = "";
  }
}

function renderStoryIntentions() {
  const selectedId = document.querySelector("#story_intent_id")?.value || "";
  const examples = INTENTION_EXAMPLES[state.locale] || INTENTION_EXAMPLES.FR;
  const intentionBusy = state.storyIntentionsBusy || state.storySuggestionsBusy;
  elements.intentionExampleList.innerHTML = examples.map((example) => `<button type="button" class="intention-example" data-intention-example="${escapeHtml(example)}" ${intentionBusy ? "disabled" : ""}>${escapeHtml(example)}</button>`).join("");
  elements.intentionExampleList.querySelectorAll("[data-intention-example]").forEach((button) => button.addEventListener("click", () => {
    document.querySelector("#creator_situation").value = button.dataset.intentionExample;
    document.querySelector("#creator_situation").focus();
    clearIntentionChoice({ preserveSituation: true });
    resetStorySuggestionChoice({ preserveAnswers: true });
    renderStoryIntentions();
    renderStorySuggestions();
    persistLocalDraft();
  }));
  elements.intentionLoading.hidden = !state.storyIntentionsBusy;
  elements.interpretIntentionButton.disabled = intentionBusy;
  elements.customStoryChoice.disabled = intentionBusy;
  document.querySelector("#creator_situation").readOnly = intentionBusy;
  elements.storyIntentionGrid.innerHTML = state.storyIntentions.map((intention) => `
    <article class="story-intention-card ${intention.id === selectedId ? "is-selected" : ""}">
      <h3>${escapeHtml(intention.title)}</h3>
      <p>${escapeHtml(intention.understanding)}</p>
      <dl>
        <div><dt>${escapeHtml(tr("intentionFirstStep"))}</dt><dd>${escapeHtml(intention.first_step)}</dd></div>
        <div><dt>${escapeHtml(tr("intentionMotivation"))}</dt><dd>${escapeHtml(intention.motivation)}</dd></div>
        <div><dt>${escapeHtml(tr("intentionReward"))}</dt><dd>${escapeHtml(intention.reward)}</dd></div>
      </dl>
      <button type="button" class="primary-button" data-story-intention="${escapeHtml(intention.id)}" ${intentionBusy ? "disabled" : ""}>${escapeHtml(intention.id === selectedId ? tr("intentionChosen") : tr("chooseIntention"))}</button>
    </article>`).join("");
  elements.storyIntentionGrid.querySelectorAll("[data-story-intention]").forEach((button) => button.addEventListener("click", () => chooseStoryIntention(button.dataset.storyIntention)));
  elements.intentionChoiceStatus.textContent = selectedId ? tr("intentionConfirmed") : "";
  elements.customStoryChoice.classList.toggle("is-selected", state.storySuggestionMode === "custom");
  elements.adventureProposals.hidden = !(selectedId || state.storySuggestions.length || state.storySuggestionMode === "suggestion");
}

async function requestStoryIntentions() {
  if (state.storyIntentionsBusy || !state.selectedUniverse) return;
  const values = formValues();
  if (![values.hero_name, values.age, values.favorite_activities, values.personality, values.creator_situation].every((value) => String(value || "").trim())) {
    elements.intentionChoiceStatus.textContent = tr("intentionNeedsSituation");
    document.querySelector("#creator_situation")?.focus();
    return;
  }
  state.storyIntentionsBusy = true;
  state.storyIntentions = [];
  resetStorySuggestionChoice({ preserveAnswers: true });
  elements.intentionChoiceStatus.textContent = "";
  renderStoryIntentions();
  renderStorySuggestions();
  try {
    const response = await fetch("/api/story-intentions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        heroName: values.hero_name,
        age: values.age,
        favoriteActivities: values.favorite_activities,
        personality: values.personality,
        creatorSituation: values.creator_situation,
        universeId: state.selectedUniverse,
        locale: state.locale,
      }),
    });
    const payload = await response.json();
    if (!response.ok || !Array.isArray(payload.intentions) || payload.intentions.length !== 3) throw new Error(payload.error || tr("intentionError"));
    state.storyIntentions = payload.intentions;
    persistLocalDraft();
  } catch (error) {
    elements.intentionChoiceStatus.textContent = error.message || tr("intentionError");
  } finally {
    state.storyIntentionsBusy = false;
    renderStoryIntentions();
  }
}

function chooseStoryIntention(id) {
  const intention = state.storyIntentions.find((item) => item.id === id);
  if (!intention) return;
  Object.entries(INTENTION_FIELD_MAP).forEach(([key, fieldId]) => {
    document.querySelector(`#${fieldId}`).value = intention[key] || "";
  });
  state.storySuggestions = [];
  state.storySuggestionMode = "";
  resetStorySuggestionChoice({ preserveAnswers: true });
  const dream = document.querySelector("#dream");
  const challenge = document.querySelector("#challenge");
  const message = document.querySelector("#message");
  if (dream) dream.value = intention.desired_change;
  if (challenge) challenge.value = intention.protective_doubt;
  if (message) message.value = intention.message;
  renderStoryIntentions();
  renderStorySuggestions();
  persistLocalDraft();
  requestStorySuggestions().catch(() => null);
}

function selectedStorySuggestion() {
  const selectedId = document.querySelector("#story_seed_id")?.value || "";
  return state.storySuggestions.find((suggestion) => suggestion.id === selectedId) || null;
}

function resetStorySuggestionChoice({ preserveAnswers = true } = {}) {
  state.storySuggestionMode = "";
  ["story_seed_id", "story_seed_title", "story_seed_first_step", "story_seed_effort", "story_seed_reward", "story_seed_adaptation", "story_seed_moment", "story_seed_transformation"].forEach((id) => {
    const input = document.querySelector(`#${id}`);
    if (input) input.value = "";
  });
  if (!preserveAnswers) {
    const dream = document.querySelector("#dream");
    const challenge = document.querySelector("#challenge");
    if (dream) dream.value = "";
    if (challenge) challenge.value = "";
  }
}

function renderSelectedSuggestionSummary() {
  const suggestion = selectedStorySuggestion();
  elements.selectedSuggestionSummary.hidden = !suggestion;
  if (!suggestion) {
    elements.selectedSuggestionSummary.innerHTML = "";
    return;
  }
  elements.selectedSuggestionSummary.innerHTML = `<strong>${escapeHtml(tr("suggestionSelected"))} : ${escapeHtml(suggestion.title)}</strong><span>${escapeHtml(suggestion.adventure)}</span><span><b>${escapeHtml(tr("intentionFirstStep"))} :</b> ${escapeHtml(suggestion.first_step || "")}</span><span><b>${escapeHtml(tr("intentionReward"))} :</b> ${escapeHtml(suggestion.reward || "")}</span>`;
}

function chooseStorySuggestion(id) {
  const suggestion = state.storySuggestions.find((item) => item.id === id);
  if (!suggestion) return;
  state.storySuggestionMode = "suggestion";
  document.querySelector("#story_seed_id").value = suggestion.id;
  document.querySelector("#story_seed_title").value = suggestion.title;
  document.querySelector("#story_seed_first_step").value = suggestion.first_step;
  document.querySelector("#story_seed_effort").value = suggestion.effort;
  document.querySelector("#story_seed_reward").value = suggestion.reward;
  document.querySelector("#story_seed_adaptation").value = suggestion.adventure;
  document.querySelector("#story_seed_moment").value = suggestion.moment;
  document.querySelector("#story_seed_transformation").value = suggestion.transformation;
  const dream = document.querySelector("#dream");
  const challenge = document.querySelector("#challenge");
  const message = document.querySelector("#message");
  if (dream) dream.value = suggestion.dream;
  if (challenge) challenge.value = suggestion.challenge;
  if (message) message.value = suggestion.transformation;
  renderStorySuggestions();
  renderSelectedSuggestionSummary();
  persistLocalDraft();
}

function chooseCustomStory() {
  clearIntentionChoice({ preserveSituation: true });
  state.storySuggestions = [];
  state.storySuggestionMode = "custom";
  resetStorySuggestionChoice({ preserveAnswers: true });
  state.storySuggestionMode = "custom";
  renderStorySuggestions();
  renderStoryIntentions();
  renderSelectedSuggestionSummary();
  persistLocalDraft();
}

function renderStorySuggestions() {
  const selectedId = document.querySelector("#story_seed_id")?.value || "";
  const universe = selectedUniverseOption();
  const contract = localizedUniverseContract(universe?.id);
  elements.suggestionUniverseSummary.innerHTML = universe
    ? `<strong>${escapeHtml(localizedUniverseName())}</strong><span>${escapeHtml(contract?.adventure || universe.storyContract?.adventureZone || "")}</span>`
    : "";
  elements.suggestionLoading.hidden = !state.storySuggestionsBusy;
  elements.refreshStorySuggestions.disabled = state.storySuggestionsBusy || !selectedStoryIntention();
  elements.customStoryChoice.disabled = state.storyIntentionsBusy || state.storySuggestionsBusy;
  elements.storySuggestionGrid.innerHTML = state.storySuggestions.map((suggestion) => `
    <article class="story-suggestion-card ${suggestion.id === selectedId ? "is-selected" : ""}">
      <span class="story-suggestion-lane">${escapeHtml(tr(`suggestionLane_${suggestion.id}`))}</span>
      <h3>${escapeHtml(suggestion.title)}</h3>
      <dl>
        <div><dt>${escapeHtml(tr("suggestionDream"))}</dt><dd>${escapeHtml(suggestion.dream)}</dd></div>
        <div><dt>${escapeHtml(tr("suggestionChallenge"))}</dt><dd>${escapeHtml(suggestion.challenge)}</dd></div>
        <div><dt>${escapeHtml(tr("intentionFirstStep"))}</dt><dd>${escapeHtml(suggestion.first_step)}</dd></div>
        <div><dt>${escapeHtml(tr("suggestionEffort"))}</dt><dd>${escapeHtml(suggestion.effort)}</dd></div>
        <div><dt>${escapeHtml(tr("intentionReward"))}</dt><dd>${escapeHtml(suggestion.reward)}</dd></div>
        <div><dt>${escapeHtml(tr("suggestionAdventure"))}</dt><dd>${escapeHtml(suggestion.adventure)}</dd></div>
        <div><dt>${escapeHtml(tr("suggestionMoment"))}</dt><dd>${escapeHtml(suggestion.moment)}</dd></div>
        <div><dt>${escapeHtml(tr("suggestionTransformation"))}</dt><dd>${escapeHtml(suggestion.transformation)}</dd></div>
      </dl>
      <button type="button" class="primary-button" data-story-suggestion="${escapeHtml(suggestion.id)}">${escapeHtml(suggestion.id === selectedId ? tr("editIdea") : tr("useIdea"))}</button>
    </article>`).join("");
  elements.storySuggestionGrid.querySelectorAll("[data-story-suggestion]").forEach((button) => {
    button.addEventListener("click", () => chooseStorySuggestion(button.dataset.storySuggestion));
  });
  elements.customStoryChoice.classList.toggle("is-selected", state.storySuggestionMode === "custom");
  elements.suggestionChoiceStatus.textContent = selectedId
    ? tr("suggestionSelected")
    : state.storySuggestionMode === "custom" ? tr("suggestionCustomSelected") : "";
}

async function requestStorySuggestions({ refresh = false } = {}) {
  if (state.storySuggestionsBusy || !state.selectedUniverse) return;
  const values = formValues();
  const intention = selectedStoryIntention();
  if (!intention || ![values.hero_name, values.age, values.favorite_activities, values.personality, values.creator_situation].every((value) => String(value || "").trim())) return;
  if (state.storySuggestions.length && !refresh) {
    renderStorySuggestions();
    return;
  }
  state.storySuggestionsBusy = true;
  elements.suggestionChoiceStatus.textContent = "";
  renderStoryIntentions();
  renderStorySuggestions();
  try {
    const response = await fetch("/api/story-suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        heroName: values.hero_name,
        age: values.age,
        favoriteActivities: values.favorite_activities,
        personality: values.personality,
        creatorSituation: values.creator_situation,
        selectedIntention: intention,
        universeId: state.selectedUniverse,
        locale: state.locale,
      }),
    });
    const payload = await response.json();
    if (!response.ok || !Array.isArray(payload.suggestions) || payload.suggestions.length !== 3) throw new Error(payload.error || tr("suggestionError"));
    state.storySuggestions = payload.suggestions;
    resetStorySuggestionChoice({ preserveAnswers: true });
    persistLocalDraft();
  } catch (error) {
    elements.suggestionChoiceStatus.textContent = error.message || tr("suggestionError");
  } finally {
    state.storySuggestionsBusy = false;
    renderStoryIntentions();
    renderStorySuggestions();
    if (state.storySuggestions.length && selectedStoryIntention()) {
      elements.adventureProposals.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
}

function renderUniverses() {
  const options = state.config.universeOptions;
  const ui = STYLE_UI_TEXT[state.locale] || STYLE_UI_TEXT.FR;
  elements.universeGrid.innerHTML = options.map((option) => {
    const [name, description] = UNIVERSE_TEXT[option.id]?.[state.locale] || [option.name, option.description];
    return `<div class="universe-card-wrap"><button type="button" class="visual-card universe-card preview-${option.id} ${option.id === state.selectedUniverse ? "is-selected" : ""}" data-universe-id="${option.id}" role="radio" aria-checked="${option.id === state.selectedUniverse}"><span class="visual-card-art" style="--c1:${option.palette[0]};--c2:${option.palette[1]};--c3:${option.palette[2]}">${option.previewImage ? `<img class="universe-after" src="${escapeHtml(option.previewImage)}" alt="${escapeHtml(`${name} — ${ui.after.toLowerCase()}`)}" loading="lazy" />` : ""}${option.referenceImage ? `<img class="universe-before" src="${escapeHtml(option.referenceImage)}" alt="${escapeHtml(ui.before.toLowerCase())}" loading="lazy" />` : ""}<span class="universe-image-label universe-after-label">${escapeHtml(ui.after)}</span><span class="universe-image-label universe-before-label">${escapeHtml(ui.before)}</span></span><span class="visual-card-copy"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(description)}</small></span></button><button type="button" class="universe-reference-toggle" data-universe-reference="${option.id}" aria-pressed="false">${escapeHtml(ui.show)}</button></div>`;
  }).join("");
  document.querySelector("#universe_id").value = state.selectedUniverse;
  document.querySelector("#universe").value = "";
  const selected = selectedUniverseOption();
  const contract = localizedUniverseContract(selected?.id);
  elements.universeSelectionSummary.hidden = !selected;
  elements.universeSelectionSummary.innerHTML = selected ? `<strong>${escapeHtml(localizedUniverseName())}</strong><span>${escapeHtml(contract?.adventure || selected.storyContract?.adventureZone || "")}</span>` : "";
  elements.universeGrid.querySelectorAll(".visual-card-art img").forEach((image) => image.addEventListener("error", () => image.remove()));
  elements.universeGrid.querySelectorAll("[data-universe-id]").forEach((button) => button.addEventListener("click", () => {
    const changed = state.selectedUniverse && state.selectedUniverse !== button.dataset.universeId;
    state.selectedUniverse = button.dataset.universeId;
    if (changed) {
      clearIntentionChoice({ preserveSituation: true });
      state.storySuggestions = [];
      resetStorySuggestionChoice({ preserveAnswers: true });
    }
    renderUniverses();
    renderStoryIntentions();
    renderStorySuggestions();
    emitWooConfiguration();
  }));
  elements.universeGrid.querySelectorAll("[data-universe-reference]").forEach((toggle) => toggle.addEventListener("click", () => {
    const card = toggle.closest(".universe-card-wrap").querySelector(".universe-card");
    const visible = !card.classList.contains("is-reference-visible");
    card.classList.toggle("is-reference-visible", visible);
    toggle.setAttribute("aria-pressed", String(visible));
    toggle.textContent = visible ? ui.hide : ui.show;
  }));
}

function renderStyles() {
  const styles = state.config.illustrationStyles;
  const modes = state.config.renderingModes || [];
  const ui = STYLE_UI_TEXT[state.locale] || STYLE_UI_TEXT.FR;
  const styleLead = document.querySelector('[data-i18n="styleLead"]');
  if (styleLead) styleLead.textContent = ui.lead;
  state.selectedStyle ||= styles.some((style) => style.id === "soft_watercolor") ? "soft_watercolor" : styles[0]?.id;
  elements.styleGrid.innerHTML = modes.map((mode) => {
    const [title, lead] = STYLE_MODE_TEXT[mode.id]?.[state.locale] || [mode.name, mode.description];
    const modeStyles = styles.filter((style) => style.renderingMode === mode.id);
    if (!modeStyles.length) return "";
    return `<section class="style-group style-group-${mode.id}"><header><div><h4>${escapeHtml(title)}</h4><p>${escapeHtml(lead)}</p></div>${mode.recommended ? `<span class="style-recommended">${escapeHtml(state.locale === "ES" ? "RECOMENDADO" : state.locale === "EN" ? "RECOMMENDED" : "RECOMMANDÉ")}</span>` : ""}</header><div class="style-group-grid">${modeStyles.map((style) => {
      const [name, description] = STYLE_TEXT[style.id]?.[state.locale] || [style.name, style.description];
      const likeness = ui[style.likeness] || ui.strong;
      return `<div class="style-card-wrap"><button type="button" class="style-card preview-${style.id} ${style.id === state.selectedStyle ? "is-selected" : ""}" data-style-id="${style.id}" role="radio" aria-checked="${style.id === state.selectedStyle}"><span class="style-preview" style="--c1:${style.palette[0]};--c2:${style.palette[1]};--c3:${style.palette[2]}">${style.previewImage ? `<img class="style-after" src="${escapeHtml(style.previewImage)}" alt="${escapeHtml(`${name} — ${ui.after.toLowerCase()}`)}" />` : ""}${style.referenceImage ? `<img class="style-before" src="${escapeHtml(style.referenceImage)}" alt="${escapeHtml(ui.before.toLowerCase())}" />` : ""}<span class="style-image-label style-after-label">${escapeHtml(ui.after)}</span><span class="style-image-label style-before-label">${escapeHtml(ui.before)}</span><span class="style-likeness-badge likeness-${style.likeness}">${escapeHtml(likeness)}</span></span><span class="style-card-copy"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(description)}</small></span></button><button type="button" class="style-reference-toggle" data-style-reference="${style.id}" aria-pressed="false">${escapeHtml(ui.show)}</button></div>`;
    }).join("")}</div></section>`;
  }).join("");
  elements.styleGrid.querySelectorAll(".style-preview img").forEach((image) => image.addEventListener("error", () => image.remove()));
  elements.styleGrid.querySelectorAll("[data-style-id]").forEach((button) => button.addEventListener("click", () => { state.selectedStyle = button.dataset.styleId; renderStyles(); emitWooConfiguration(); }));
  elements.styleGrid.querySelectorAll("[data-style-reference]").forEach((toggle) => toggle.addEventListener("click", () => {
    const card = toggle.closest(".style-card-wrap").querySelector(".style-card");
    const visible = !card.classList.contains("is-reference-visible");
    card.classList.toggle("is-reference-visible", visible);
    toggle.setAttribute("aria-pressed", String(visible));
    toggle.textContent = visible ? ui.hide : ui.show;
  }));
}

function renderFonts() {
  const sample = state.locale === "ES" ? "Había una vez una gran aventura..." : state.locale === "EN" ? "Once upon a time, a great adventure..." : "Il était une fois une grande aventure...";
  elements.fontGrid.innerHTML = state.config.typographyOptions.map((option) => `<button type="button" class="font-card font-${option.id} ${option.id === state.fontStyle ? "is-selected" : ""}" data-font-id="${option.id}" role="radio" aria-checked="${option.id === state.fontStyle}"><span>${escapeHtml(sample)}</span></button>`).join("");
  elements.fontGrid.querySelectorAll("[data-font-id]").forEach((button) => button.addEventListener("click", () => { state.fontStyle = button.dataset.fontId; renderFonts(); emitWooConfiguration(); }));
}

function renderProductTypes() {
  const products = [
    { id: "ebook", title: tr("ebook"), description: tr("ebookHelp") },
    { id: "print", title: tr("printBook"), description: isProductAvailable("print") ? tr("printBookHelp") : tr("printComingSoonHelp") },
  ];
  elements.productTypeGrid.innerHTML = products.map((product) => {
    const available = isProductAvailable(product.id);
    return `<button type="button" class="product-type-card ${product.id === state.productType ? "is-selected" : ""} ${available ? "" : "is-coming-soon"}" data-product-type="${product.id}" role="radio" aria-checked="${product.id === state.productType}" ${available ? "" : "disabled aria-disabled=\"true\""}><strong>${escapeHtml(product.title)}</strong>${available ? "" : `<span class="availability-badge">${escapeHtml(tr("comingSoon"))}</span>`}<small>${escapeHtml(product.description)}</small></button>`;
  }).join("");
  elements.productTypeGrid.querySelectorAll("[data-product-type]:not(:disabled)").forEach((button) => button.addEventListener("click", () => { state.productType = availableProductType(button.dataset.productType); renderProductTypes(); renderPageCounts(); updateBookMetrics(); emitWooConfiguration(); }));
}

function renderPageCounts() {
  elements.pageCountGrid.innerHTML = state.config.pageCountOptions.map((option) => `<button type="button" class="page-count-card ${option.pageCount === state.pageCount ? "is-selected" : ""}" data-page-count="${option.pageCount}" role="radio" aria-checked="${option.pageCount === state.pageCount}"><strong>${tr("pages", { count: option.pageCount })}</strong><small>${tr("illustrations", { count: option.illustrationCount })}</small><em>${formatPrice(state.productType === "ebook" ? option.ebookPriceEur : option.printPriceEur)}</em></button>`).join("");
  elements.pageCountGrid.querySelectorAll("[data-page-count]").forEach((button) => button.addEventListener("click", () => { state.pageCount = Number(button.dataset.pageCount); renderPageCounts(); updateBookMetrics(); emitWooConfiguration(); }));
}

function updateBookMetrics() {
  const illustrations = (state.pageCount - 2) / 2;
  const unitPrice = selectedUnitPrice() || 0;
  const price = selectedProductPrice() ?? state.pageCount * unitPrice;
  elements.costNote.textContent = `${tr("selectedPrice", { price: formatPrice(price), count: state.pageCount, unit: formatPrice(unitPrice) })} ${tr(state.productType === "ebook" ? "ebookCost" : "cost", { count: illustrations + 1, inside: illustrations })}`;
  elements.resultTitle.textContent = tr("resultTitle", { count: state.pageCount });
}

function addPhotos(files) {
  const remaining = 5 - state.photos.length;
  [...files].filter((file) => file.type.startsWith("image/")).slice(0, remaining).forEach((file) => {
    const role = state.photos.some((photo) => photo.role === "child") ? "" : "child";
    const storyRole = role === "child" ? "hero" : "";
    state.photos.push({ file, url: URL.createObjectURL(file), role, storyRole, name: "", relationship: "" });
  });
  renderPhotos();
}

function renderPhotos() {
  const labels = ROLE_LABELS[state.locale];
  elements.photoCount.textContent = state.photos.length;
  elements.photoList.innerHTML = state.photos.map((photo, index) => {
    const roleOptions = ["child", "mascot", "friend", "family", "other"].map((value) => `<option value="${value}" ${value === photo.role ? "selected" : ""}>${labels[value]}</option>`).join("");
    const storyRoleOptions = ["hero", "guide", "ally", "companion", "supporter", "guest"].map((value) => `<option value="${value}" ${value === photo.storyRole ? "selected" : ""} ${(photo.role === "child" && value !== "hero") || (photo.role !== "child" && value === "hero") ? "disabled" : ""}>${labels[value]}</option>`).join("");
    return `<article class="photo-item" data-photo-index="${index}"><img src="${photo.url}" alt="${escapeHtml(tr("photoPreview", { name: photo.file?.name || photo.name || "" }))}" /><div class="photo-meta"><label class="photo-meta-field"><span>${escapeHtml(tr("photoRelationshipLabel"))}</span><select data-field="role" required aria-required="true"><option value="" ${photo.role ? "" : "selected"}>${escapeHtml(tr("photoRoleChoice"))}</option>${roleOptions}</select></label><label class="photo-meta-field"><span>${escapeHtml(tr("photoStoryRoleLabel"))}</span><select data-field="storyRole" ${photo.role === "child" ? "disabled" : 'required aria-required="true"'}><option value="" ${photo.storyRole ? "" : "selected"}>${escapeHtml(tr("photoStoryRoleChoice"))}</option>${storyRoleOptions}</select></label><input data-field="name" value="${escapeHtml(photo.name)}" placeholder="${escapeHtml(tr("photoName"))}" /><input data-field="relationship" value="${escapeHtml(photo.relationship)}" placeholder="${escapeHtml(tr("relationship"))}" ${["family", "other"].includes(photo.role) ? 'required aria-required="true"' : ""} /></div><button type="button" class="remove-photo" aria-label="${escapeHtml(tr("removePhoto"))}">×</button></article>`;
  }).join("");
  elements.photoList.querySelectorAll(".photo-item").forEach((item) => {
    const index = Number(item.dataset.photoIndex);
    item.querySelector('[data-field="role"]').addEventListener("change", (event) => {
      const previous = state.photos[index].role;
      state.photos[index].role = event.target.value;
      if (event.target.value === "child") state.photos[index].storyRole = "hero";
      else if (previous === "child") state.photos[index].storyRole = "";
      renderPhotos();
    });
    item.querySelector('[data-field="storyRole"]').addEventListener("change", (event) => { state.photos[index].storyRole = event.target.value; });
    item.querySelector('[data-field="name"]').addEventListener("input", (event) => { state.photos[index].name = event.target.value; });
    item.querySelector('[data-field="relationship"]').addEventListener("input", (event) => { state.photos[index].relationship = event.target.value; });
    item.querySelector(".remove-photo").addEventListener("click", () => { if (state.photos[index].file) URL.revokeObjectURL(state.photos[index].url); state.photos.splice(index, 1); renderPhotos(); });
  });
}

function validateStep() {
  elements.formError.textContent = "";
  if (state.step === 0 && !state.selectedUniverse) {
    elements.formError.textContent = tr("invalidUniverse");
    return false;
  }
  if (state.step === 1 || state.step === 3) {
    const required = [...document.querySelector(`[data-panel="${state.step}"]`).querySelectorAll("[required]")];
    const invalid = required.filter((input) => !String(input.value).trim());
    required.forEach((input) => input.classList.toggle("is-invalid", invalid.includes(input)));
    if (invalid.length) { elements.formError.textContent = tr("invalidRequired"); invalid[0].focus(); return false; }
  }
  if (state.step === 2 && !selectedStorySuggestion() && state.storySuggestionMode !== "custom") {
    elements.formError.textContent = tr("suggestionRequired");
    return false;
  }
  if (state.step === 4 && !state.selectedStyle) { elements.formError.textContent = tr("invalidStyle"); return false; }
  if (state.step === 5) {
    if (state.photos.filter((photo) => photo.role === "child").length > 1) { elements.formError.textContent = tr("invalidChildPhoto"); return false; }
    if (state.photos.some((photo) => !photo.name.trim())) { elements.formError.textContent = tr("invalidPhotoName"); return false; }
    if (state.photos.some((photo) => !photo.role)) { elements.formError.textContent = tr("invalidPhotoRole"); return false; }
    if (state.photos.some((photo) => !photo.storyRole)) { elements.formError.textContent = tr("invalidPhotoStoryRole"); return false; }
    if (state.photos.some((photo) => ["family", "other"].includes(photo.role) && !photo.relationship.trim())) { elements.formError.textContent = tr("invalidPhotoRelationship"); return false; }
  }
  return true;
}

function localizedStyleName() { const style = STYLE_TEXT[state.selectedStyle]?.[state.locale]; return style?.[0] || state.selectedStyle; }
function localizedUniverseName() { const universe = UNIVERSE_TEXT[state.selectedUniverse]?.[state.locale]; return universe?.[0] || state.selectedUniverse; }

function renderReview() {
  const values = formValues(); const labels = ROLE_LABELS[state.locale];
  const chosenSuggestion = selectedStorySuggestion();
  const chosenIntention = selectedStoryIntention();
  const inspiration = chosenSuggestion?.title || (state.storySuggestionMode === "custom" ? tr("suggestionCustomSelected") : "—");
  const rows = [[tr("reviewHero"), `${values.hero_name || "—"}, ${values.age || "—"}`], [tr("reviewIntention"), chosenIntention?.title || tr("suggestionCustomSelected")], [tr("reviewInspiration"), inspiration], [tr("reviewDream"), values.dream || "—"], [tr("reviewChallenge"), values.challenge || "—"], [tr("reviewFirstStep"), values.story_seed_first_step || values.story_intent_first_step || "—"], [tr("reviewReward"), values.story_seed_reward || values.story_intent_reward || "—"], [tr("reviewMessage"), values.message || "—"], [tr("reviewUniverse"), localizedUniverseName()], [tr("reviewDetail"), values.extra_notes || tr("none")], [tr("reviewStyle"), localizedStyleName()], [tr("reviewFont"), document.querySelector(`.font-${state.fontStyle} span`)?.textContent || state.fontStyle], [tr("reviewProduct"), state.productType === "ebook" ? tr("ebook") : tr("printBook")], [tr("reviewPages"), `${tr("pages", { count: state.pageCount })} · ${formatPrice(selectedProductPrice() || 0)}`], [tr("reviewPhotos"), state.photos.length ? tr("referenceCharacters", { count: state.photos.length }) : tr("noPhotos")], [tr("reviewRoles"), state.photos.length ? state.photos.map((photo) => `${photo.name}: ${labels[photo.storyRole]}`).join(" · ") : "—"]];
  elements.reviewCard.innerHTML = rows.map(([label, value]) => `<div class="review-row"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`).join("");
}

function showStep(nextStep, shouldScroll = true) {
  state.step = Math.max(0, Math.min(REVIEW_STEP, nextStep));
  document.querySelectorAll(".form-panel").forEach((panel) => panel.classList.toggle("is-active", Number(panel.dataset.panel) === state.step));
  document.querySelectorAll(".step").forEach((step, index) => { step.classList.toggle("is-active", index === state.step); step.classList.toggle("is-complete", index < state.step); });
  elements.prevButton.hidden = state.step === 0; elements.nextButton.hidden = state.step === REVIEW_STEP;
  elements.mobileStepLabel.textContent = tr("stepLabel", { current: state.step + 1 }); elements.mobileProgressBar.style.width = `${((state.step + 1) / STEP_COUNT) * 100}%`; elements.formError.textContent = "";
  if (state.step === 2) {
    renderStoryIntentions();
    renderStorySuggestions();
  }
  if (state.step === REVIEW_STEP) renderReview();
  if (shouldScroll) document.querySelector("#creator").scrollIntoView({ behavior: "smooth", block: "start" });
}

function questionnaireFromState() {
  const universe = selectedUniverseOption();
  return {
    ...formValues(),
    ...productConfiguration(),
    universe_details: document.querySelector("#universe_details").value,
    universe_story_contract: universe?.storyContract || {},
    story_intentions: state.storyIntentions,
    story_suggestions: state.storySuggestions,
  };
}

function productConfiguration() {
  const selectedStyle = state.config?.illustrationStyles?.find((style) => style.id === state.selectedStyle);
  return {
    page_count: state.pageCount,
    product_type: state.productType,
    font_style: state.fontStyle,
    style_id: state.selectedStyle,
    rendering_mode: selectedStyle?.renderingMode || "illustrated_faithful",
    likeness_goal: selectedStyle?.likeness || "strong",
    universe_id: state.selectedUniverse,
    book_language: document.querySelector("#language").value,
    price_eur: selectedProductPrice() || 0,
    unit_page_price_eur: selectedUnitPrice() || 0,
    woo_variation_key: `${state.productType}_pages_${state.pageCount}`,
  };
}
function emitWooConfiguration() { const detail = productConfiguration(); window.dispatchEvent(new CustomEvent("storybook:configuration", { detail })); document.documentElement.dataset.storybookVariation = detail.woo_variation_key; }

async function uploadPhotos() {
  if (!state.photos.length) return [];
  const inherited = state.photos.filter((photo) => photo.storedRef).map((photo) => ({ ...photo.storedRef, role: photo.role, story_role: photo.storyRole, name: photo.name.trim(), relationship: photo.relationship }));
  const fresh = state.photos.filter((photo) => photo.file);
  if (!fresh.length) return inherited;
  const formData = new FormData(); fresh.forEach((photo) => formData.append("photos", photo.file));
  const response = await fetch("/api/upload", { method: "POST", body: formData }); const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || tr("uploadError"));
  return [...inherited, ...payload.photos.map((uploaded, index) => ({ id: uploaded.id, storageKey: uploaded.storageKey, mimeType: uploaded.mimeType, size: uploaded.size, role: fresh[index].role, story_role: fresh[index].storyRole, name: fresh[index].name.trim(), relationship: fresh[index].relationship }))];
}

function generationProgress(step = "") {
  if (step.includes("photo")) return 8;
  if (step.includes("storybrand")) return 13;
  if (step.includes("blueprint")) return 16;
  const manuscriptMatch = step.match(/draft:text:page:(\d+)/);
  if (manuscriptMatch) return Math.min(19, 16 + Number(manuscriptMatch[1]) * (3 / state.pageCount));
  if (step.includes("coherence-and-scene-contracts")) return 20;
  if (step.includes("scenario-fidelity-check")) return 21;
  if (step.includes("scenario-fidelity-repair")) return 22;
  if (step.includes("scenario-fidelity-recheck")) return 23;
  if (step.includes("scenario-fidelity-targeted-repair")) return 23;
  if (step.includes("scenario-fidelity-targeted-recheck")) return 24;
  if (step.includes("cover")) return 25;
  if (step.includes("quality:repair:page") || step.includes("draft:repair:page")) return 97;
  const pageMatch = step.match(/^(?:draft:)?page:(\d+)/);
  if (pageMatch) return Math.min(96, 25 + Number(pageMatch[1]) * (71 / state.pageCount));
  if (step.includes("done")) return 100;
  return 5;
}

function friendlyStep(step = "") {
  if (step.includes("photo")) return tr("progressPhoto");
  if (step.includes("storybrand")) return tr("progressStory");
  if (step.includes("blueprint")) return tr("progressBlueprint");
  if (step.includes("draft:text:page")) return tr("progressManuscript");
  if (step.includes("coherence-and-scene-contracts")) return tr("progressCoherence");
  if (step.includes("scenario-fidelity-targeted-repair")) return tr("progressFidelityRepair");
  if (step.includes("scenario-fidelity-repair")) return tr("progressFidelityRepair");
  if (step.includes("scenario-fidelity")) return tr("progressFidelityCheck");
  if (step.includes("cover")) return tr("progressCover");
  if (step.includes("quality:repair:page") || step.includes("draft:repair:page")) return tr("progressQualityRepair");
  const match = step.match(/^(?:draft:)?page:(\d+)/);
  return match ? tr("pageOf", { page: match[1], total: state.pageCount }) : tr("progressPreparing");
}

async function pollJob(jobId) {
  for (;;) {
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`);
    const job = await response.json();
    if (!response.ok) throw new TechnicalGenerationError(tr("generationFailed"), "preview_interrupted");
    elements.generationBar.style.width = `${generationProgress(job.step)}%`;
    elements.generationStep.textContent = friendlyStep(job.step);
    if (["done", "awaiting_visual_approval", "quality_review_required"].includes(job.status)) return job;
    if (job.status === "failed") throw new TechnicalGenerationError(tr("generationFailed"));
    await new Promise((resolve) => setTimeout(resolve, 2200));
  }
}

function renderBook(job, { initialPageNumber = 0 } = {}) {
  const { coverPreviewUrl, draftPages = [] } = job.result || {};
  const total = job.final_blueprint?.format?.interior_pages || state.pageCount;
  const orderedPages = draftPages.slice().sort((a, b) => a.page_number - b.page_number);
  const cover = coverPreviewUrl ? { previewUrl: coverPreviewUrl, page_number: 0, isCover: true } : null;
  const makeFrames = () => {
    if (window.matchMedia("(max-width: 900px)").matches) return [cover, ...orderedPages].filter(Boolean).map((page) => [page]);
    const frames = cover ? [[cover]] : [];
    const opening = orderedPages.find((page) => page.page_number === 1);
    if (opening) frames.push([opening]);
    for (let number = 2; number <= total - 2; number += 2) {
      frames.push(orderedPages.filter((page) => page.page_number === number || page.page_number === number + 1));
    }
    const closing = orderedPages.find((page) => page.page_number === total);
    if (closing) frames.push([closing]);
    return frames;
  };
  const pageMarkup = (page) => {
    const qualityReview = page.qualityStatus === "review_required";
    const reviewCopy = QUALITY_REVIEW_TEXT[state.locale] || QUALITY_REVIEW_TEXT.FR;
    return `<figure class="reader-page ${page.isCover ? "reader-cover" : ""} ${qualityReview ? "is-quality-review" : ""}"><img src="${escapeHtml(page.previewUrl)}" alt="${escapeHtml(page.isCover ? tr("readerCover") : tr("readerPage", { page: page.page_number }))}" draggable="false" /><span>${page.isCover ? escapeHtml(tr("readerCover")) : escapeHtml(tr("readerPage", { page: page.page_number }))}</span><em>${escapeHtml(tr("previewWatermark"))}</em>${qualityReview ? `<strong class="reader-quality-badge">${escapeHtml(reviewCopy.badge)}</strong>` : ""}</figure>`;
  };

  elements.bookPreview.innerHTML = `<div class="reader-shell"><div class="reader-book" id="readerBook" tabindex="0" aria-label="${escapeHtml(tr("readerLabel"))}"><div class="reader-sheet" id="readerSheet"><div class="reader-pages" id="readerPages"></div><div class="reader-curl" id="readerCurl" aria-hidden="true"><div class="reader-curl-face reader-curl-front" id="readerCurlFront"></div><div class="reader-curl-face reader-curl-back" id="readerCurlBack"></div></div></div><span class="reader-hand" aria-hidden="true">›</span></div><div class="reader-controls"><button type="button" id="readerPrevious" aria-label="${escapeHtml(tr("previousPage"))}">←</button><strong id="readerCounter" aria-live="polite"></strong><button type="button" id="readerNext" aria-label="${escapeHtml(tr("nextPage"))}">→</button></div><button type="button" class="reader-repair" id="repairCurrentIllustration" hidden></button><p class="reader-repair-feedback" id="readerRepairFeedback" aria-live="polite"></p><p class="reader-help">${escapeHtml(tr("readerHelp"))}</p></div>`;

  let frames = makeFrames();
  let frameIndex = initialPageNumber ? Math.max(0, frames.findIndex((frame) => frame.some((page) => Number(page.page_number) === Number(initialPageNumber)))) : 0;
  let turning = false;
  let touchStartX = 0;
  const readerBook = document.querySelector("#readerBook");
  const readerPages = document.querySelector("#readerPages");
  const readerCurl = document.querySelector("#readerCurl");
  const readerCurlFront = document.querySelector("#readerCurlFront");
  const readerCurlBack = document.querySelector("#readerCurlBack");
  const previousButton = document.querySelector("#readerPrevious");
  const nextButton = document.querySelector("#readerNext");
  const counter = document.querySelector("#readerCounter");
  const repairButton = document.querySelector("#repairCurrentIllustration");
  const repairFeedback = document.querySelector("#readerRepairFeedback");
  let repairPage = null;

  const paintFrame = () => {
    const frame = frames[frameIndex] || [];
    readerPages.className = `reader-pages ${frame.length === 1 ? "is-single" : "is-spread"}`;
    readerPages.innerHTML = frame.map(pageMarkup).join("");
    readerBook.classList.toggle("is-cover", Boolean(frame[0]?.isCover));
    counter.textContent = tr("readerPosition", { current: frameIndex + 1, total: frames.length });
    previousButton.disabled = frameIndex === 0;
    nextButton.disabled = frameIndex === frames.length - 1;
    repairPage = frame.find((page) => page.page_type === "image") || null;
    const canRepair = Boolean(
      repairPage
      && (!repairPage.technicalCheckAt || Number(repairPage.technicalCheckPolicyVersion || 1) < 3)
      && !repairPage.repairedAt
      && Number(repairPage.technicalRepairFailureCount || 0) < 2
      && state.projectId
      && [undefined, "preview_ready", "preview_repairing"].includes(job.projectStatus)
    );
    repairButton.hidden = !canRepair;
    if (canRepair) repairButton.textContent = tr("repairIllustration", { page: repairPage.page_number });
  };
  const turn = (direction) => {
    const target = frameIndex + direction;
    if (turning || target < 0 || target >= frames.length) return;
    turning = true;
    const currentFrame = frames[frameIndex] || [];
    const targetFrame = frames[target] || [];
    const frontPage = direction > 0 ? currentFrame[currentFrame.length - 1] : currentFrame[0];
    const backPage = direction > 0 ? targetFrame[0] : targetFrame[targetFrame.length - 1];
    const singlePageTurn = currentFrame.length === 1 || targetFrame.length === 1;
    readerCurlFront.innerHTML = frontPage ? pageMarkup(frontPage) : "";
    readerCurlBack.innerHTML = backPage ? pageMarkup(backPage) : "";
    readerCurl.className = `reader-curl is-active ${direction > 0 ? "is-forward" : "is-backward"} ${singlePageTurn ? "is-single" : ""}`;
    void readerCurl.offsetWidth;
    readerCurl.classList.add("is-turning");
    window.setTimeout(() => {
      frameIndex = target;
      paintFrame();
    }, 390);
    window.setTimeout(() => {
      readerCurl.className = "reader-curl";
      readerCurlFront.innerHTML = "";
      readerCurlBack.innerHTML = "";
      turning = false;
    }, 780);
  };
  state.readerGoToPage = (pageNumber) => {
    const target = frames.findIndex((frame) => frame.some((page) => Number(page.page_number) === Number(pageNumber)));
    if (target < 0) return false;
    frameIndex = target;
    paintFrame();
    elements.bookPreview.scrollIntoView({ behavior: "smooth", block: "center" });
    return true;
  };
  previousButton.addEventListener("click", () => turn(-1));
  nextButton.addEventListener("click", () => turn(1));
  readerBook.addEventListener("click", () => turn(1));
  readerBook.addEventListener("keydown", (event) => { if (event.key === "ArrowRight" || event.key === "Enter" || event.key === " ") { event.preventDefault(); turn(1); } if (event.key === "ArrowLeft") { event.preventDefault(); turn(-1); } });
  readerBook.addEventListener("touchstart", (event) => { touchStartX = event.changedTouches[0]?.clientX || 0; }, { passive: true });
  readerBook.addEventListener("touchend", (event) => { const distance = (event.changedTouches[0]?.clientX || 0) - touchStartX; if (Math.abs(distance) > 45) turn(distance < 0 ? 1 : -1); }, { passive: true });
  repairButton.addEventListener("click", async () => {
    if (!repairPage || repairButton.disabled) return;
    const pageNumber = repairPage.page_number;
    repairButton.disabled = true;
    repairButton.textContent = tr("repairingIllustration", { page: pageNumber });
    repairFeedback.textContent = "";
    elements.actionBuyEbook.disabled = true;
    elements.actionBuyPrint.disabled = true;
    let requestAccepted = false;
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(state.projectId)}/preview-pages/${encodeURIComponent(pageNumber)}/repair`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || tr("repairIllustrationError"));
      requestAccepted = true;
      const repairJob = await pollJob(payload.jobId);
      const projectResponse = await fetch(`/api/projects/${encodeURIComponent(state.projectId)}`, { cache: "no-store" });
      const projectPayload = await projectResponse.json();
      if (!projectResponse.ok) throw new Error(projectPayload.error || tr("repairIllustrationError"));
      showCompletedPreview({ result: projectPayload.project.previewResult, final_blueprint: projectPayload.project.finalBlueprint, projectStatus: projectPayload.project.status }, { scroll: false, initialPageNumber: pageNumber });
      const refreshedFeedback = document.querySelector("#readerRepairFeedback");
      if (refreshedFeedback) refreshedFeedback.textContent = repairJob.result?.repaired
        ? tr("repairIllustrationDone", { page: pageNumber })
        : (repairJob.result?.technicalDefect ? tr("repairIllustrationLimit") : tr("repairIllustrationNoDefect", { page: pageNumber }));
    } catch (error) {
      repairButton.disabled = false;
      repairButton.hidden = false;
      repairButton.textContent = tr("repairIllustrationRetry", { page: pageNumber });
      repairFeedback.textContent = requestAccepted ? tr("repairIllustrationRetryError") : tr("repairIllustrationError");
      if (requestAccepted) {
        try {
          const projectResponse = await fetch(`/api/projects/${encodeURIComponent(state.projectId)}`, { cache: "no-store" });
          const projectPayload = await projectResponse.json();
          if (projectResponse.ok) {
            showCompletedPreview({ result: projectPayload.project.previewResult, final_blueprint: projectPayload.project.finalBlueprint, projectStatus: projectPayload.project.status }, { scroll: false, initialPageNumber: pageNumber });
            const refreshedFeedback = document.querySelector("#readerRepairFeedback");
            const refreshedPage = projectPayload.project.previewResult?.draftPages?.find((page) => Number(page.page_number) === Number(pageNumber));
            if (refreshedFeedback) refreshedFeedback.textContent = Number(refreshedPage?.technicalRepairFailureCount || 0) >= 2
              ? tr("repairIllustrationExhausted")
              : tr("repairIllustrationRetryError");
          }
        } catch {
          // Keep the current preview and retry control visible if refreshing fails.
        }
      }
      elements.actionBuyEbook.disabled = false;
      elements.actionBuyPrint.disabled = !isProductAvailable("print");
    }
  });
  paintFrame();
}

function showGenerationPanel(stage = "cover") {
  const stages = GENERATION_STAGE_TEXT[state.locale] || GENERATION_STAGE_TEXT.FR;
  const copy = stages[stage] || stages.cover;
  document.querySelector("#creator").hidden = true;
  elements.storyScenarioPanel.hidden = true;
  elements.resultSection.hidden = true;
  elements.visualProofPanel.hidden = true;
  elements.generationFailurePanel.hidden = true;
  elements.generationPanel.hidden = false;
  elements.generationKicker.textContent = copy.kicker;
  elements.generationTitle.textContent = copy.title;
  elements.generationMessage.textContent = copy.message;
  elements.generationNextStep.textContent = copy.next;
  elements.generationBar.style.width = "5%";
  elements.generationStep.textContent = friendlyStep("preparing");
  elements.generationPanel.scrollIntoView({ behavior: "smooth" });
}

async function savePreviewNotificationPreference() {
  if (!state.projectId || !state.customerSession?.authenticated) return;
  const response = await fetch(`/api/projects/${encodeURIComponent(state.projectId)}/preview-notification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: elements.notifyPreviewEmail.checked }),
  });
  if (!response.ok) elements.generationStep.textContent = tr("notifyPreviewEmailError");
}

async function showGenerationFailure(project = null) {
  if (!project && state.projectId) {
    const response = await fetch(`/api/projects/${encodeURIComponent(state.projectId)}`, { cache: "no-store" });
    if (response.ok) project = (await response.json()).project;
  }
  if (project?.status === "preview_generating") {
    await fetch(`/api/projects/${encodeURIComponent(state.projectId)}/preview-recover`, { method: "POST" }).catch(() => null);
    const refreshed = await fetch(`/api/projects/${encodeURIComponent(state.projectId)}`, { cache: "no-store" }).catch(() => null);
    if (refreshed?.ok) project = (await refreshed.json()).project;
  }
  document.querySelector("#creator").hidden = true;
  elements.storyScenarioPanel.hidden = true;
  elements.generationPanel.hidden = true;
  elements.resultSection.hidden = true;
  elements.visualProofPanel.hidden = true;
  elements.generationFailurePanel.hidden = false;
  const exhausted = project?.technicalPreviewRetryExhausted === true;
  elements.retryPreviewButton.hidden = exhausted;
  elements.generationFailureSupport.textContent = exhausted ? tr("generationFailureExhausted") : tr("generationFailureSupport");
  elements.generationFailurePanel.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function retryPreviewFree() {
  if (!state.projectId || elements.retryPreviewButton.disabled) return;
  elements.retryPreviewButton.disabled = true;
  elements.retryPreviewButton.textContent = tr("retryingPreview");
  try {
    const projectResponse = await fetch(`/api/projects/${encodeURIComponent(state.projectId)}`, { cache: "no-store" });
    const project = projectResponse.ok ? (await projectResponse.json()).project : null;
    if (project?.status === "preview_generating") {
      const recovery = await fetch(`/api/projects/${encodeURIComponent(state.projectId)}/preview-recover`, { method: "POST" });
      if (!recovery.ok) throw new TechnicalGenerationError(tr("generationFailed"));
    }
    await generatePreviewForProject(state.projectId);
  } catch (error) {
    await showGenerationFailure();
  } finally {
    elements.retryPreviewButton.disabled = false;
    elements.retryPreviewButton.textContent = tr("retryPreviewFree");
  }
}

function showCompletedPreview(job, { scroll = true, initialPageNumber = 0 } = {}) {
  document.querySelector("#creator").hidden = true;
  elements.storyScenarioPanel.hidden = true;
  elements.generationPanel.hidden = true;
  elements.generationFailurePanel.hidden = true;
  elements.visualProofPanel.hidden = true;
  elements.resultSection.hidden = false;
  elements.qualityReviewNotice.hidden = true;
  state.referenceRecoveryAvailable = Boolean(job.referenceRecoveryAvailable);
  state.currentPreview = job;
  renderBook(job, { initialPageNumber });
  setPreviewComplete(true);
  renderPreviewActionCenter({
    locked: ["preview_repairing", "preview_quality_review"].includes(job.projectStatus),
    qualityReview: job.projectStatus === "preview_quality_review",
  })
    .then(() => refreshLatestModification())
    .catch(() => null);
  if (scroll) elements.resultSection.scrollIntoView({ behavior: "smooth" });
}

async function refreshAfterQualityDecision(pageNumber, feedback = "") {
  const response = await fetch(`/api/projects/${encodeURIComponent(state.projectId)}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "quality_review_refresh_failed");
  const project = payload.project;
  const preview = {
    result: project.previewResult,
    final_blueprint: project.finalBlueprint,
    projectStatus: project.status,
    qualityReview: project.continuitySnapshot?.generationCheckpoint?.qualityReview,
  };
  if (project.status === "preview_ready") {
    showCompletedPreview(preview, { initialPageNumber: pageNumber });
    return project;
  }
  showQualityReview(preview, { scroll: false });
  if (feedback) {
    const target = elements.qualityReviewPages.querySelector(`[data-quality-feedback="${Number(pageNumber)}"]`);
    if (target) target.textContent = feedback;
  }
  return project;
}

function localizedQualityIssues(issues, copy) {
  const source = Array.isArray(issues) ? issues.join(" ").toLowerCase() : "";
  const labels = [];
  if (/(missing|required named character|absent|manquant|falta)/.test(source)) labels.push(copy.issueMissing);
  if (/(main action|action subject|wrong central actor|action principale)/.test(source)) labels.push(copy.issueAction);
  if (/(fusion|mixed|mélang|mezclad|exchanged anatomy)/.test(source)) labels.push(copy.issueFusion);
  return labels.length ? [...new Set(labels)] : [copy.issueGeneric];
}

function showQualityReview(job, { scroll = true } = {}) {
  const copy = QUALITY_REVIEW_TEXT[state.locale] || QUALITY_REVIEW_TEXT.FR;
  const pages = job?.qualityReview?.pages
    || job?.continuitySnapshot?.generationCheckpoint?.qualityReview?.pages
    || job?.result?.draftPages
      ?.filter((page) => page.qualityStatus === "review_required")
      .map((page) => ({ pageNumber: page.page_number }))
    || [];
  showCompletedPreview({ ...job, projectStatus: "preview_quality_review" }, { scroll: false });
  elements.qualityReviewKicker.textContent = copy.kicker;
  elements.qualityReviewTitle.textContent = copy.title;
  elements.qualityReviewMessage.textContent = copy.message;
  elements.qualityReviewPages.innerHTML = pages
    .map((page) => {
      const draftPage = job?.result?.draftPages?.find((candidate) => (
        Number(candidate.page_number) === Number(page.pageNumber)
      ));
      const candidate = draftPage?.qualityReviewCandidate?.status === "ready"
        ? draftPage.qualityReviewCandidate
        : null;
      const issueLabels = localizedQualityIssues(draftPage?.qualityIssues || page.issues, copy);
      const repairExhausted = Number(draftPage?.qualityReviewRepairCount || page.repairCount || 0) >= 1;
      return `<li class="quality-review-page-card" data-quality-page="${Number(page.pageNumber)}">
        <div>
          <strong>${escapeHtml(copy.page.replace("{page}", String(page.pageNumber)))}</strong>
          <div class="quality-review-detected">
            <span>${escapeHtml(copy.detectedTitle)}</span>
            <ul>${issueLabels.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>
          </div>
          ${candidate ? `<div class="quality-review-comparison">
            <figure>
              <figcaption>${escapeHtml(copy.current)}</figcaption>
              <img src="${escapeHtml(draftPage.previewUrl)}" alt="${escapeHtml(copy.current)}" />
            </figure>
            <figure>
              <figcaption>${escapeHtml(copy.proposed)}</figcaption>
              <img src="${escapeHtml(candidate.previewUrl)}" alt="${escapeHtml(copy.proposed)}" />
            </figure>
          </div>` : ""}
          ${!candidate && !repairExhausted ? `<label class="quality-review-instruction">
            <span>${escapeHtml(copy.instructionLabel)}</span>
            <textarea rows="3" maxlength="500" data-quality-instruction="${Number(page.pageNumber)}" placeholder="${escapeHtml(copy.instructionPlaceholder)}"></textarea>
            <small>${escapeHtml(copy.instructionHelp)}</small>
          </label>` : ""}
          <p class="quality-review-feedback" data-quality-feedback="${Number(page.pageNumber)}">${
            candidate
              ? escapeHtml(copy.candidateReady)
              : repairExhausted
                ? escapeHtml(copy.repairExhausted)
                : ""
          }</p>
        </div>
        <div class="quality-review-page-actions">
          <button type="button" class="secondary-button" data-quality-view="${Number(page.pageNumber)}">${escapeHtml(copy.view)}</button>
          ${candidate
            ? `<button type="button" class="secondary-button" data-quality-keep-original="${Number(page.pageNumber)}">${escapeHtml(copy.keepOriginal)}</button>
              <button type="button" class="primary-button" data-quality-use-candidate="${Number(page.pageNumber)}">${escapeHtml(copy.useCandidate)}</button>`
            : `<button type="button" class="secondary-button" data-quality-approve="${Number(page.pageNumber)}">${escapeHtml(copy.approve)}</button>
              ${repairExhausted ? "" : `<button type="button" class="secondary-button" data-quality-repair="${Number(page.pageNumber)}">${escapeHtml(copy.repair)}</button>`}`
          }
        </div>
      </li>`;
    })
    .join("");
  elements.qualityReviewSupport.textContent = copy.support;
  elements.qualityReviewNotice.hidden = false;
  elements.qualityReviewPages.querySelectorAll("[data-quality-view]").forEach((button) => {
    button.addEventListener("click", () => state.readerGoToPage?.(Number(button.dataset.qualityView)));
  });
  elements.qualityReviewPages.querySelectorAll("[data-quality-approve]").forEach((button) => {
    button.addEventListener("click", async () => {
      const pageNumber = Number(button.dataset.qualityApprove);
      if (!window.confirm(copy.approveConfirm)) return;
      const card = button.closest(".quality-review-page-card");
      card?.querySelectorAll("button").forEach((candidate) => { candidate.disabled = true; });
      const feedback = card?.querySelector(".quality-review-feedback");
      if (feedback) feedback.textContent = copy.approving;
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(state.projectId)}/quality-review/pages/${pageNumber}/approve`, { method: "POST" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || copy.actionError);
        await refreshAfterQualityDecision(pageNumber);
      } catch {
        card?.querySelectorAll("button").forEach((candidate) => { candidate.disabled = false; });
        if (feedback) feedback.textContent = copy.actionError;
      }
    });
  });
  elements.qualityReviewPages.querySelectorAll("[data-quality-repair]").forEach((button) => {
    button.addEventListener("click", async () => {
      const pageNumber = Number(button.dataset.qualityRepair);
      const card = button.closest(".quality-review-page-card");
      card?.querySelectorAll("button, textarea").forEach((candidate) => { candidate.disabled = true; });
      const feedback = card?.querySelector(".quality-review-feedback");
      if (feedback) feedback.textContent = copy.repairing.replace("{page}", String(pageNumber));
      try {
        const instruction = card?.querySelector(`[data-quality-instruction="${pageNumber}"]`)?.value || "";
        const response = await fetch(`/api/projects/${encodeURIComponent(state.projectId)}/quality-review/pages/${pageNumber}/repair`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instruction }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || copy.actionError);
        const repairJob = await pollJob(payload.jobId);
        await refreshAfterQualityDecision(
          pageNumber,
          repairJob.result?.candidateReady ? copy.candidateReady : copy.repairExhausted,
        );
      } catch {
        await refreshAfterQualityDecision(pageNumber, copy.actionError).catch(() => {
          card?.querySelectorAll("button, textarea").forEach((candidate) => { candidate.disabled = false; });
          if (feedback) feedback.textContent = copy.actionError;
        });
      }
    });
  });
  elements.qualityReviewPages.querySelectorAll("[data-quality-keep-original]").forEach((button) => {
    button.addEventListener("click", async () => {
      const pageNumber = Number(button.dataset.qualityKeepOriginal);
      if (!window.confirm(copy.keepConfirm)) return;
      const card = button.closest(".quality-review-page-card");
      card?.querySelectorAll("button, textarea").forEach((candidate) => { candidate.disabled = true; });
      const feedback = card?.querySelector(".quality-review-feedback");
      if (feedback) feedback.textContent = copy.choosing;
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(state.projectId)}/quality-review/pages/${pageNumber}/keep-original`, { method: "POST" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || copy.actionError);
        await refreshAfterQualityDecision(pageNumber);
      } catch {
        card?.querySelectorAll("button, textarea").forEach((candidate) => { candidate.disabled = false; });
        if (feedback) feedback.textContent = copy.actionError;
      }
    });
  });
  elements.qualityReviewPages.querySelectorAll("[data-quality-use-candidate]").forEach((button) => {
    button.addEventListener("click", async () => {
      const pageNumber = Number(button.dataset.qualityUseCandidate);
      if (!window.confirm(copy.useConfirm)) return;
      const card = button.closest(".quality-review-page-card");
      card?.querySelectorAll("button, textarea").forEach((candidate) => { candidate.disabled = true; });
      const feedback = card?.querySelector(".quality-review-feedback");
      if (feedback) feedback.textContent = copy.choosing;
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(state.projectId)}/quality-review/pages/${pageNumber}/use-candidate`, { method: "POST" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || copy.actionError);
        await refreshAfterQualityDecision(pageNumber);
      } catch {
        card?.querySelectorAll("button, textarea").forEach((candidate) => { candidate.disabled = false; });
        if (feedback) feedback.textContent = copy.actionError;
      }
    });
  });
  if (scroll) elements.qualityReviewNotice.scrollIntoView({ behavior: "smooth", block: "center" });
}

function showVisualProof(job, { scroll = true, attempts = 1 } = {}) {
  const copy = VISUAL_PROOF_TEXT[state.locale] || VISUAL_PROOF_TEXT.FR;
  const result = job?.result || {};
  document.querySelector("#creator").hidden = true;
  elements.storyScenarioPanel.hidden = true;
  elements.generationPanel.hidden = true;
  elements.generationFailurePanel.hidden = true;
  elements.resultSection.hidden = true;
  elements.visualProofPanel.hidden = false;
  elements.visualProofKicker.textContent = copy.kicker;
  elements.visualProofTitle.textContent = copy.title;
  elements.visualProofLead.textContent = copy.lead;
  elements.visualProofChecklist.innerHTML = copy.checks.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  elements.visualProofImage.src = result.coverPreviewUrl || result.coverImageUrl || "";
  elements.visualProofImage.alt = copy.alt;
  elements.approveVisualProofButton.textContent = copy.approve;
  elements.regenerateVisualProofButton.textContent = copy.regenerate;
  elements.regenerateVisualProofButton.hidden = Number(attempts || 1) >= 2;
  elements.visualProofNote.textContent = Number(attempts || 1) >= 2 ? copy.limit : copy.note;
  elements.visualProofFeedback.textContent = "";
  if (scroll) elements.visualProofPanel.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function generatePreviewForProject(projectId, visualProofAction = "") {
  const response = await fetch("/api/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, ...(visualProofAction ? { visualProofAction } : {}) }),
  });
  const payload = await response.json();
  if (!response.ok) { if (payload.code === "insufficient_credit") await refreshCreditSummary(projectId); if (payload.code === "preview_interrupted") throw new TechnicalGenerationError(tr("generationFailed"), payload.code); throw new Error(payload.error || tr("startError")); }
  showGenerationPanel(visualProofAction === "approve" ? "interior" : visualProofAction === "regenerate" ? "regenerate" : "cover");
  state.jobId = payload.jobId;
  const job = await pollJob(payload.jobId);
  if (job.status === "awaiting_visual_approval") {
    showVisualProof(job, { attempts: job.visualProof?.attempts || 1 });
    return;
  }
  if (job.status === "quality_review_required") {
    showQualityReview(job);
    return;
  }
  elements.generationBar.style.width = "100%";
  showCompletedPreview(job);
}

async function submitVisualProof(action) {
  if (!state.projectId || elements.approveVisualProofButton.disabled) return;
  const copy = VISUAL_PROOF_TEXT[state.locale] || VISUAL_PROOF_TEXT.FR;
  elements.approveVisualProofButton.disabled = true;
  elements.regenerateVisualProofButton.disabled = true;
  elements.visualProofFeedback.textContent = copy.working;
  try {
    await generatePreviewForProject(state.projectId, action);
  } catch (error) {
    if (error?.technical) {
      await showGenerationFailure();
      return;
    }
    elements.visualProofPanel.hidden = false;
    elements.generationPanel.hidden = true;
    elements.visualProofFeedback.textContent = error.message || tr("generationFailed");
  } finally {
    elements.approveVisualProofButton.disabled = false;
    elements.regenerateVisualProofButton.disabled = false;
  }
}

async function restoreCompletedPreview() {
  if (!state.customerSession?.authenticated || !state.projectId) return false;
  const response = await fetch(`/api/projects/${encodeURIComponent(state.projectId)}`, { cache: "no-store" });
  if (!response.ok) return false;
  const payload = await response.json();
  const project = payload.project;
  state.currentPreview = project ? {
    result: project.previewResult,
    final_blueprint: project.finalBlueprint,
    projectStatus: project.status,
  } : null;
  elements.notifyPreviewEmail.checked = project?.continuitySnapshot?.previewNotification?.emailRequested === true;
  const scenario = project?.continuitySnapshot?.storyScenario;
  if (scenario && (["scenario_review", "scenario_needs_clarification"].includes(project?.status)
    || (project?.status === "ready_for_preview" && scenario?.status === "approved"))) {
    renderStoryScenario(scenario, { scroll: false });
    return true;
  }
  const visualProof = project?.continuitySnapshot?.generationCheckpoint?.visualProof;
  if (project?.status === "preview_generating" && visualProof?.status === "awaiting_approval" && project.previewResult) {
    showVisualProof({ result: project.previewResult, final_blueprint: project.finalBlueprint }, { scroll: false, attempts: visualProof.attempts || 1 });
    return true;
  }
  if (project?.status === "preview_generating" && project.generationJobId) {
    showGenerationPanel(visualProof?.status === "approved" ? "interior" : visualProof?.status === "regenerating" ? "regenerate" : "cover");
    try {
      const jobResponse = await fetch(`/api/jobs/${encodeURIComponent(project.generationJobId)}`, { cache: "no-store" });
      if (jobResponse.ok) {
        const job = await pollJob(project.generationJobId);
        elements.generationBar.style.width = "100%";
        if (job.status === "quality_review_required") showQualityReview(job, { scroll: false });
        else showCompletedPreview(job, { scroll: false });
      } else {
        await fetch(`/api/projects/${encodeURIComponent(project.id)}/preview-recover`, { method: "POST" });
        await showGenerationFailure();
      }
    } catch (error) {
      await showGenerationFailure();
    }
    return true;
  }
  if (project?.status === "preview_quality_review" && project.previewResult) {
    showQualityReview({
      result: project.previewResult,
      final_blueprint: project.finalBlueprint,
      projectStatus: project.status,
      qualityReview: project.continuitySnapshot?.generationCheckpoint?.qualityReview,
    }, { scroll: false });
    return true;
  }
  if (project?.status === "preview_failed") {
    await showGenerationFailure(project);
    return true;
  }
  if (project?.technicalReferenceRetryAvailable) {
    await preparePreviewAuthorization(project.id);
    elements.creditFeedback.textContent = tr("recoverReferencesReady");
    return true;
  }
  if (!["preview_ready", "preview_repairing", "purchased"].includes(project?.status) || !project.previewResult) return false;
  showCompletedPreview({ result: project.previewResult, final_blueprint: project.finalBlueprint, projectStatus: project.status, referenceRecoveryAvailable: project.referenceRecoveryAvailable }, { scroll: false });
  return true;
}

async function resumePreviewAfterLogin() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("auth") !== "connected") return;
  let pendingCreditPurchase = null;
  try { pendingCreditPurchase = JSON.parse(localStorage.getItem(PENDING_CREDIT_PURCHASE_KEY) || "null"); }
  catch { pendingCreditPurchase = null; }
  if (!pendingCreditPurchase?.startedAt || Date.now() - Number(pendingCreditPurchase.startedAt) > 24 * 60 * 60 * 1000) pendingCreditPurchase = null;
  const creditReturnContext = params.get("creditReturn") || pendingCreditPurchase?.context || "";
  const creditReturnStatus = params.get("creditStatus") || (creditReturnContext ? "back" : "");
  const projectId = params.get("project") || pendingCreditPurchase?.projectId || localStorage.getItem(PENDING_PREVIEW_KEY) || "";
  if (params.get("newAdventure") === "1") return resumeNextAdventure(projectId);
  window.history.replaceState({}, "", `${window.location.pathname}#creator`);
  localStorage.removeItem(PENDING_PREVIEW_KEY);
  localStorage.removeItem(PENDING_CREDIT_PURCHASE_KEY);
  if (!projectId) return;
  state.projectId = projectId;
  persistLocalDraft();
  try {
    const restored = await restoreCompletedPreview();
    if (!restored) await preparePreviewAuthorization(projectId);
    if (restored && creditReturnContext === "modification") await openModificationPanel();
    if (creditReturnContext) {
      const summary = await refreshCreditSummary(projectId).catch(() => null);
      const previousBalanceCents = Number(pendingCreditPurchase?.balanceCents);
      const settledDuringReturn = ["syncing", "pending"].includes(creditReturnStatus)
        && Number.isFinite(previousBalanceCents)
        && Number(summary?.balanceCents || 0) > previousBalanceCents;
      showCreditReturnNotice(settledDuringReturn ? "paid" : creditReturnStatus, summary);
      if (!settledDuringReturn && ["syncing", "pending"].includes(creditReturnStatus)) {
        monitorCreditReturnBalance(projectId, previousBalanceCents).catch(() => null);
      }
    }
  } catch (error) {
    document.querySelector("#creator").hidden = false;
    elements.generationPanel.hidden = true;
    elements.formError.textContent = error.message;
    elements.formError.scrollIntoView({ behavior: "smooth" });
  }
}

function loadSeriesDraft(project) {
  const questionnaire = project.questionnaire || {};
  const configuration = project.productConfiguration || {};
  state.projectId = project.id;
  state.pageCount = Number(questionnaire.page_count || configuration.page_count || state.pageCount);
  state.selectedStyle = questionnaire.style_id || configuration.style_id || state.selectedStyle;
  state.selectedUniverse = questionnaire.universe_id || configuration.universe_id || state.selectedUniverse;
  state.fontStyle = questionnaire.font_style || configuration.font_style || state.fontStyle;
  state.productType = availableProductType(questionnaire.product_type || configuration.product_type || state.productType);
  state.storyIntentions = Array.isArray(questionnaire.story_intentions) ? questionnaire.story_intentions : [];
  state.storySuggestions = Array.isArray(questionnaire.story_suggestions) ? questionnaire.story_suggestions : [];
  state.storySuggestionMode = questionnaire.story_seed_id ? "suggestion" : "custom";
  renderQuestions(questionnaire);
  restoreValues(questionnaire);
  document.querySelector("#language").value = questionnaire.book_language || configuration.book_language || project.locale || "FR";
  renderUniverses(); renderStoryIntentions(); renderStorySuggestions(); renderSelectedSuggestionSummary(); renderStyles(); renderFonts(); renderProductTypes(); renderPageCounts();
  state.photos.forEach((photo) => { if (photo.file) URL.revokeObjectURL(photo.url); });
  state.photos = (project.photoRefs || []).map((photo) => ({
    file: null, storedRef: photo,
    url: `/api/projects/${encodeURIComponent(project.id)}/reference-photos/${encodeURIComponent(photo.id)}`,
    role: photo.role || "other", storyRole: photo.storyRole || photo.story_role || defaultStoryRole(photo.role),
    name: photo.name || "", relationship: photo.relationship || "",
  }));
  renderPhotos(); setPreviewComplete(false);
  state.awaitingPreviewConfirmation = false;
  elements.creditPanel.hidden = true; elements.resultSection.hidden = true;
  elements.storyScenarioPanel.hidden = true;
  elements.seriesDraftNotice.hidden = false;
  persistLocalDraft(); showStep(0, false);
  document.querySelector("#creator").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function resumeNextAdventure(sourceProjectId) {
  window.history.replaceState({}, "", `${window.location.pathname}#creator`);
  localStorage.removeItem(PENDING_PREVIEW_KEY);
  if (!sourceProjectId) return;
  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(sourceProjectId)}/next-adventure`, { method: "POST" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || tr("seriesDraftError"));
    loadSeriesDraft(payload.project);
  } catch (error) {
    document.querySelector("#creator").hidden = false;
    elements.formError.textContent = error.message;
    elements.formError.scrollIntoView({ behavior: "smooth" });
  }
}

async function startGeneration(event) {
  event.preventDefault();
  elements.formError.textContent = "";
  const submit = elements.form.querySelector("[type=submit]");
  submit.disabled = true;
  submit.textContent = tr("loading");
  let leavingForLogin = false;
  try {
    const uploadedPhotos = await uploadPhotos();
    if (state.referenceRecoveryMode) {
      if (!uploadedPhotos.length) throw new Error(tr("recoverReferencesInstructions"));
      const recoveryResponse = await fetch(`/api/projects/${encodeURIComponent(state.projectId)}/reference-recovery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: uploadedPhotos }),
      });
      const recoveryPayload = await recoveryResponse.json();
      if (!recoveryResponse.ok) throw new Error(recoveryPayload.error || tr("recoverReferencesError"));
      state.referenceRecoveryMode = false;
      await preparePreviewAuthorization(state.projectId);
      elements.creditFeedback.textContent = tr("recoverReferencesReady");
      return;
    }
    const questionnaire = questionnaireFromState();
    const project = await saveServerDraft(questionnaire, uploadedPhotos);
    const session = await readCustomerSession();
    if (!session.authenticated) {
      leavingForLogin = true;
      localStorage.setItem(PENDING_PREVIEW_KEY, project.id);
      window.location.assign(`/api/auth/woocommerce/start?projectId=${encodeURIComponent(project.id)}`);
      return;
    }
    await claimProject(project.id);
    await preparePreviewAuthorization(project.id);
  } catch (error) {
    document.querySelector("#creator").hidden = false;
    elements.generationPanel.hidden = true;
    elements.formError.textContent = error.message;
    elements.formError.scrollIntoView({ behavior: "smooth" });
  } finally {
    if (!leavingForLogin && !state.previewComplete) {
      submit.disabled = false;
      submit.innerHTML = `<span>${escapeHtml(tr("reviewCreditsAction"))}</span> <span>→</span>`;
    }
  }
}

function changeLocale(locale) {
  const values = state.config ? formValues() : {}; state.locale = ["FR", "ES", "EN"].includes(locale) ? locale : "FR"; localStorage.setItem("storybook-ui-language", state.locale); applyTranslations();
  if (state.config) { renderQuestions(values); renderUniverses(); renderStoryIntentions(); renderStorySuggestions(); renderSelectedSuggestionSummary(); renderStyles(); renderFonts(); renderProductTypes(); renderPageCounts(); renderPhotos(); if (state.step === REVIEW_STEP) renderReview(); showStep(state.step, false); }
}

async function init() {
  try {
    const response = await fetch("/api/questionnaire");
    state.config = await response.json();
    if (!response.ok) throw new Error("Configuration unavailable");
    const saved = newBookRequested ? null : readLocalDraft();
    state.pageCount = saved?.pageCount || state.config.bookFormat.interiorPageCount;
    state.selectedStyle = saved?.selectedStyle || "";
    state.selectedUniverse = saved?.selectedUniverse || "";
    state.fontStyle = saved?.fontStyle || state.fontStyle;
    state.productType = availableProductType(saved?.productType || requestedProductType || state.productType);
    state.projectId = saved?.projectId || "";
    state.storyIntentions = Array.isArray(saved?.storyIntentions) ? saved.storyIntentions : [];
    state.storySuggestions = Array.isArray(saved?.storySuggestions) ? saved.storySuggestions : [];
    state.storySuggestionMode = saved?.storySuggestionMode || "";
    changeLocale(saved?.locale || state.locale);
    if (saved?.values) restoreValues(saved.values);
    renderStoryIntentions();
    renderStorySuggestions();
    renderSelectedSuggestionSummary();
    if (Number.isInteger(saved?.step)) {
      const legacyStepMap = [1, 3, 4, 5, 6];
      const restoredStep = Number(saved.flowVersion || 0) >= 2 ? saved.step : legacyStepMap[saved.step] ?? 0;
      showStep(Math.max(0, Math.min(REVIEW_STEP, restoredStep)), false);
    }
    emitWooConfiguration();
    await refreshCustomerSession();
    await refreshCreditSummary("").catch(() => null);
    const authCallback = new URLSearchParams(window.location.search).get("auth") === "connected";
    if (authCallback) await resumePreviewAfterLogin();
    else await restoreCompletedPreview();
  }
  catch { elements.formError.textContent = "Configuration unavailable"; elements.nextButton.disabled = true; }
}

elements.photoInput.addEventListener("change", (event) => { addPhotos(event.target.files); event.target.value = ""; });
["dragenter", "dragover"].forEach((name) => elements.photoDropZone.addEventListener(name, (event) => { event.preventDefault(); elements.photoDropZone.classList.add("is-dragover"); }));
["dragleave", "drop"].forEach((name) => elements.photoDropZone.addEventListener(name, (event) => { event.preventDefault(); elements.photoDropZone.classList.remove("is-dragover"); }));
elements.photoDropZone.addEventListener("drop", (event) => addPhotos(event.dataTransfer.files));
elements.uiLanguage.addEventListener("change", () => changeLocale(elements.uiLanguage.value)); document.querySelector("#language").addEventListener("change", emitWooConfiguration);
elements.prevButton.addEventListener("click", () => showStep(state.step - 1)); elements.nextButton.addEventListener("click", () => { if (validateStep()) showStep(state.step + 1); });
document.querySelectorAll(".step").forEach((step, index) => step.addEventListener("click", () => { if (index <= state.step || validateStep()) showStep(index); })); elements.form.addEventListener("submit", startGeneration);
elements.form.addEventListener("input", scheduleLocalDraft);
elements.form.addEventListener("change", scheduleLocalDraft);
elements.form.addEventListener("click", (event) => { if (event.target.closest("[data-style-id],[data-universe-id],[data-font-id],[data-product-type],[data-page-count]")) window.setTimeout(persistLocalDraft, 0); });
elements.refreshStorySuggestions.addEventListener("click", () => requestStorySuggestions({ refresh: true }));
elements.interpretIntentionButton.addEventListener("click", () => requestStoryIntentions());
elements.customStoryChoice.addEventListener("click", chooseCustomStory);
document.querySelector("#creator_situation").addEventListener("change", () => {
  if (!state.storyIntentions.length && !selectedStoryIntention()) return;
  clearIntentionChoice({ preserveSituation: true });
  state.storySuggestions = [];
  resetStorySuggestionChoice({ preserveAnswers: true });
  renderStoryIntentions();
  renderStorySuggestions();
  persistLocalDraft();
});
elements.newBookButton.addEventListener("click", startNewBook);
elements.resultNewBookButton.addEventListener("click", startNewBook);
elements.redeemPromoButton.addEventListener("click", redeemPromotion);
elements.buyCreditsLink.addEventListener("click", rememberCreditPurchase);
elements.actionBuyCredits.addEventListener("click", rememberCreditPurchase);
elements.modificationBuyCredits.addEventListener("click", rememberCreditPurchase);
elements.confirmPreviewButton.addEventListener("click", confirmPreviewAuthorization);
elements.retryInitialScenarioButton.addEventListener("click", () => requestStoryScenario());
elements.reviseScenarioButton.addEventListener("click", () => requestStoryScenario({ includeEdits: true }));
elements.approveScenarioButton.addEventListener("click", approveStoryScenario);
elements.scenarioAddCharacterButton.addEventListener("click", addScenarioCharacter);
elements.scenarioNewCharacterName.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); addScenarioCharacter(); } });
elements.scenarioQuestionList.addEventListener("input", markStoryScenarioDirty);
elements.scenarioFeedback.addEventListener("input", markStoryScenarioDirty);
elements.scenarioActs.addEventListener("input", (event) => {
  if (!event.target.matches("[data-scene-title], [data-scene-location], [data-scene-action]")) return;
  event.target.dataset.creatorEdited = "true";
  markStoryScenarioDirty();
});
elements.scenarioActs.addEventListener("change", (event) => {
  if (!event.target.matches("[data-presence-character]")) return;
  const card = event.target.closest("[data-scenario-scene]");
  card.dataset.presencesEdited = "true";
  updateScenarioPresenceSummary(card);
  markStoryScenarioDirty();
});
elements.scenarioActs.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-toggle-presences]");
  if (!toggle) return;
  const editor = toggle.closest("[data-scenario-scene]").querySelector("[data-presence-editor]");
  editor.hidden = !editor.hidden;
  toggle.setAttribute("aria-expanded", String(!editor.hidden));
  toggle.textContent = tr(editor.hidden ? "scenarioEditPresences" : "scenarioHidePresences");
});
elements.retryPreviewButton.addEventListener("click", retryPreviewFree);
elements.approveVisualProofButton.addEventListener("click", () => submitVisualProof("approve"));
elements.regenerateVisualProofButton.addEventListener("click", () => submitVisualProof("regenerate"));
elements.notifyPreviewEmail.addEventListener("change", () => { savePreviewNotificationPreference().catch(() => null); });
elements.actionBuyEbook.addEventListener("click", () => openConfiguredCheckout("ebook", elements.actionBuyEbook));
elements.actionBuyPrint.addEventListener("click", () => openConfiguredCheckout("print", elements.actionBuyPrint));
elements.actionRecoverReferences.addEventListener("click", beginReferenceRecovery);
elements.actionRequestChange.addEventListener("click", openModificationPanel);
elements.closeModificationPanel.addEventListener("click", () => { elements.previewModificationPanel.hidden = true; });
elements.modificationSpread.addEventListener("change", () => loadModificationQuote().catch((error) => setModificationStatus(error.message, "error")));
document.querySelectorAll('input[name="modificationScope"]').forEach((input) => input.addEventListener("change", () => loadModificationQuote().catch((error) => setModificationStatus(error.message, "error"))));
elements.submitModification.addEventListener("click", submitPreviewModification);
elements.approveModification.addEventListener("click", () => decidePreviewModification("approve"));
elements.rejectModification.addEventListener("click", () => decidePreviewModification("reject"));
elements.logoutButton.addEventListener("click", () => { logoutCustomer().catch((error) => { elements.formError.textContent = error.message; }); });

init();

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
  fontStyle: "school_round",
  pageCount: 24,
  productType: "ebook",
  photos: [],
  jobId: "",
  projectId: "",
  previewComplete: false,
  awaitingPreviewConfirmation: false,
  referenceRecoveryMode: false,
  referenceRecoveryAvailable: false,
  customerSession: { authenticated: false, customer: null },
};

const LOCAL_DRAFT_KEY = "storybook-anonymous-draft-v1";
const PENDING_PREVIEW_KEY = "storybook-pending-preview-v1";
let localDraftTimer;

function consumeNewBookRequest() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("newBook")) return false;
  localStorage.removeItem(LOCAL_DRAFT_KEY);
  localStorage.removeItem(PENDING_PREVIEW_KEY);
  url.searchParams.delete("newBook");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  return true;
}

const newBookRequested = consumeNewBookRequest();
const requestedProductType = ["ebook", "print"].includes(initialUrl.searchParams.get("productType")) ? initialUrl.searchParams.get("productType") : "";

const elements = {
  form: document.querySelector("#bookForm"), childQuestions: document.querySelector("#childQuestions"), storyQuestions: document.querySelector("#storyQuestions"),
  styleGrid: document.querySelector("#styleGrid"), universeGrid: document.querySelector("#universeGrid"), fontGrid: document.querySelector("#fontGrid"), productTypeGrid: document.querySelector("#productTypeGrid"), pageCountGrid: document.querySelector("#pageCountGrid"),
  photoInput: document.querySelector("#photoInput"), photoDropZone: document.querySelector("#photoDropZone"), photoList: document.querySelector("#photoList"), photoCount: document.querySelector("#photoCount"),
  reviewCard: document.querySelector("#reviewCard"), prevButton: document.querySelector("#prevButton"), nextButton: document.querySelector("#nextButton"), formError: document.querySelector("#formError"),
  generationPanel: document.querySelector("#generationPanel"), generationBar: document.querySelector("#generationBar"), generationStep: document.querySelector("#generationStep"), resultSection: document.querySelector("#resultSection"), bookPreview: document.querySelector("#bookPreview"),
  notifyPreviewEmail: document.querySelector("#notifyPreviewEmail"), generationFailurePanel: document.querySelector("#generationFailurePanel"), retryPreviewButton: document.querySelector("#retryPreviewButton"), generationFailureSupport: document.querySelector("#generationFailureSupport"),
  mobileStepLabel: document.querySelector("#mobileStepLabel"), mobileProgressBar: document.querySelector("#mobileProgressBar"), uiLanguage: document.querySelector("#uiLanguage"), storefrontReturnLink: document.querySelector("#storefrontReturnLink"), costNote: document.querySelector("#costNote"),
  heroStartingPrice: document.querySelector("#heroStartingPrice"), heroPageRange: document.querySelector("#heroPageRange"), resultTitle: document.querySelector("#resultTitle"), universeTitle: document.querySelector("#universeTitle"),
  accountStatus: document.querySelector("#accountStatus"), logoutButton: document.querySelector("#logoutButton"), newBookButton: document.querySelector("#newBookButton"), resultNewBookButton: document.querySelector("#resultNewBookButton"), headerCreditBalance: document.querySelector("#headerCreditBalance"), headerCreditBalanceValue: document.querySelector("#headerCreditBalanceValue"),
  creditPanel: document.querySelector("#creditPanel"), previewCreditPrice: document.querySelector("#previewCreditPrice"), creditBalance: document.querySelector("#creditBalance"), creditMissing: document.querySelector("#creditMissing"), promoCodeInput: document.querySelector("#promoCodeInput"), redeemPromoButton: document.querySelector("#redeemPromoButton"), buyCreditsLink: document.querySelector("#buyCreditsLink"), creditFeedback: document.querySelector("#creditFeedback"), confirmPreviewButton: document.querySelector("#confirmPreviewButton"), previewActionCenter: document.querySelector("#previewActionCenter"), previewRebateText: document.querySelector("#previewRebateText"), actionRecoverReferences: document.querySelector("#actionRecoverReferences"), actionReadInteractive: document.querySelector("#actionReadInteractive"), actionBuyCredits: document.querySelector("#actionBuyCredits"), actionBuyEbook: document.querySelector("#actionBuyEbook"), actionBuyPrint: document.querySelector("#actionBuyPrint"),
  seriesDraftNotice: document.querySelector("#seriesDraftNotice"),
};

class TechnicalGenerationError extends Error {
  constructor(message, code = "preview_generation_failed") { super(message); this.code = code; this.technical = true; }
}

const IMPROVABLE_QUESTION_IDS = new Set(["favorite_activities", "personality", "dream", "challenge", "message", "signature_object", "important_people", "extra_notes"]);

const QUESTION_TEXT = {
  FR: {
    hero_name: ["Comment s'appelle l'enfant ?", "Le prénom qui apparaîtra dans l'histoire."], age: ["Quel âge a l'enfant ?", "Cela adapte la longueur des phrases et le vocabulaire."], favorite_activities: ["Qu'est-ce qu'il ou elle adore faire ?", "Jeux, passions, animaux, musique, sport ou activité favorite."], personality: ["Quels mots décrivent le mieux l'enfant ?", "Par exemple : curieux, drôle, sensible, courageux ou rêveur."], dream: ["Quel rêve aimerait-il réaliser ?", "Ce souhait devient l'objectif du héros."], challenge: ["Quelle petite difficulté aimerait-il dépasser ?", "Une peur douce, un apprentissage ou un manque de confiance."], message: ["Quel message souhaitez-vous lui transmettre ?", "Par exemple : croire en soi, partager ou persévérer."], signature_object: ["Quel objet spécial doit accompagner l'enfant ?", "Un doudou, un sac, un instrument ou un objet inventé."], important_people: ["Qui doit l'accompagner dans l'histoire ?", "Mascotte, ami, frère, sœur ou autre proche."],
  },
  ES: {
    hero_name: ["¿Cómo se llama el niño?", "El nombre que aparecerá en la historia."], age: ["¿Qué edad tiene?", "Adapta el vocabulario y la longitud de las frases."], favorite_activities: ["¿Qué le encanta hacer?", "Juegos, aficiones, animales, música o deporte."], personality: ["¿Qué palabras le describen mejor?", "Por ejemplo: curioso, divertido, sensible o valiente."], dream: ["¿Qué sueño le gustaría cumplir?", "Este deseo se convierte en el objetivo del protagonista."], challenge: ["¿Qué pequeña dificultad le gustaría superar?", "Un miedo suave, un aprendizaje o falta de confianza."], message: ["¿Qué mensaje quieres transmitirle?", "Por ejemplo: creer en sí mismo, compartir o perseverar."], signature_object: ["¿Qué objeto especial debe acompañarle?", "Un peluche, bolso, instrumento u objeto inventado."], important_people: ["¿Quién debe acompañarle en la historia?", "Mascota, amigo, hermano, hermana u otro ser querido."],
  },
  EN: {
    hero_name: ["What is the child's name?", "The name that will appear in the story."], age: ["How old is the child?", "This adapts vocabulary and sentence length."], favorite_activities: ["What do they love doing?", "Games, hobbies, animals, music, sport or a favorite activity."], personality: ["Which words describe the child best?", "For example: curious, funny, sensitive, brave or dreamy."], dream: ["What dream would they love to achieve?", "This wish becomes the hero's goal."], challenge: ["What small difficulty would they like to overcome?", "A gentle fear, a new skill or a lack of confidence."], message: ["What message would you like to give them?", "For example: believe in yourself, share or persevere."], signature_object: ["What special object should travel with the child?", "A comfort toy, bag, instrument or invented object."], important_people: ["Who should join them in the story?", "A mascot, friend, sibling or another loved one."],
  },
};

const STYLE_TEXT = {
  soft_watercolor: { FR: ["Aquarelle douce", "Couleurs transparentes, papier texturé et lumière tendre."], ES: ["Acuarela suave", "Colores transparentes, textura de papel y luz delicada."], EN: ["Soft watercolor", "Transparent colors, paper texture and gentle light."] },
  modern_gouache: { FR: ["Gouache moderne", "Aplats généreux et rendu éditorial chaleureux."], ES: ["Gouache moderno", "Colores mates y un acabado editorial cálido."], EN: ["Modern gouache", "Bold matte colors and a warm editorial finish."] },
  paper_cut: { FR: ["Papier découpé", "Formes superposées, ombres légères et univers tactile."], ES: ["Papel recortado", "Capas de formas, sombras suaves y tacto artesanal."], EN: ["Paper cut", "Layered shapes, soft shadows and a tactile feel."] },
  pastel_pencil: { FR: ["Crayons pastel", "Trait sensible et rassurant, proche du dessin à la main."], ES: ["Lápices pastel", "Un trazo sensible y acogedor, dibujado a mano."], EN: ["Pastel pencils", "A gentle, reassuring hand-drawn line."] },
  gentle_3d: { FR: ["3D douce", "Volumes moelleux, personnages expressifs et lumière chaleureuse."], ES: ["3D suave", "Volúmenes redondeados, personajes expresivos y luz cálida."], EN: ["Gentle 3D", "Soft volumes, expressive characters and warm light."] },
  enchanted_ink: { FR: ["Encre enchantée", "Lignes fines, détails merveilleux et touches lumineuses."], ES: ["Tinta encantada", "Líneas finas, detalles mágicos y toques luminosos."], EN: ["Enchanted ink", "Fine lines, magical detail and glowing accents."] },
};

const UNIVERSE_TEXT = {
  enchanted_forest: { FR: ["Forêt enchantée", "Sentiers secrets, fleurs brillantes et animaux bienveillants."], ES: ["Bosque encantado", "Senderos secretos, flores luminosas y animales amables."], EN: ["Enchanted forest", "Secret paths, glowing flowers and friendly animals."] },
  starry_space: { FR: ["Espace étoilé", "Planètes colorées et constellations amicales."], ES: ["Espacio estrellado", "Planetas de colores y constelaciones amistosas."], EN: ["Starry space", "Colorful planets and friendly constellations."] },
  coral_ocean: { FR: ["Océan de corail", "Poissons curieux et jardins sous-marins lumineux."], ES: ["Océano de coral", "Peces curiosos y jardines submarinos luminosos."], EN: ["Coral ocean", "Curious fish and bright underwater gardens."] },
  cloud_castle: { FR: ["Château des nuages", "Tours dorées, ponts aériens et magie douce."], ES: ["Castillo de nubes", "Torres doradas, puentes aéreos y magia suave."], EN: ["Cloud castle", "Golden towers, sky bridges and gentle magic."] },
  dinosaur_valley: { FR: ["Vallée des dinosaures", "Dinosaures attachants et fougères géantes."], ES: ["Valle de dinosaurios", "Dinosaurios entrañables y helechos gigantes."], EN: ["Dinosaur valley", "Lovable dinosaurs and giant ferns."] },
  wonder_city: { FR: ["Ville merveilleuse", "Ateliers magiques, toits colorés et passages secrets."], ES: ["Ciudad maravillosa", "Talleres mágicos, tejados de colores y pasadizos."], EN: ["Wonder city", "Magical workshops, colorful roofs and secret passages."] },
};

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
    values: formValues(), step: state.step, locale: state.locale, selectedStyle: state.selectedStyle,
    selectedUniverse: state.selectedUniverse, fontStyle: state.fontStyle, pageCount: state.pageCount,
    productType: state.productType, projectId: state.projectId, updatedAt: new Date().toISOString(),
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

async function saveServerDraft(questionnaire, photos) {
  const body = JSON.stringify({
    status: "ready_for_preview", title: questionnaire.hero_name || "", locale: state.locale,
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

function renderCreditSummary(summary, { showPanel = false } = {}) {
  const enabled = Boolean(summary?.enabled);
  elements.headerCreditBalanceValue.textContent = formatPrice((summary?.balanceCents || 0) / 100);
  elements.creditPanel.hidden = !showPanel;
  elements.previewCreditPrice.textContent = formatPrice((summary.requiredCents || 0) / 100);
  elements.creditBalance.textContent = formatPrice((summary.balanceCents || 0) / 100);
  elements.creditMissing.textContent = formatPrice((summary.missingCents || 0) / 100);
  elements.creditMissing.closest("div").classList.toggle("has-missing-credit", summary.missingCents > 0);
  elements.buyCreditsLink.hidden = !summary.buyCreditsUrl;
  if (summary.buyCreditsUrl) elements.buyCreditsLink.href = summary.buyCreditsUrl;
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
  showStep(4, false);
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
  elements.creditFeedback.textContent = tr("previewDebitConfirmed", { amount: formatPrice((summary?.requiredCents || 0) / 100) });
  try {
    state.awaitingPreviewConfirmation = false;
    await generatePreviewForProject(state.projectId);
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
    showStep(4, false);
    await refreshCreditSummary(state.projectId).catch(() => null);
    elements.confirmPreviewButton.disabled = false;
    elements.confirmPreviewButton.textContent = original;
    elements.formError.textContent = error.message;
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

async function renderPreviewActionCenter({ locked = false } = {}) {
  const summary = await refreshCreditSummary().catch(() => null);
  elements.previewActionCenter.hidden = false;
  elements.actionReadInteractive.href = `/interactive-reader/?project=${encodeURIComponent(state.projectId)}`;
  elements.actionRecoverReferences.hidden = !state.referenceRecoveryAvailable;
  elements.previewRebateText.textContent = summary ? tr("previewRebate", { amount: formatPrice((summary.rebateCents || 0) / 100), balance: formatPrice((summary.balanceCents || 0) / 100) }) : tr("checkoutReady");
  elements.actionBuyCredits.hidden = !summary?.buyCreditsUrl;
  if (summary?.buyCreditsUrl) elements.actionBuyCredits.href = summary.buyCreditsUrl;
  elements.actionBuyEbook.disabled = locked;
  elements.actionBuyPrint.disabled = locked || !isProductAvailable("print");
  elements.actionBuyPrint.textContent = isProductAvailable("print") ? tr("buyPrint") : tr("printComingSoonAction");
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
    renderQuestions(questionnaire);
    restoreValues(questionnaire);
    renderUniverses(); renderStyles(); renderFonts(); renderProductTypes(); renderPageCounts();
    state.photos.forEach((photo) => URL.revokeObjectURL(photo.url));
    state.photos = [];
    state.referenceRecoveryMode = true;
    state.referenceRecoveryAvailable = false;
    renderPhotos();
    setPreviewComplete(false);
    elements.resultSection.hidden = true;
    document.querySelector("#creator").hidden = false;
    showStep(3);
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
    if (!response.ok) throw new Error(payload.error || tr("improveError"));
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

function renderUniverses() {
  const options = state.config.universeOptions;
  state.selectedUniverse ||= options[0]?.id;
  elements.universeGrid.innerHTML = options.map((option) => {
    const [name, description] = UNIVERSE_TEXT[option.id]?.[state.locale] || [option.name, option.description];
    return `<button type="button" class="visual-card universe-card preview-${option.id} ${option.id === state.selectedUniverse ? "is-selected" : ""}" data-universe-id="${option.id}" role="radio" aria-checked="${option.id === state.selectedUniverse}"><span class="visual-card-art" style="--c1:${option.palette[0]};--c2:${option.palette[1]};--c3:${option.palette[2]}">${option.previewImage ? `<img src="${escapeHtml(option.previewImage)}" alt="" loading="lazy" />` : ""}<i></i><b></b></span><span class="visual-card-copy"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(description)}</small></span><span class="info-dot" title="${escapeHtml(description)}" aria-label="${escapeHtml(tr("information"))}">i</span></button>`;
  }).join("");
  document.querySelector("#universe_id").value = state.selectedUniverse;
  document.querySelector("#universe").value = "";
  elements.universeGrid.querySelectorAll(".visual-card-art img").forEach((image) => image.addEventListener("error", () => image.remove()));
  elements.universeGrid.querySelectorAll("[data-universe-id]").forEach((button) => button.addEventListener("click", () => { state.selectedUniverse = button.dataset.universeId; renderUniverses(); emitWooConfiguration(); }));
}

function renderStyles() {
  const styles = state.config.illustrationStyles;
  state.selectedStyle ||= styles[0]?.id;
  elements.styleGrid.innerHTML = styles.map((style) => {
    const [name, description] = STYLE_TEXT[style.id]?.[state.locale] || [style.name, style.description];
    return `<button type="button" class="style-card preview-${style.id} ${style.id === state.selectedStyle ? "is-selected" : ""}" data-style-id="${style.id}" role="radio" aria-checked="${style.id === state.selectedStyle}"><span class="style-preview" style="--c1:${style.palette[0]};--c2:${style.palette[1]};--c3:${style.palette[2]}">${style.previewImage ? `<img src="${escapeHtml(style.previewImage)}" alt="" loading="lazy" />` : ""}<i></i><b></b></span><span class="style-card-copy"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(description)}</small></span></button>`;
  }).join("");
  elements.styleGrid.querySelectorAll(".style-preview img").forEach((image) => image.addEventListener("error", () => image.remove()));
  elements.styleGrid.querySelectorAll("[data-style-id]").forEach((button) => button.addEventListener("click", () => { state.selectedStyle = button.dataset.styleId; renderStyles(); emitWooConfiguration(); }));
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
    const role = state.photos.some((photo) => photo.role === "child") ? "friend" : "child";
    state.photos.push({ file, url: URL.createObjectURL(file), role, storyRole: defaultStoryRole(role), name: "", relationship: "" });
  });
  renderPhotos();
}

function renderPhotos() {
  const labels = ROLE_LABELS[state.locale];
  elements.photoCount.textContent = state.photos.length;
  elements.photoList.innerHTML = state.photos.map((photo, index) => `<article class="photo-item" data-photo-index="${index}"><img src="${photo.url}" alt="${escapeHtml(tr("photoPreview", { name: photo.file?.name || photo.name || "" }))}" /><div class="photo-meta"><select data-field="role">${["child", "mascot", "friend", "family", "other"].map((value) => `<option value="${value}" ${value === photo.role ? "selected" : ""}>${labels[value]}</option>`).join("")}</select><select data-field="storyRole">${["hero", "guide", "ally", "companion", "supporter", "guest"].map((value) => `<option value="${value}" ${value === photo.storyRole ? "selected" : ""} ${(photo.role === "child" && value !== "hero") || (photo.role !== "child" && value === "hero") ? "disabled" : ""}>${labels[value]}</option>`).join("")}</select><input data-field="name" value="${escapeHtml(photo.name)}" placeholder="${escapeHtml(tr("photoName"))}" /><input data-field="relationship" value="${escapeHtml(photo.relationship)}" placeholder="${escapeHtml(tr("relationship"))}" /></div><button type="button" class="remove-photo" aria-label="${escapeHtml(tr("removePhoto"))}">×</button></article>`).join("");
  elements.photoList.querySelectorAll(".photo-item").forEach((item) => {
    const index = Number(item.dataset.photoIndex);
    item.querySelector('[data-field="role"]').addEventListener("change", (event) => { const previous = state.photos[index].role; state.photos[index].role = event.target.value; if (event.target.value === "child" || state.photos[index].storyRole === defaultStoryRole(previous)) state.photos[index].storyRole = defaultStoryRole(event.target.value); renderPhotos(); });
    item.querySelector('[data-field="storyRole"]').addEventListener("change", (event) => { state.photos[index].storyRole = event.target.value; });
    item.querySelector('[data-field="name"]').addEventListener("input", (event) => { state.photos[index].name = event.target.value; });
    item.querySelector('[data-field="relationship"]').addEventListener("input", (event) => { state.photos[index].relationship = event.target.value; });
    item.querySelector(".remove-photo").addEventListener("click", () => { if (state.photos[index].file) URL.revokeObjectURL(state.photos[index].url); state.photos.splice(index, 1); renderPhotos(); });
  });
}

function validateStep() {
  elements.formError.textContent = "";
  if (state.step <= 1) {
    const required = [...document.querySelector(`[data-panel="${state.step}"]`).querySelectorAll("[required]")];
    const invalid = required.filter((input) => !String(input.value).trim());
    required.forEach((input) => input.classList.toggle("is-invalid", invalid.includes(input)));
    if (invalid.length) { elements.formError.textContent = tr("invalidRequired"); invalid[0].focus(); return false; }
  }
  if (state.step === 2 && !state.selectedStyle) { elements.formError.textContent = tr("invalidStyle"); return false; }
  if (state.step === 3) {
    if (state.photos.filter((photo) => photo.role === "child").length > 1) { elements.formError.textContent = tr("invalidChildPhoto"); return false; }
    if (state.photos.some((photo) => !photo.name.trim())) { elements.formError.textContent = tr("invalidPhotoName"); return false; }
  }
  return true;
}

function localizedStyleName() { const style = STYLE_TEXT[state.selectedStyle]?.[state.locale]; return style?.[0] || state.selectedStyle; }
function localizedUniverseName() { const universe = UNIVERSE_TEXT[state.selectedUniverse]?.[state.locale]; return universe?.[0] || state.selectedUniverse; }

function renderReview() {
  const values = formValues(); const labels = ROLE_LABELS[state.locale];
  const rows = [[tr("reviewHero"), `${values.hero_name || "—"}, ${values.age || "—"}`], [tr("reviewDream"), values.dream || "—"], [tr("reviewChallenge"), values.challenge || "—"], [tr("reviewMessage"), values.message || "—"], [tr("reviewUniverse"), localizedUniverseName()], [tr("reviewDetail"), values.extra_notes || tr("none")], [tr("reviewStyle"), localizedStyleName()], [tr("reviewFont"), document.querySelector(`.font-${state.fontStyle} span`)?.textContent || state.fontStyle], [tr("reviewProduct"), state.productType === "ebook" ? tr("ebook") : tr("printBook")], [tr("reviewPages"), `${tr("pages", { count: state.pageCount })} · ${formatPrice(selectedProductPrice() || 0)}`], [tr("reviewPhotos"), state.photos.length ? tr("referenceCharacters", { count: state.photos.length }) : tr("noPhotos")], [tr("reviewRoles"), state.photos.length ? state.photos.map((photo) => `${photo.name}: ${labels[photo.storyRole]}`).join(" · ") : "—"]];
  elements.reviewCard.innerHTML = rows.map(([label, value]) => `<div class="review-row"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`).join("");
}

function showStep(nextStep, shouldScroll = true) {
  state.step = Math.max(0, Math.min(4, nextStep));
  document.querySelectorAll(".form-panel").forEach((panel) => panel.classList.toggle("is-active", Number(panel.dataset.panel) === state.step));
  document.querySelectorAll(".step").forEach((step, index) => { step.classList.toggle("is-active", index === state.step); step.classList.toggle("is-complete", index < state.step); });
  elements.prevButton.hidden = state.step === 0; elements.nextButton.hidden = state.step === 4;
  elements.mobileStepLabel.textContent = tr("stepLabel", { current: state.step + 1 }); elements.mobileProgressBar.style.width = `${(state.step + 1) * 20}%`; elements.formError.textContent = "";
  if (state.step === 4) renderReview(); if (shouldScroll) document.querySelector("#creator").scrollIntoView({ behavior: "smooth", block: "start" });
}

function productConfiguration() { return { page_count: state.pageCount, product_type: state.productType, font_style: state.fontStyle, style_id: state.selectedStyle, universe_id: state.selectedUniverse, book_language: document.querySelector("#language").value, price_eur: selectedProductPrice() || 0, unit_page_price_eur: selectedUnitPrice() || 0, woo_variation_key: `${state.productType}_pages_${state.pageCount}` }; }
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

function generationProgress(step = "") { const match = step.match(/page:(\d+)/); if (match) return Math.min(96, 18 + Number(match[1]) * (78 / state.pageCount)); if (step.includes("photo")) return 8; if (step.includes("storybrand")) return 13; if (step.includes("blueprint")) return 17; if (step.includes("cover")) return 21; if (step.includes("done")) return 100; return 5; }
function friendlyStep(step = "") { if (step.includes("photo")) return tr("progressPhoto"); if (step.includes("storybrand")) return tr("progressStory"); if (step.includes("blueprint")) return tr("progressBlueprint"); if (step.includes("cover")) return tr("progressCover"); const match = step.match(/page:(\d+)/); return match ? tr("pageOf", { page: match[1], total: state.pageCount }) : tr("progressPreparing"); }

async function pollJob(jobId) {
  for (;;) { const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`); const job = await response.json(); if (!response.ok) throw new TechnicalGenerationError(tr("generationFailed"), "preview_interrupted"); elements.generationBar.style.width = `${generationProgress(job.step)}%`; elements.generationStep.textContent = friendlyStep(job.step); if (job.status === "done") return job; if (job.status === "failed") throw new TechnicalGenerationError(tr("generationFailed")); await new Promise((resolve) => setTimeout(resolve, 2200)); }
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
  const pageMarkup = (page) => `<figure class="reader-page ${page.isCover ? "reader-cover" : ""}"><img src="${escapeHtml(page.previewUrl)}" alt="${escapeHtml(page.isCover ? tr("readerCover") : tr("readerPage", { page: page.page_number }))}" draggable="false" /><span>${page.isCover ? escapeHtml(tr("readerCover")) : escapeHtml(tr("readerPage", { page: page.page_number }))}</span><em>${escapeHtml(tr("previewWatermark"))}</em></figure>`;

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

function showGenerationPanel() {
  document.querySelector("#creator").hidden = true;
  elements.resultSection.hidden = true;
  elements.generationFailurePanel.hidden = true;
  elements.generationPanel.hidden = false;
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
  elements.generationPanel.hidden = true;
  elements.resultSection.hidden = true;
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
  elements.generationPanel.hidden = true;
  elements.generationFailurePanel.hidden = true;
  elements.resultSection.hidden = false;
  state.referenceRecoveryAvailable = Boolean(job.referenceRecoveryAvailable);
  renderBook(job, { initialPageNumber });
  setPreviewComplete(true);
  renderPreviewActionCenter({ locked: job.projectStatus === "preview_repairing" });
  if (scroll) elements.resultSection.scrollIntoView({ behavior: "smooth" });
}

async function generatePreviewForProject(projectId) {
  const response = await fetch("/api/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
  });
  const payload = await response.json();
  if (!response.ok) { if (payload.code === "insufficient_credit") await refreshCreditSummary(projectId); if (payload.code === "preview_interrupted") throw new TechnicalGenerationError(tr("generationFailed"), payload.code); throw new Error(payload.error || tr("startError")); }
  showGenerationPanel();
  state.jobId = payload.jobId;
  const job = await pollJob(payload.jobId);
  elements.generationBar.style.width = "100%";
  showCompletedPreview(job);
}

async function restoreCompletedPreview() {
  if (!state.customerSession?.authenticated || !state.projectId) return false;
  const response = await fetch(`/api/projects/${encodeURIComponent(state.projectId)}`, { cache: "no-store" });
  if (!response.ok) return false;
  const payload = await response.json();
  const project = payload.project;
  elements.notifyPreviewEmail.checked = project?.continuitySnapshot?.previewNotification?.emailRequested === true;
  if (project?.status === "preview_generating" && project.generationJobId) {
    showGenerationPanel();
    try {
      const jobResponse = await fetch(`/api/jobs/${encodeURIComponent(project.generationJobId)}`, { cache: "no-store" });
      if (jobResponse.ok) {
        const job = await pollJob(project.generationJobId);
        elements.generationBar.style.width = "100%";
        showCompletedPreview(job, { scroll: false });
      } else {
        await fetch(`/api/projects/${encodeURIComponent(project.id)}/preview-recover`, { method: "POST" });
        await showGenerationFailure();
      }
    } catch (error) {
      await showGenerationFailure();
    }
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
  const projectId = params.get("project") || localStorage.getItem(PENDING_PREVIEW_KEY) || "";
  if (params.get("newAdventure") === "1") return resumeNextAdventure(projectId);
  window.history.replaceState({}, "", `${window.location.pathname}#creator`);
  localStorage.removeItem(PENDING_PREVIEW_KEY);
  if (!projectId) return;
  state.projectId = projectId;
  persistLocalDraft();
  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || tr("startError"));
    await preparePreviewAuthorization(projectId);
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
  renderQuestions(questionnaire);
  restoreValues(questionnaire);
  document.querySelector("#language").value = questionnaire.book_language || configuration.book_language || project.locale || "FR";
  renderUniverses(); renderStyles(); renderFonts(); renderProductTypes(); renderPageCounts();
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
    const questionnaire = { ...formValues(), ...productConfiguration(), universe_details: document.querySelector("#universe_details").value };
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
  if (state.config) { renderQuestions(values); renderUniverses(); renderStyles(); renderFonts(); renderProductTypes(); renderPageCounts(); renderPhotos(); if (state.step === 4) renderReview(); showStep(state.step, false); }
}

async function init() {
  try { const response = await fetch("/api/questionnaire"); state.config = await response.json(); if (!response.ok) throw new Error("Configuration unavailable"); const saved = newBookRequested ? null : readLocalDraft(); state.pageCount = saved?.pageCount || state.config.bookFormat.interiorPageCount; state.selectedStyle = saved?.selectedStyle || ""; state.selectedUniverse = saved?.selectedUniverse || ""; state.fontStyle = saved?.fontStyle || state.fontStyle; state.productType = availableProductType(saved?.productType || requestedProductType || state.productType); state.projectId = saved?.projectId || ""; changeLocale(saved?.locale || state.locale); if (saved?.values) restoreValues(saved.values); if (Number.isInteger(saved?.step)) showStep(Math.max(0, Math.min(4, saved.step)), false); emitWooConfiguration(); await refreshCustomerSession(); await refreshCreditSummary("").catch(() => null); const authCallback = new URLSearchParams(window.location.search).get("auth") === "connected"; if (authCallback) await resumePreviewAfterLogin(); else await restoreCompletedPreview(); }
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
elements.newBookButton.addEventListener("click", startNewBook);
elements.resultNewBookButton.addEventListener("click", startNewBook);
elements.redeemPromoButton.addEventListener("click", redeemPromotion);
elements.confirmPreviewButton.addEventListener("click", confirmPreviewAuthorization);
elements.retryPreviewButton.addEventListener("click", retryPreviewFree);
elements.notifyPreviewEmail.addEventListener("change", () => { savePreviewNotificationPreference().catch(() => null); });
elements.actionBuyEbook.addEventListener("click", () => openConfiguredCheckout("ebook", elements.actionBuyEbook));
elements.actionBuyPrint.addEventListener("click", () => openConfiguredCheckout("print", elements.actionBuyPrint));
elements.actionRecoverReferences.addEventListener("click", beginReferenceRecovery);
elements.logoutButton.addEventListener("click", () => { logoutCustomer().catch((error) => { elements.formError.textContent = error.message; }); });

init();

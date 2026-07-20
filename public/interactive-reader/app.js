import {
  createReaderState,
  goToNextScene,
  goToPreviousScene,
  revealScene,
  setTextVisibility,
} from "./reader-state.js";

const elements = {
  loading: document.querySelector("[data-loading]"),
  anticipation: document.querySelector("[data-anticipation]"),
  revealed: document.querySelector("[data-revealed]"),
  completion: document.querySelector("[data-completion]"),
  progress: document.querySelector("[data-progress]"),
  imageProgress: document.querySelector("[data-image-progress]"),
  anticipationText: document.querySelector("[data-anticipation-text]"),
  revealedText: document.querySelector("[data-revealed-text]"),
  sceneImage: document.querySelector("[data-scene-image]"),
  topBack: document.querySelector("[data-top-back]"),
  previous: document.querySelector("[data-previous]"),
  next: document.querySelector("[data-next]"),
  textOverlay: document.querySelector("[data-text-overlay]"),
  showText: document.querySelector("[data-show-text]"),
  showTextLabel: document.querySelector("[data-show-text-label]"),
  collapsedControls: document.querySelector("[data-collapsed-controls]"),
  toggleLabel: document.querySelector("[data-toggle-label]"),
  install: document.querySelector("[data-install]"),
  installManifest: document.querySelector("[data-install-manifest]"),
  installGuide: document.querySelector("[data-install-guide]"),
  installGuideClose: document.querySelector("[data-install-guide-close]"),
  installGuideDone: document.querySelector("[data-install-guide-done]"),
  installGuideTitle: document.querySelector("[data-install-guide-title]"),
  installGuideSteps: [
    document.querySelector("[data-install-guide-step-one]"),
    document.querySelector("[data-install-guide-step-two]"),
    document.querySelector("[data-install-guide-step-three]"),
  ],
  toast: document.querySelector("[data-toast]"),
  listenButtons: [...document.querySelectorAll("[data-listen]")],
  textRegions: [...document.querySelectorAll("[data-text-region]")],
  revealLabel: document.querySelector("[data-reveal-label]"),
  imaginationHint: document.querySelector("[data-imagination-hint]"),
  completionEyebrow: document.querySelector("[data-completion-eyebrow]"),
  completionTitle: document.querySelector("[data-completion-title]"),
  completionMessage: document.querySelector("[data-completion-message]"),
  completionRestart: document.querySelector("[data-completion-restart]"),
  prototypeLabel: document.querySelector("[data-prototype-label]"),
  prototypeNote: document.querySelector("[data-prototype-note]"),
};

const BOOK_FONTS = {
  school_round: "Andika",
  handwritten_story: "Patrick Hand",
  rounded_playful: "Fredoka",
  comic_bubble: "Comic Neue",
  storybook_bold: "Baloo 2",
  cursive_magic: "Borel",
};

const READER_LABELS = {
  fr: {
    reveal: "Découvrir l’image", continue: "Commencer l’aventure", finish: "Terminer l’histoire",
    imagine: "Ferme les yeux et imagine la scène…", showText: "Voir le texte", hideText: "Masquer le texte",
    progress: (current, total) => `Scène ${current} sur ${total}`,
    previous: "Scène précédente", next: "Découvrir la scène suivante", finishNext: "Terminer l’histoire",
    listen: "Écouter le texte", textRegion: "Texte de la scène",
    completionEyebrow: "Fin de l’histoire", completionTitle: "Une histoire à écouter, imaginer et découvrir.",
    completionMessage: "Retrouve ce livre à tout moment dans ta bibliothèque Calitiki.", completionRestart: "Relire l’histoire",
    prototypeLabel: "Voix de l’appareil", prototypeNote: "Cette lecture gratuite utilise la voix disponible sur votre appareil.",
    aiLabel: "Narration IA", aiNote: "Cette voix a été générée par une intelligence artificielle pour ce livre.",
  },
  es: {
    reveal: "Descubrir la imagen", continue: "Comenzar la aventura", finish: "Terminar la historia",
    imagine: "Cierra los ojos e imagina la escena…", showText: "Ver el texto", hideText: "Ocultar el texto",
    progress: (current, total) => `Escena ${current} de ${total}`,
    previous: "Escena anterior", next: "Descubrir la escena siguiente", finishNext: "Terminar la historia",
    listen: "Escuchar el texto", textRegion: "Texto de la escena",
    completionEyebrow: "Fin de la historia", completionTitle: "Una historia para escuchar, imaginar y descubrir.",
    completionMessage: "Encuentra este libro cuando quieras en tu biblioteca Calitiki.", completionRestart: "Volver a leer la historia",
    prototypeLabel: "Voz del dispositivo", prototypeNote: "Esta lectura gratuita utiliza la voz disponible en tu dispositivo.",
    aiLabel: "Narración IA", aiNote: "Esta voz ha sido generada por inteligencia artificial para este libro.",
  },
  en: {
    reveal: "Discover the picture", continue: "Start the adventure", finish: "Finish the story",
    imagine: "Close your eyes and imagine the scene…", showText: "Show the text", hideText: "Hide the text",
    progress: (current, total) => `Scene ${current} of ${total}`,
    previous: "Previous scene", next: "Discover the next scene", finishNext: "Finish the story",
    listen: "Listen to the text", textRegion: "Scene text",
    completionEyebrow: "The end", completionTitle: "A story to listen to, imagine and discover.",
    completionMessage: "Find this book anytime in your Calitiki library.", completionRestart: "Read the story again",
    prototypeLabel: "Device voice", prototypeNote: "This free reading uses the voice available on your device.",
    aiLabel: "AI narration", aiNote: "This voice was generated by artificial intelligence for this book.",
  },
};

const INSTALL_LABELS = {
  fr: {
    button: "Installer",
    title: "Installer Calitiki sur cet iPhone",
    steps: [
      "Touchez le bouton Partager de Safari : le carré avec une flèche vers le haut.",
      "Faites défiler le menu, puis choisissez « Sur l’écran d’accueil ».",
      "Touchez « Ajouter ». L’icône Calitiki ouvrira ensuite directement votre dernier livre.",
    ],
    done: "J’ai compris",
    expired: "Votre session a expiré. Reconnectez-vous à Calitiki pour rouvrir ce livre.",
    reconnect: "Se reconnecter à Calitiki",
    familyExpired: "Cette invitation familiale a expiré ou a été désactivée par son propriétaire.",
  },
  es: {
    button: "Instalar",
    title: "Instalar Calitiki en este iPhone",
    steps: [
      "Toca el botón Compartir de Safari: el cuadrado con una flecha hacia arriba.",
      "Desplázate por el menú y elige «Añadir a pantalla de inicio».",
      "Toca «Añadir». El icono de Calitiki abrirá directamente tu último libro.",
    ],
    done: "Entendido",
    expired: "Tu sesión ha caducado. Vuelve a conectarte a Calitiki para abrir este libro.",
    reconnect: "Volver a conectarme",
    familyExpired: "Esta invitación familiar ha caducado o ha sido desactivada por su propietario.",
  },
  en: {
    button: "Install",
    title: "Install Calitiki on this iPhone",
    steps: [
      "Tap Safari’s Share button: the square with an upward arrow.",
      "Scroll through the menu and choose “Add to Home Screen”.",
      "Tap “Add”. The Calitiki icon will then open your latest book directly.",
    ],
    done: "Got it",
    expired: "Your session has expired. Sign in to Calitiki again to reopen this book.",
    reconnect: "Sign in to Calitiki",
    familyExpired: "This family invitation has expired or was disabled by its owner.",
  },
};

const LAST_PROJECT_KEY = "calitiki-last-interactive-project";

let book;
let state;
let installPrompt;
let toastTimer;
let textMeasurementFrame;
let reloadingForServiceWorker = false;
let installProjectId = "";
const narrationAudio = new Audio();

function browserLanguage() {
  if (book?.language) return bookLanguage();
  return String(navigator.languages?.[0] || navigator.language || "fr").toLowerCase().split("-")[0];
}

function bookLanguage() {
  const language = String(book?.language || "fr").trim().toLowerCase().split("-")[0];
  if (language === "es" || language.startsWith("spanish") || language.startsWith("español")) return "es";
  if (language === "en" || language.startsWith("english")) return "en";
  return "fr";
}

function applyInstallLanguage() {
  const labels = INSTALL_LABELS[browserLanguage()] || INSTALL_LABELS.fr;
  elements.install.textContent = labels.button;
  elements.installGuideTitle.textContent = labels.title;
  elements.installGuideSteps.forEach((element, index) => { element.textContent = labels.steps[index]; });
  elements.installGuideDone.textContent = labels.done;
}

function safeProjectId(value) {
  const projectId = String(value || "").trim();
  return /^[A-Za-z0-9_-]{6,128}$/.test(projectId) ? projectId : "";
}

function safeShareId(value) {
  const shareId = String(value || "").trim();
  return /^[A-Za-z0-9-]{6,128}$/.test(shareId) ? shareId : "";
}

function lastProjectId() {
  try { return safeProjectId(window.localStorage.getItem(LAST_PROJECT_KEY)); }
  catch { return ""; }
}

function rememberProject(projectId) {
  try { window.localStorage.setItem(LAST_PROJECT_KEY, projectId); }
  catch { /* Private browsing may disable local storage. */ }
}

function forgetProject(projectId) {
  try {
    if (lastProjectId() === projectId) window.localStorage.removeItem(LAST_PROJECT_KEY);
  } catch { /* Nothing to clear. */ }
}

function isStandaloneApp() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
}

function updateInstallManifest(projectId = "") {
  installProjectId = safeProjectId(projectId);
  if (!installProjectId) {
    elements.installManifest?.remove();
    elements.installManifest = null;
    return;
  }
  if (!elements.installManifest) {
    elements.installManifest = document.createElement("link");
    elements.installManifest.rel = "manifest";
    elements.installManifest.dataset.installManifest = "";
    document.head.append(elements.installManifest);
  }
  const params = new URLSearchParams();
  params.set("project", installProjectId);
  params.set("lang", browserLanguage());
  elements.installManifest.href = `./install-manifest.webmanifest?${params.toString()}`;
}

function updateInstallVisibility() {
  const supportedBrowser = isIosDevice() || Boolean(installPrompt);
  elements.install.hidden = !installProjectId || isStandaloneApp() || !supportedBrowser;
}

function showInstallGuide() {
  applyInstallLanguage();
  elements.installGuide.hidden = false;
  elements.installGuideClose.focus();
}

function hideInstallGuide() {
  elements.installGuide.hidden = true;
  elements.install.focus();
}

function sectionActionLabels() {
  return READER_LABELS[bookLanguage()] || READER_LABELS.fr;
}

function applyReaderLanguage(labels) {
  document.documentElement.lang = bookLanguage();
  elements.imaginationHint.textContent = labels.imagine;
  elements.showTextLabel.textContent = labels.showText;
  elements.topBack.setAttribute("aria-label", labels.previous);
  elements.previous.setAttribute("aria-label", labels.previous);
  elements.listenButtons.forEach((button) => button.setAttribute("aria-label", labels.listen));
  elements.textRegions.forEach((region) => region.setAttribute("aria-label", labels.textRegion));
  elements.completionEyebrow.textContent = labels.completionEyebrow;
  elements.completionTitle.textContent = labels.completionTitle;
  elements.completionMessage.textContent = labels.completionMessage;
  elements.completionRestart.textContent = labels.completionRestart;
  const hasAiNarration = Boolean(book?.narration?.synthetic);
  elements.prototypeLabel.textContent = hasAiNarration ? labels.aiLabel : labels.prototypeLabel;
  elements.prototypeNote.textContent = hasAiNarration ? labels.aiNote : labels.prototypeNote;
}

function applyBookTypography() {
  const fontStyle = book?.fontStyle || book?.font_style || book?.typography?.id || "school_round";
  const fontFamily = BOOK_FONTS[fontStyle] || BOOK_FONTS.school_round;
  document.documentElement.style.setProperty("--book-font", `"${fontFamily}"`);
}

function resetTextExpansion() {
  elements.textRegions.forEach((region) => {
    region.classList.remove("has-overflow");
    region.scrollTop = 0;
  });
}

function measureTextOverflow() {
  elements.textRegions.forEach((region) => {
    if (region.offsetParent === null) return;
    const overflowing = region.scrollHeight > region.clientHeight + 2;
    region.classList.toggle("has-overflow", overflowing);
  });
}

function queueTextMeasurement() {
  window.cancelAnimationFrame(textMeasurementFrame);
  textMeasurementFrame = window.requestAnimationFrame(() => {
    textMeasurementFrame = window.requestAnimationFrame(measureTextOverflow);
  });
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = setTimeout(() => {
    elements.toast.hidden = true;
  }, 4200);
}

function setSpeechStatus(isSpeaking) {
  elements.listenButtons.forEach((button) => {
    button.classList.toggle("is-speaking", isSpeaking);
    button.setAttribute("aria-pressed", String(isSpeaking));
  });
}

function scrollCardTextWithWheel(event) {
  const region = event.currentTarget.querySelector("[data-text-region]");
  if (!region || region.scrollHeight <= region.clientHeight + 2 || !event.deltaY) return;
  const canScrollUp = event.deltaY < 0 && region.scrollTop > 0;
  const canScrollDown = event.deltaY > 0 && region.scrollTop + region.clientHeight < region.scrollHeight - 1;
  if (!canScrollUp && !canScrollDown) return;
  region.scrollTop += event.deltaY;
  event.preventDefault();
}

function stopSpeech() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  narrationAudio.pause();
  narrationAudio.removeAttribute("src");
  narrationAudio.load();
  setSpeechStatus(false);
}

function waitForVoices() {
  const speech = window.speechSynthesis;
  const available = speech.getVoices();
  if (available.length) return Promise.resolve(available);

  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      speech.removeEventListener("voiceschanged", finish);
      resolve(speech.getVoices());
    };
    speech.addEventListener("voiceschanged", finish);
    window.setTimeout(finish, 1200);
  });
}

async function speakCurrentScene() {
  const scene = book.scenes[state.sceneIndex];
  if (scene.audio) {
    if (!narrationAudio.paused && narrationAudio.currentSrc) {
      stopSpeech();
      showToast("Lecture arrêtée.");
      return;
    }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    narrationAudio.src = scene.audio;
    narrationAudio.onplay = () => {
      setSpeechStatus(true);
      showToast("Narration IA en cours… Touchez à nouveau le haut-parleur pour arrêter.");
    };
    narrationAudio.onended = () => setSpeechStatus(false);
    narrationAudio.onerror = () => {
      setSpeechStatus(false);
      showToast("La narration IA n’est pas disponible pour le moment. Réessayez dans quelques instants.");
    };
    try { await narrationAudio.play(); }
    catch { narrationAudio.onerror(); }
    return;
  }
  if (!("speechSynthesis" in window)) {
    showToast("La voix de démonstration n’est pas disponible sur ce navigateur.");
    return;
  }

  if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
    stopSpeech();
    showToast("Lecture arrêtée.");
    return;
  }

  stopSpeech();
  const voices = await waitForVoices();
  const utterance = new SpeechSynthesisUtterance(scene.text);
  utterance.lang = book.language || "fr-FR";
  utterance.rate = 0.88;
  utterance.pitch = 1.04;
  utterance.volume = 1;
  const language = utterance.lang.toLowerCase().split("-")[0];
  utterance.voice = voices.find((voice) => voice.lang.toLowerCase() === utterance.lang.toLowerCase())
    || voices.find((voice) => voice.lang.toLowerCase().startsWith(language))
    || null;
  utterance.onstart = () => {
    setSpeechStatus(true);
    showToast("Lecture en cours… Touchez à nouveau le haut-parleur pour arrêter.");
  };
  utterance.onend = () => setSpeechStatus(false);
  utterance.onerror = (event) => {
    setSpeechStatus(false);
    if (event.error !== "canceled" && event.error !== "interrupted") {
      showToast("Aucune voix française ne répond. Vérifiez le volume ou les voix installées sur le téléphone.");
    }
  };
  window.speechSynthesis.resume();
  window.speechSynthesis.speak(utterance);
}

function setViewVisibility(activeView) {
  elements.loading.hidden = true;
  elements.anticipation.hidden = activeView !== "anticipation";
  elements.revealed.hidden = activeView !== "revealed";
  elements.completion.hidden = activeView !== "complete";
}

function render({ preserveSpeech = false } = {}) {
  if (!preserveSpeech) stopSpeech();
  if (!preserveSpeech) resetTextExpansion();
  const actions = sectionActionLabels();
  applyReaderLanguage(actions);
  setViewVisibility(state.phase);
  if (state.phase === "complete") return;

  const scene = book.scenes[state.sceneIndex];
  const progress = scene.progressLabel || actions.progress(state.sceneIndex + 1, state.sceneCount);
  elements.progress.textContent = progress;
  elements.imageProgress.textContent = progress;
  elements.anticipationText.textContent = scene.text;
  elements.revealedText.textContent = scene.text;
  if (scene.image) {
    elements.sceneImage.src = scene.image;
    elements.sceneImage.alt = scene.alt || "";
  } else {
    elements.sceneImage.removeAttribute("src");
    elements.sceneImage.alt = "";
  }
  const textOnly = scene.kind === "text_only";
  elements.anticipation.classList.toggle("is-text-only", textOnly);
  elements.revealLabel.textContent = textOnly
    ? (state.sceneIndex === state.sceneCount - 1 ? actions.finish : actions.continue)
    : actions.reveal;
  elements.imaginationHint.hidden = textOnly;
  elements.topBack.hidden = state.sceneIndex === 0;
  elements.previous.disabled = state.sceneIndex === 0;
  elements.previous.classList.toggle("is-placeholder", state.sceneIndex === 0);
  elements.previous.setAttribute("aria-hidden", String(state.sceneIndex === 0));
  elements.next.setAttribute("aria-label", state.sceneIndex === state.sceneCount - 1 ? actions.finishNext : actions.next);

  elements.textOverlay.hidden = !state.textVisible;
  elements.collapsedControls.hidden = state.textVisible;
  elements.revealed.classList.toggle("is-text-collapsed", !state.textVisible);
  elements.toggleLabel.textContent = state.textVisible ? actions.hideText : actions.showText;
  queueTextMeasurement();
}

document.querySelector("[data-reveal]").addEventListener("click", () => {
  if (book.scenes[state.sceneIndex].kind === "text_only") {
    state = goToNextScene(revealScene(state));
    render();
    return;
  }
  state = revealScene(state);
  render({ preserveSpeech: true });
});

document.querySelector("[data-text-toggle]").addEventListener("click", () => {
  state = setTextVisibility(state, false);
  render({ preserveSpeech: true });
});

elements.showText.addEventListener("click", () => {
  state = setTextVisibility(state, true);
  render({ preserveSpeech: true });
});

elements.next.addEventListener("click", () => {
  state = goToNextScene(state);
  render();
});

function previousScene() {
  state = goToPreviousScene(state);
  if (book.scenes[state.sceneIndex].kind === "text_only" && state.phase === "revealed") {
    state = { ...state, phase: "anticipation", textVisible: true };
  }
  render();
}

elements.previous.addEventListener("click", previousScene);
elements.topBack.addEventListener("click", previousScene);
document.querySelector("[data-restart]").addEventListener("click", () => {
  state = createReaderState(book.scenes.length);
  render();
});
elements.listenButtons.forEach((button) => button.addEventListener("click", speakCurrentScene));
document.querySelectorAll(".story-card, .text-overlay").forEach((container) => {
  container.addEventListener("wheel", scrollCardTextWithWheel, { passive: false });
});
window.addEventListener("resize", queueTextMeasurement);

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.installGuide.hidden) {
    hideInstallGuide();
    return;
  }
  if (event.key === "ArrowLeft") previousScene();
  if (event.key === "ArrowRight" && state.phase === "revealed") {
    state = goToNextScene(state);
    render();
  }
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  updateInstallVisibility();
});

applyInstallLanguage();
updateInstallManifest();
updateInstallVisibility();

elements.install.addEventListener("click", async () => {
  if (!installPrompt) {
    showInstallGuide();
    return;
  }
  await installPrompt.prompt();
  installPrompt = undefined;
  elements.install.hidden = true;
});
elements.installGuideClose.addEventListener("click", hideInstallGuide);
elements.installGuideDone.addEventListener("click", hideInstallGuide);
elements.installGuide.addEventListener("click", (event) => {
  if (event.target === elements.installGuide) hideInstallGuide();
});

window.addEventListener("appinstalled", () => {
  elements.install.hidden = true;
  showToast("La liseuse Calitiki est installée sur cet appareil.");
});

async function start() {
  const parameters = new URLSearchParams(window.location.search);
  const shareId = safeShareId(parameters.get("share"));
  const requestedProjectId = shareId ? "" : safeProjectId(parameters.get("project"));
  const projectId = shareId ? "" : (requestedProjectId || lastProjectId());
  try {
    const source = shareId
      ? `/api/shared-books/${encodeURIComponent(shareId)}/interactive-book`
      : projectId
      ? `/api/projects/${encodeURIComponent(projectId)}/interactive-book`
      : "./demo-book.json";
    const response = await fetch(source, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.error || `HTTP ${response.status}`);
      error.status = response.status;
      error.issues = Array.isArray(payload?.issues) ? payload.issues : [];
      throw error;
    }
    book = payload.book || payload;
    if (!Array.isArray(book.scenes) || book.scenes.length === 0) throw new Error("Livre vide");
    applyBookTypography();
    applyInstallLanguage();
    if (projectId) {
      rememberProject(projectId);
      updateInstallManifest(projectId);
      updateInstallVisibility();
    }
    state = createReaderState(book.scenes.length);
    render();
    document.fonts?.ready.then(queueTextMeasurement);
  } catch (error) {
    if (projectId && [403, 404].includes(error.status)) forgetProject(projectId);
    const readerLabels = INSTALL_LABELS[browserLanguage()] || INSTALL_LABELS.fr;
    const message = shareId && [401, 410].includes(error.status)
      ? readerLabels.familyExpired
      : !projectId && !shareId
      ? "Impossible d’ouvrir le livre de démonstration."
      : error.status === 401
        ? readerLabels.expired
        : error.status === 409
          ? "Certaines pages privées de ce livre ne sont pas encore disponibles dans la liseuse."
          : "Impossible d’ouvrir votre livre interactif pour le moment.";
    const paragraph = document.createElement("p");
    paragraph.textContent = message;
    const children = [paragraph];
    if (projectId && error.status === 401) {
      const reconnect = document.createElement("a");
      reconnect.className = "reader-error-action";
      reconnect.href = `/api/auth/woocommerce/reader?projectId=${encodeURIComponent(projectId)}`;
      reconnect.textContent = readerLabels.reconnect;
      children.push(reconnect);
    }
    elements.loading.replaceChildren(...children);
    console.error(error);
  }
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadingForServiceWorker) return;
    reloadingForServiceWorker = true;
    window.location.reload();
  });
  window.addEventListener("load", async () => {
    const registration = await navigator.serviceWorker.register("./sw.js");
    await registration.update();
  });
}

start();

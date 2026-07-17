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
  toggleLabel: document.querySelector("[data-toggle-label]"),
  install: document.querySelector("[data-install]"),
  toast: document.querySelector("[data-toast]"),
  listenButtons: [...document.querySelectorAll("[data-listen]")],
};

let book;
let state;
let installPrompt;
let toastTimer;

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
    const icon = button.querySelector("[data-speech-icon]");
    if (icon) icon.textContent = isSpeaking ? "■" : "🔊";
  });
}

function stopSpeech() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
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
  const utterance = new SpeechSynthesisUtterance(book.scenes[state.sceneIndex].text);
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

function render() {
  stopSpeech();
  setViewVisibility(state.phase);
  if (state.phase === "complete") return;

  const scene = book.scenes[state.sceneIndex];
  const progress = `Scène ${state.sceneIndex + 1} sur ${state.sceneCount}`;
  elements.progress.textContent = progress;
  elements.imageProgress.textContent = progress;
  elements.anticipationText.textContent = scene.text;
  elements.revealedText.textContent = scene.text;
  elements.sceneImage.src = scene.image;
  elements.sceneImage.alt = scene.alt;
  elements.topBack.hidden = state.sceneIndex === 0;
  elements.previous.disabled = state.sceneIndex === 0;
  elements.next.setAttribute(
    "aria-label",
    state.sceneIndex === state.sceneCount - 1 ? "Terminer la démonstration" : "Découvrir la scène suivante",
  );

  elements.textOverlay.hidden = !state.textVisible;
  elements.showText.hidden = state.textVisible;
  elements.toggleLabel.textContent = state.textVisible ? "Masquer le texte" : "Voir le texte";
}

document.querySelector("[data-reveal]").addEventListener("click", () => {
  state = revealScene(state);
  render();
});

document.querySelector("[data-text-toggle]").addEventListener("click", () => {
  state = setTextVisibility(state, false);
  render();
});

elements.showText.addEventListener("click", () => {
  state = setTextVisibility(state, true);
  render();
});

elements.next.addEventListener("click", () => {
  state = goToNextScene(state);
  render();
});

function previousScene() {
  state = goToPreviousScene(state);
  render();
}

elements.previous.addEventListener("click", previousScene);
elements.topBack.addEventListener("click", previousScene);
document.querySelector("[data-restart]").addEventListener("click", () => {
  state = createReaderState(book.scenes.length);
  render();
});
elements.listenButtons.forEach((button) => button.addEventListener("click", speakCurrentScene));

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") previousScene();
  if (event.key === "ArrowRight" && state.phase === "revealed") {
    state = goToNextScene(state);
    render();
  }
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  elements.install.hidden = false;
});

elements.install.addEventListener("click", async () => {
  if (!installPrompt) {
    showToast("Sur iPhone : touchez Partager, puis Sur l’écran d’accueil.");
    return;
  }
  await installPrompt.prompt();
  installPrompt = undefined;
  elements.install.hidden = true;
});

window.addEventListener("appinstalled", () => {
  elements.install.hidden = true;
  showToast("La liseuse Calitiki est installée sur cet appareil.");
});

async function start() {
  try {
    const response = await fetch("./demo-book.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    book = await response.json();
    if (!Array.isArray(book.scenes) || book.scenes.length === 0) throw new Error("Livre vide");
    state = createReaderState(book.scenes.length);
    render();
  } catch (error) {
    elements.loading.innerHTML = "<p>Impossible d’ouvrir le livre de démonstration.</p>";
    console.error(error);
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
}

start();

const state = {
  config: null,
  step: 0,
  selectedStyle: "",
  photos: [],
  jobId: "",
};

const elements = {
  form: document.querySelector("#bookForm"),
  childQuestions: document.querySelector("#childQuestions"),
  storyQuestions: document.querySelector("#storyQuestions"),
  styleGrid: document.querySelector("#styleGrid"),
  photoInput: document.querySelector("#photoInput"),
  photoList: document.querySelector("#photoList"),
  photoCount: document.querySelector("#photoCount"),
  reviewCard: document.querySelector("#reviewCard"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  formError: document.querySelector("#formError"),
  generationPanel: document.querySelector("#generationPanel"),
  generationBar: document.querySelector("#generationBar"),
  generationStep: document.querySelector("#generationStep"),
  generationTitle: document.querySelector("#generationTitle"),
  generationMessage: document.querySelector("#generationMessage"),
  resultSection: document.querySelector("#resultSection"),
  bookPreview: document.querySelector("#bookPreview"),
  mobileStepLabel: document.querySelector("#mobileStepLabel"),
  mobileProgressBar: document.querySelector("#mobileProgressBar"),
};

const roleLabels = {
  child: "L’enfant",
  mascot: "Mascotte / animal",
  friend: "Ami(e)",
  family: "Famille",
  other: "Autre personnage",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderQuestion(question, index) {
  const isTextArea = question.type === "textarea";
  const wide = isTextArea ? " is-wide" : "";
  const required = question.required ? "required" : "";
  const input = isTextArea
    ? `<textarea id="${question.id}" name="${question.id}" ${required} placeholder="Votre réponse…"></textarea>`
    : `<input id="${question.id}" name="${question.id}" type="${question.type}" ${required} ${question.type === "number" ? 'min="1" max="14"' : ""} placeholder="Votre réponse…" />`;
  return `<div class="field${wide}"><label for="${question.id}">${index + 1}. ${escapeHtml(question.label)}${question.required ? " *" : ""}</label>${input}<small>${escapeHtml(question.help)}</small></div>`;
}

function renderQuestions() {
  const questions = state.config.questions;
  elements.childQuestions.innerHTML = questions.slice(0, 4).map(renderQuestion).join("");
  elements.storyQuestions.innerHTML = questions.slice(4).map((question, index) => renderQuestion(question, index + 4)).join("");
}

function renderStyles() {
  const styles = state.config.illustrationStyles;
  state.selectedStyle = state.selectedStyle || styles[0]?.id;
  elements.styleGrid.innerHTML = styles.map((style) => `
    <button type="button" class="style-card ${style.id === state.selectedStyle ? "is-selected" : ""}" data-style-id="${style.id}" role="radio" aria-checked="${style.id === state.selectedStyle}">
      <span class="style-swatch">${style.palette.map((color) => `<i style="background:${color}"></i>`).join("")}</span>
      <span class="style-card-copy"><strong>${escapeHtml(style.name)}</strong><small>${escapeHtml(style.description)}</small></span>
    </button>`).join("");
  elements.styleGrid.querySelectorAll(".style-card").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedStyle = button.dataset.styleId;
      renderStyles();
    });
  });
}

function addPhotos(files) {
  const remaining = 5 - state.photos.length;
  [...files].slice(0, remaining).forEach((file) => {
    state.photos.push({
      file,
      url: URL.createObjectURL(file),
      role: state.photos.some((photo) => photo.role === "child") ? "friend" : "child",
      name: "",
      relationship: "",
    });
  });
  renderPhotos();
}

function renderPhotos() {
  elements.photoCount.textContent = state.photos.length;
  elements.photoList.innerHTML = state.photos.map((photo, index) => `
    <article class="photo-item" data-photo-index="${index}">
      <img src="${photo.url}" alt="Aperçu de ${escapeHtml(photo.file.name)}" />
      <div class="photo-meta">
        <select aria-label="Rôle de la photo">${Object.entries(roleLabels).map(([value, label]) => `<option value="${value}" ${value === photo.role ? "selected" : ""}>${label}</option>`).join("")}</select>
        <input type="text" value="${escapeHtml(photo.name)}" placeholder="Prénom ou nom" aria-label="Prénom ou nom du personnage" />
      </div>
      <button type="button" class="remove-photo" aria-label="Supprimer cette photo">×</button>
    </article>`).join("");

  elements.photoList.querySelectorAll(".photo-item").forEach((item) => {
    const index = Number(item.dataset.photoIndex);
    const [select, input] = item.querySelectorAll("select, input");
    select.addEventListener("change", () => { state.photos[index].role = select.value; });
    input.addEventListener("input", () => { state.photos[index].name = input.value; });
    item.querySelector(".remove-photo").addEventListener("click", () => {
      URL.revokeObjectURL(state.photos[index].url);
      state.photos.splice(index, 1);
      renderPhotos();
    });
  });
}

function formValues() {
  return Object.fromEntries(new FormData(elements.form).entries());
}

function validateStep() {
  elements.formError.textContent = "";
  if (state.step === 0 || state.step === 1) {
    const panel = document.querySelector(`[data-panel="${state.step}"]`);
    const required = [...panel.querySelectorAll("[required]")];
    const invalid = required.filter((input) => !String(input.value).trim());
    required.forEach((input) => input.classList.toggle("is-invalid", invalid.includes(input)));
    if (invalid.length) {
      elements.formError.textContent = "Complétez les réponses indiquées avant de continuer.";
      invalid[0].focus();
      return false;
    }
  }
  if (state.step === 2 && !state.selectedStyle) {
    elements.formError.textContent = "Choisissez un style d’illustration.";
    return false;
  }
  if (state.step === 3) {
    const childPhotos = state.photos.filter((photo) => photo.role === "child");
    if (childPhotos.length > 1) {
      elements.formError.textContent = "Une seule photo peut être définie comme photo de l’enfant.";
      return false;
    }
    if (state.photos.some((photo) => !photo.name.trim())) {
      elements.formError.textContent = "Indiquez le prénom ou le nom de chaque personnage photographié.";
      return false;
    }
  }
  return true;
}

function renderReview() {
  const values = formValues();
  const style = state.config.illustrationStyles.find((item) => item.id === state.selectedStyle);
  const rows = [
    ["Héros", `${values.hero_name || "—"}, ${values.age || "—"} ans`],
    ["Rêve", values.dream || "—"],
    ["Défi", values.challenge || "—"],
    ["Message", values.message || "—"],
    ["Univers", values.universe || "—"],
    ["Style", style?.name || "—"],
    ["Photos", state.photos.length ? `${state.photos.length} personnage(s) de référence` : "Aucune photo — création imaginaire"],
  ];
  elements.reviewCard.innerHTML = rows.map(([label, value]) => `<div class="review-row"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`).join("");
}

function showStep(nextStep, shouldScroll = true) {
  state.step = Math.max(0, Math.min(4, nextStep));
  document.querySelectorAll(".form-panel").forEach((panel) => panel.classList.toggle("is-active", Number(panel.dataset.panel) === state.step));
  document.querySelectorAll(".step").forEach((step, index) => {
    step.classList.toggle("is-active", index === state.step);
    step.classList.toggle("is-complete", index < state.step);
  });
  elements.prevButton.hidden = state.step === 0;
  elements.nextButton.hidden = state.step === 4;
  elements.mobileStepLabel.textContent = `Étape ${state.step + 1} sur 5`;
  elements.mobileProgressBar.style.width = `${(state.step + 1) * 20}%`;
  elements.formError.textContent = "";
  if (state.step === 4) renderReview();
  if (shouldScroll) {
    document.querySelector("#creator").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

async function uploadPhotos() {
  if (!state.photos.length) return [];
  const formData = new FormData();
  state.photos.forEach((photo) => formData.append("photos", photo.file));
  const response = await fetch("/api/upload", { method: "POST", body: formData });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Impossible d’envoyer les photos.");
  return payload.photos.map((uploaded, index) => ({
    id: uploaded.id,
    role: state.photos[index].role,
    name: state.photos[index].name.trim(),
    relationship: state.photos[index].relationship,
  }));
}

function generationProgress(step = "") {
  const pageMatch = step.match(/page:(\d+)/);
  if (pageMatch) return Math.min(96, 18 + Number(pageMatch[1]) * 3.2);
  if (step.includes("photo")) return 8;
  if (step.includes("storybrand")) return 13;
  if (step.includes("blueprint")) return 17;
  if (step.includes("cover")) return 21;
  if (step.includes("done")) return 100;
  return 5;
}

function friendlyStep(step = "") {
  if (step.includes("photo")) return "Nous observons les traits des personnages";
  if (step.includes("storybrand")) return "Nous construisons l’arc narratif StoryBrand";
  if (step.includes("blueprint")) return "Nous organisons les onze doubles-pages";
  if (step.includes("cover")) return "Nous illustrons la couverture";
  const pageMatch = step.match(/page:(\d+)/);
  if (pageMatch) return `Création de la page ${pageMatch[1]} sur 24`;
  return "Préparation de l’histoire";
}

async function pollJob(jobId) {
  for (;;) {
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`);
    const job = await response.json();
    if (!response.ok) throw new Error(job.error || "Impossible de suivre la création.");
    elements.generationBar.style.width = `${generationProgress(job.step)}%`;
    elements.generationStep.textContent = friendlyStep(job.step);
    if (job.status === "done") return job;
    if (job.status === "failed") throw new Error(job.error || "La génération a échoué.");
    await new Promise((resolve) => setTimeout(resolve, 2200));
  }
}

function renderBook(job) {
  const { coverPreviewUrl, draftPages = [] } = job.result || {};
  const spreads = [];
  const opening = draftPages.find((page) => page.page_number === 1);
  for (let pageNumber = 2; pageNumber <= 22; pageNumber += 2) {
    spreads.push(draftPages.filter((page) => page.page_number === pageNumber || page.page_number === pageNumber + 1));
  }
  const closing = draftPages.find((page) => page.page_number === 24);
  const pageMarkup = (page) => page ? `<div class="preview-page"><img src="${page.previewUrl}" alt="Page ${page.page_number}" /><span>Page ${page.page_number}</span></div>` : "";
  elements.bookPreview.innerHTML = `
    ${coverPreviewUrl ? `<div class="preview-cover"><img src="${coverPreviewUrl}" alt="Couverture du livre" /></div>` : ""}
    ${opening ? `<div class="preview-cover">${pageMarkup(opening)}</div>` : ""}
    ${spreads.map((spread) => `<div class="spread">${spread.sort((a,b) => a.page_number-b.page_number).map(pageMarkup).join("")}</div>`).join("")}
    ${closing ? `<div class="preview-cover">${pageMarkup(closing)}</div>` : ""}`;
}

async function startGeneration(event) {
  event.preventDefault();
  elements.formError.textContent = "";
  const submit = elements.form.querySelector("[type=submit]");
  submit.disabled = true;
  submit.textContent = "Préparation…";
  try {
    const uploadedPhotos = await uploadPhotos();
    const questionnaire = { ...formValues(), style_id: state.selectedStyle, language: document.querySelector("#language").value };
    const response = await fetch("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionnaire, photos: uploadedPhotos }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Impossible de démarrer la création.");
    state.jobId = payload.jobId;
    document.querySelector("#creator").hidden = true;
    elements.generationPanel.hidden = false;
    elements.generationPanel.scrollIntoView({ behavior: "smooth" });
    const job = await pollJob(payload.jobId);
    elements.generationBar.style.width = "100%";
    elements.generationPanel.hidden = true;
    elements.resultSection.hidden = false;
    renderBook(job);
    elements.resultSection.scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    document.querySelector("#creator").hidden = false;
    elements.generationPanel.hidden = true;
    elements.formError.textContent = error.message;
    elements.formError.scrollIntoView({ behavior: "smooth" });
  } finally {
    submit.disabled = false;
    submit.innerHTML = "Créer le brouillon de mon livre <span>→</span>";
  }
}

async function init() {
  try {
    const response = await fetch("/api/questionnaire");
    state.config = await response.json();
    if (!response.ok) throw new Error("Configuration indisponible");
    renderQuestions();
    renderStyles();
    showStep(0, false);
  } catch (error) {
    elements.formError.textContent = "L’interface n’a pas pu charger le questionnaire.";
    elements.nextButton.disabled = true;
  }
}

elements.photoInput.addEventListener("change", (event) => {
  addPhotos(event.target.files);
  event.target.value = "";
});
elements.prevButton.addEventListener("click", () => showStep(state.step - 1));
elements.nextButton.addEventListener("click", () => { if (validateStep()) showStep(state.step + 1); });
document.querySelectorAll(".step").forEach((step, index) => step.addEventListener("click", () => {
  if (index <= state.step || validateStep()) showStep(index);
}));
elements.form.addEventListener("submit", startGeneration);

init();

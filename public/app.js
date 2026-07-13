import { translate } from "./i18n.js";

const state = {
  config: null,
  locale: localStorage.getItem("storybook-ui-language") || "FR",
  step: 0,
  selectedStyle: "",
  selectedUniverse: "",
  fontStyle: "school_round",
  pageCount: 24,
  photos: [],
  jobId: "",
};

const elements = {
  form: document.querySelector("#bookForm"), childQuestions: document.querySelector("#childQuestions"), storyQuestions: document.querySelector("#storyQuestions"),
  styleGrid: document.querySelector("#styleGrid"), universeGrid: document.querySelector("#universeGrid"), fontGrid: document.querySelector("#fontGrid"), pageCountGrid: document.querySelector("#pageCountGrid"),
  photoInput: document.querySelector("#photoInput"), photoDropZone: document.querySelector("#photoDropZone"), photoList: document.querySelector("#photoList"), photoCount: document.querySelector("#photoCount"),
  reviewCard: document.querySelector("#reviewCard"), prevButton: document.querySelector("#prevButton"), nextButton: document.querySelector("#nextButton"), formError: document.querySelector("#formError"),
  generationPanel: document.querySelector("#generationPanel"), generationBar: document.querySelector("#generationBar"), generationStep: document.querySelector("#generationStep"), resultSection: document.querySelector("#resultSection"), bookPreview: document.querySelector("#bookPreview"),
  mobileStepLabel: document.querySelector("#mobileStepLabel"), mobileProgressBar: document.querySelector("#mobileProgressBar"), uiLanguage: document.querySelector("#uiLanguage"), costNote: document.querySelector("#costNote"),
  heroPageCount: document.querySelector("#heroPageCount"), heroIllustrationCount: document.querySelector("#heroIllustrationCount"), resultTitle: document.querySelector("#resultTitle"),
};

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

function formValues() { return Object.fromEntries(new FormData(elements.form).entries()); }
function restoreValues(values) { Object.entries(values).forEach(([name, value]) => { const input = elements.form.elements.namedItem(name); if (input && typeof input.value !== "undefined") input.value = value; }); }

function applyTranslations() {
  document.documentElement.lang = state.locale.toLowerCase();
  document.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = tr(node.dataset.i18n); });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => { node.placeholder = tr(node.dataset.i18nPlaceholder); });
  elements.uiLanguage.value = state.locale;
  updateBookMetrics();
}

function renderQuestion(question, index) {
  const [label, help] = QUESTION_TEXT[state.locale][question.id] || [question.label, question.help];
  const isTextArea = question.type === "textarea";
  const input = isTextArea
    ? `<textarea id="${question.id}" name="${question.id}" ${question.required ? "required" : ""} placeholder="${escapeHtml(tr("answerPlaceholder"))}"></textarea>`
    : `<input id="${question.id}" name="${question.id}" type="${question.type}" ${question.required ? "required" : ""} ${question.type === "number" ? 'min="1" max="14"' : ""} placeholder="${escapeHtml(tr("answerPlaceholder"))}" />`;
  return `<div class="field${isTextArea ? " is-wide" : ""}"><label for="${question.id}">${index + 1}. ${escapeHtml(label)}${question.required ? " *" : ""}</label>${input}<small>${escapeHtml(help)}</small></div>`;
}

function renderQuestions(values = {}) {
  const questions = state.config.questions;
  elements.childQuestions.innerHTML = questions.slice(0, 4).map(renderQuestion).join("");
  elements.storyQuestions.innerHTML = questions.filter((question, index) => index >= 4 && question.id !== "universe").map((question) => renderQuestion(question, questions.findIndex((item) => item.id === question.id))).join("");
  elements.storyQuestions.insertAdjacentHTML("beforeend", `<div class="field is-wide"><label for="extra_notes">${escapeHtml(tr("extraLabel"))}</label><textarea id="extra_notes" name="extra_notes" placeholder="${escapeHtml(tr("extraPlaceholder"))}"></textarea><small>${escapeHtml(tr("extraHelp"))}</small></div>`);
  restoreValues(values);
}

function renderUniverses() {
  const options = state.config.universeOptions;
  state.selectedUniverse ||= options[0]?.id;
  elements.universeGrid.innerHTML = options.map((option) => {
    const [name, description] = UNIVERSE_TEXT[option.id]?.[state.locale] || [option.name, option.description];
    return `<button type="button" class="visual-card universe-card preview-${option.id} ${option.id === state.selectedUniverse ? "is-selected" : ""}" data-universe-id="${option.id}" role="radio" aria-checked="${option.id === state.selectedUniverse}"><span class="visual-card-art" style="--c1:${option.palette[0]};--c2:${option.palette[1]};--c3:${option.palette[2]}"><i></i><b></b></span><span class="visual-card-copy"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(description)}</small></span><span class="info-dot" title="${escapeHtml(description)}" aria-label="${escapeHtml(tr("information"))}">i</span></button>`;
  }).join("");
  document.querySelector("#universe_id").value = state.selectedUniverse;
  document.querySelector("#universe").value = "";
  elements.universeGrid.querySelectorAll("[data-universe-id]").forEach((button) => button.addEventListener("click", () => { state.selectedUniverse = button.dataset.universeId; renderUniverses(); emitWooConfiguration(); }));
}

function renderStyles() {
  const styles = state.config.illustrationStyles;
  state.selectedStyle ||= styles[0]?.id;
  elements.styleGrid.innerHTML = styles.map((style) => {
    const [name, description] = STYLE_TEXT[style.id]?.[state.locale] || [style.name, style.description];
    return `<button type="button" class="style-card preview-${style.id} ${style.id === state.selectedStyle ? "is-selected" : ""}" data-style-id="${style.id}" role="radio" aria-checked="${style.id === state.selectedStyle}"><span class="style-preview" style="--c1:${style.palette[0]};--c2:${style.palette[1]};--c3:${style.palette[2]}"><i></i><b></b></span><span class="style-card-copy"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(description)}</small></span></button>`;
  }).join("");
  elements.styleGrid.querySelectorAll("[data-style-id]").forEach((button) => button.addEventListener("click", () => { state.selectedStyle = button.dataset.styleId; renderStyles(); emitWooConfiguration(); }));
}

function renderFonts() {
  elements.fontGrid.innerHTML = state.config.typographyOptions.map((option) => `<button type="button" class="font-card font-${option.id} ${option.id === state.fontStyle ? "is-selected" : ""}" data-font-id="${option.id}" role="radio" aria-checked="${option.id === state.fontStyle}"><span>${state.locale === "ES" ? "Había una vez una gran aventura..." : state.locale === "EN" ? "Once upon a time, a great adventure..." : "Il était une fois une grande aventure..."}</span></button>`).join("");
  elements.fontGrid.querySelectorAll("[data-font-id]").forEach((button) => button.addEventListener("click", () => { state.fontStyle = button.dataset.fontId; renderFonts(); emitWooConfiguration(); }));
}

function renderPageCounts() {
  elements.pageCountGrid.innerHTML = state.config.pageCountOptions.map((option) => `<button type="button" class="page-count-card ${option.pageCount === state.pageCount ? "is-selected" : ""}" data-page-count="${option.pageCount}" role="radio" aria-checked="${option.pageCount === state.pageCount}"><strong>${tr("pages", { count: option.pageCount })}</strong><small>${tr("illustrations", { count: option.illustrationCount })}</small></button>`).join("");
  elements.pageCountGrid.querySelectorAll("[data-page-count]").forEach((button) => button.addEventListener("click", () => { state.pageCount = Number(button.dataset.pageCount); renderPageCounts(); updateBookMetrics(); emitWooConfiguration(); }));
}

function updateBookMetrics() {
  const illustrations = (state.pageCount - 2) / 2;
  elements.heroPageCount.textContent = tr("pages", { count: state.pageCount });
  elements.heroIllustrationCount.textContent = tr("illustrations", { count: illustrations });
  elements.costNote.textContent = `${tr("cost", { count: illustrations + 1, inside: illustrations })} ${tr("priceVariation", { count: state.pageCount })}`;
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
  elements.photoList.innerHTML = state.photos.map((photo, index) => `<article class="photo-item" data-photo-index="${index}"><img src="${photo.url}" alt="${escapeHtml(tr("photoPreview", { name: photo.file.name }))}" /><div class="photo-meta"><select data-field="role">${["child", "mascot", "friend", "family", "other"].map((value) => `<option value="${value}" ${value === photo.role ? "selected" : ""}>${labels[value]}</option>`).join("")}</select><select data-field="storyRole">${["hero", "guide", "ally", "companion", "supporter", "guest"].map((value) => `<option value="${value}" ${value === photo.storyRole ? "selected" : ""} ${(photo.role === "child" && value !== "hero") || (photo.role !== "child" && value === "hero") ? "disabled" : ""}>${labels[value]}</option>`).join("")}</select><input data-field="name" value="${escapeHtml(photo.name)}" placeholder="${escapeHtml(tr("photoName"))}" /><input data-field="relationship" value="${escapeHtml(photo.relationship)}" placeholder="${escapeHtml(tr("relationship"))}" /></div><button type="button" class="remove-photo" aria-label="${escapeHtml(tr("removePhoto"))}">×</button></article>`).join("");
  elements.photoList.querySelectorAll(".photo-item").forEach((item) => {
    const index = Number(item.dataset.photoIndex);
    item.querySelector('[data-field="role"]').addEventListener("change", (event) => { const previous = state.photos[index].role; state.photos[index].role = event.target.value; if (event.target.value === "child" || state.photos[index].storyRole === defaultStoryRole(previous)) state.photos[index].storyRole = defaultStoryRole(event.target.value); renderPhotos(); });
    item.querySelector('[data-field="storyRole"]').addEventListener("change", (event) => { state.photos[index].storyRole = event.target.value; });
    item.querySelector('[data-field="name"]').addEventListener("input", (event) => { state.photos[index].name = event.target.value; });
    item.querySelector('[data-field="relationship"]').addEventListener("input", (event) => { state.photos[index].relationship = event.target.value; });
    item.querySelector(".remove-photo").addEventListener("click", () => { URL.revokeObjectURL(state.photos[index].url); state.photos.splice(index, 1); renderPhotos(); });
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
  const rows = [[tr("reviewHero"), `${values.hero_name || "—"}, ${values.age || "—"}`], [tr("reviewDream"), values.dream || "—"], [tr("reviewChallenge"), values.challenge || "—"], [tr("reviewMessage"), values.message || "—"], [tr("reviewUniverse"), localizedUniverseName()], [tr("reviewDetail"), values.extra_notes || tr("none")], [tr("reviewStyle"), localizedStyleName()], [tr("reviewFont"), document.querySelector(`.font-${state.fontStyle} span`)?.textContent || state.fontStyle], [tr("reviewPages"), tr("pages", { count: state.pageCount })], [tr("reviewPhotos"), state.photos.length ? tr("referenceCharacters", { count: state.photos.length }) : tr("noPhotos")], [tr("reviewRoles"), state.photos.length ? state.photos.map((photo) => `${photo.name}: ${labels[photo.storyRole]}`).join(" · ") : "—"]];
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

function productConfiguration() { return { page_count: state.pageCount, font_style: state.fontStyle, style_id: state.selectedStyle, universe_id: state.selectedUniverse, book_language: document.querySelector("#language").value, woo_variation_key: `pages_${state.pageCount}` }; }
function emitWooConfiguration() { const detail = productConfiguration(); window.dispatchEvent(new CustomEvent("storybook:configuration", { detail })); document.documentElement.dataset.storybookVariation = detail.woo_variation_key; }

async function uploadPhotos() {
  if (!state.photos.length) return [];
  const formData = new FormData(); state.photos.forEach((photo) => formData.append("photos", photo.file));
  const response = await fetch("/api/upload", { method: "POST", body: formData }); const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || tr("uploadError"));
  return payload.photos.map((uploaded, index) => ({ id: uploaded.id, role: state.photos[index].role, story_role: state.photos[index].storyRole, name: state.photos[index].name.trim(), relationship: state.photos[index].relationship }));
}

function generationProgress(step = "") { const match = step.match(/page:(\d+)/); if (match) return Math.min(96, 18 + Number(match[1]) * (78 / state.pageCount)); if (step.includes("photo")) return 8; if (step.includes("storybrand")) return 13; if (step.includes("blueprint")) return 17; if (step.includes("cover")) return 21; if (step.includes("done")) return 100; return 5; }
function friendlyStep(step = "") { if (step.includes("photo")) return tr("progressPhoto"); if (step.includes("storybrand")) return tr("progressStory"); if (step.includes("blueprint")) return tr("progressBlueprint"); if (step.includes("cover")) return tr("progressCover"); const match = step.match(/page:(\d+)/); return match ? tr("pageOf", { page: match[1], total: state.pageCount }) : tr("progressPreparing"); }

async function pollJob(jobId) {
  for (;;) { const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`); const job = await response.json(); if (!response.ok) throw new Error(job.error || tr("pollError")); elements.generationBar.style.width = `${generationProgress(job.step)}%`; elements.generationStep.textContent = friendlyStep(job.step); if (job.status === "done") return job; if (job.status === "failed") throw new Error(job.error || tr("generationFailed")); await new Promise((resolve) => setTimeout(resolve, 2200)); }
}

function renderBook(job) {
  const { coverPreviewUrl, draftPages = [] } = job.result || {}; const total = job.final_blueprint?.format?.interior_pages || state.pageCount; const spreads = [];
  const opening = draftPages.find((page) => page.page_number === 1); for (let number = 2; number <= total - 2; number += 2) spreads.push(draftPages.filter((page) => page.page_number === number || page.page_number === number + 1));
  const closing = draftPages.find((page) => page.page_number === total); const pageMarkup = (page) => page ? `<div class="preview-page"><img src="${page.previewUrl}" alt="Page ${page.page_number}" /><span>Page ${page.page_number}</span></div>` : "";
  elements.bookPreview.innerHTML = `${coverPreviewUrl ? `<div class="preview-cover"><img src="${coverPreviewUrl}" alt="Cover" /></div>` : ""}${opening ? `<div class="preview-cover">${pageMarkup(opening)}</div>` : ""}${spreads.map((spread) => `<div class="spread">${spread.sort((a, b) => a.page_number - b.page_number).map(pageMarkup).join("")}</div>`).join("")}${closing ? `<div class="preview-cover">${pageMarkup(closing)}</div>` : ""}`;
}

async function startGeneration(event) {
  event.preventDefault(); elements.formError.textContent = ""; const submit = elements.form.querySelector("[type=submit]"); submit.disabled = true; submit.textContent = tr("loading");
  try {
    const uploadedPhotos = await uploadPhotos(); const questionnaire = { ...formValues(), ...productConfiguration(), universe_details: document.querySelector("#universe_details").value };
    const response = await fetch("/api/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionnaire, photos: uploadedPhotos }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || tr("startError"));
    state.jobId = payload.jobId; document.querySelector("#creator").hidden = true; elements.generationPanel.hidden = false; elements.generationPanel.scrollIntoView({ behavior: "smooth" }); const job = await pollJob(payload.jobId); elements.generationBar.style.width = "100%"; elements.generationPanel.hidden = true; elements.resultSection.hidden = false; renderBook(job); elements.resultSection.scrollIntoView({ behavior: "smooth" });
  } catch (error) { document.querySelector("#creator").hidden = false; elements.generationPanel.hidden = true; elements.formError.textContent = error.message; elements.formError.scrollIntoView({ behavior: "smooth" }); }
  finally { submit.disabled = false; submit.innerHTML = `<span>${escapeHtml(tr("generate"))}</span> <span>→</span>`; }
}

function changeLocale(locale) {
  const values = state.config ? formValues() : {}; state.locale = ["FR", "ES", "EN"].includes(locale) ? locale : "FR"; localStorage.setItem("storybook-ui-language", state.locale); applyTranslations();
  if (state.config) { renderQuestions(values); renderUniverses(); renderStyles(); renderFonts(); renderPageCounts(); renderPhotos(); if (state.step === 4) renderReview(); showStep(state.step, false); }
}

async function init() {
  try { const response = await fetch("/api/questionnaire"); state.config = await response.json(); if (!response.ok) throw new Error("Configuration unavailable"); state.pageCount = state.config.bookFormat.interiorPageCount; changeLocale(state.locale); emitWooConfiguration(); }
  catch { elements.formError.textContent = "Configuration unavailable"; elements.nextButton.disabled = true; }
}

elements.photoInput.addEventListener("change", (event) => { addPhotos(event.target.files); event.target.value = ""; });
["dragenter", "dragover"].forEach((name) => elements.photoDropZone.addEventListener(name, (event) => { event.preventDefault(); elements.photoDropZone.classList.add("is-dragover"); }));
["dragleave", "drop"].forEach((name) => elements.photoDropZone.addEventListener(name, (event) => { event.preventDefault(); elements.photoDropZone.classList.remove("is-dragover"); }));
elements.photoDropZone.addEventListener("drop", (event) => addPhotos(event.dataTransfer.files));
elements.uiLanguage.addEventListener("change", () => changeLocale(elements.uiLanguage.value)); document.querySelector("#language").addEventListener("change", emitWooConfiguration);
elements.prevButton.addEventListener("click", () => showStep(state.step - 1)); elements.nextButton.addEventListener("click", () => { if (validateStep()) showStep(state.step + 1); });
document.querySelectorAll(".step").forEach((step, index) => step.addEventListener("click", () => { if (index <= state.step || validateStep()) showStep(index); })); elements.form.addEventListener("submit", startGeneration);

init();

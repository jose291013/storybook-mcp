const elements = {
  app: document.querySelector("[data-app]"), loading: document.querySelector("[data-loading]"),
  title: document.querySelector("[data-title]"), intro: document.querySelector("[data-intro]"), eyebrow: document.querySelector("[data-eyebrow]"),
  privacy: document.querySelector("[data-privacy]"), duration: document.querySelector("[data-duration]"), expiry: document.querySelector("[data-expiry]"),
  seven: document.querySelector("[data-seven]"), thirty: document.querySelector("[data-thirty]"), create: document.querySelector("[data-create]"),
  fresh: document.querySelector("[data-fresh-link]"), ready: document.querySelector("[data-ready]"), once: document.querySelector("[data-once]"),
  url: document.querySelector("[data-share-url]"), copy: document.querySelector("[data-copy]"), nativeShare: document.querySelector("[data-native-share]"),
  status: document.querySelector("[data-status]"), activeTitle: document.querySelector("[data-active-title]"), limit: document.querySelector("[data-limit]"),
  list: document.querySelector("[data-list]"), back: document.querySelector("[data-back]"),
};

const COPY = {
  fr: { eyebrow:"PARTAGE FAMILIAL PRIVÉ",title:"Invitez vos proches à découvrir ce livre",intro:"Ils ouvriront directement la liseuse, sans créer de compte. Le lien reste privé, temporaire et révocable.",privacy:"Une invitation donne accès à ce livre uniquement. Les photos et les autres créations restent privées.",duration:"Durée du lien",seven:"7 jours",thirty:"30 jours",create:"Créer un lien familial",ready:"Votre lien privé est prêt",once:"Copiez-le maintenant : pour votre sécurité, il ne sera pas réaffiché.",copy:"Copier",copied:"Lien copié",native:"Partager avec mon téléphone",active:"Invitations créées",limit:"Jusqu’à 3 invitations actives par livre.",back:"Retour à mes créations",activeState:"Active",expired:"Expirée",revoked:"Désactivée",views:"ouverture(s)",until:"Jusqu’au",revoke:"Désactiver",empty:"Aucune invitation créée pour ce livre.",loadError:"Impossible de charger les invitations.",createError:"Impossible de créer le lien familial.",shareText:"Je t’invite à découvrir notre livre interactif Calitiki."},
  es: { eyebrow:"ENLACE FAMILIAR PRIVADO",title:"Invita a tus seres queridos a descubrir este libro",intro:"Abrirán directamente el lector, sin crear una cuenta. El enlace es privado, temporal y revocable.",privacy:"Una invitación solo da acceso a este libro. Las fotos y las demás creaciones siguen siendo privadas.",duration:"Duración del enlace",seven:"7 días",thirty:"30 días",create:"Crear un enlace familiar",ready:"Tu enlace privado está listo",once:"Cópialo ahora: por seguridad, no volverá a mostrarse.",copy:"Copiar",copied:"Enlace copiado",native:"Compartir desde mi teléfono",active:"Invitaciones creadas",limit:"Hasta 3 invitaciones activas por libro.",back:"Volver a mis creaciones",activeState:"Activa",expired:"Caducada",revoked:"Desactivada",views:"apertura(s)",until:"Hasta",revoke:"Desactivar",empty:"Todavía no hay invitaciones para este libro.",loadError:"No se pueden cargar las invitaciones.",createError:"No se puede crear el enlace familiar.",shareText:"Te invito a descubrir nuestro libro interactivo Calitiki."},
  en: { eyebrow:"PRIVATE FAMILY SHARING",title:"Invite your family to discover this book",intro:"They can open the reader directly without creating an account. The link is private, temporary and revocable.",privacy:"An invitation gives access to this book only. Photos and all other creations stay private.",duration:"Link duration",seven:"7 days",thirty:"30 days",create:"Create a family link",ready:"Your private link is ready",once:"Copy it now: for security, it will not be displayed again.",copy:"Copy",copied:"Link copied",native:"Share from my phone",active:"Created invitations",limit:"Up to 3 active invitations per book.",back:"Back to my creations",activeState:"Active",expired:"Expired",revoked:"Disabled",views:"opening(s)",until:"Until",revoke:"Disable",empty:"No invitations have been created for this book.",loadError:"Unable to load invitations.",createError:"Unable to create the family link.",shareText:"I invite you to discover our interactive Calitiki book."},
};

const projectId = String(new URLSearchParams(location.search).get("project") || "").trim();
let copy = COPY.fr;
let shares = [];

function localeFrom(project) {
  const raw = String(project?.finalBlueprint?.language || project?.locale || navigator.language || "fr").toLowerCase();
  return raw.startsWith("es") ? "es" : raw.startsWith("en") ? "en" : "fr";
}

function applyCopy() {
  document.documentElement.lang = copy === COPY.es ? "es" : copy === COPY.en ? "en" : "fr";
  ["eyebrow","title","intro","privacy","duration","ready","once","activeTitle","limit"].forEach((key) => { elements[key].textContent = copy[key === "activeTitle" ? "active" : key]; });
  elements.seven.textContent = copy.seven; elements.thirty.textContent = copy.thirty; elements.create.textContent = copy.create;
  elements.copy.textContent = copy.copy; elements.nativeShare.textContent = copy.native; elements.back.textContent = copy.back;
}

function formatDate(value) { return new Intl.DateTimeFormat(document.documentElement.lang, { dateStyle:"medium" }).format(new Date(value)); }

function renderList() {
  elements.list.replaceChildren();
  if (!shares.length) { const empty=document.createElement("p"); empty.className="empty"; empty.textContent=copy.empty; elements.list.append(empty); return; }
  shares.forEach((share) => {
    const item=document.createElement("article"); item.className=`share-item${share.active ? "" : " is-inactive"}`;
    const info=document.createElement("div"); const state=document.createElement("strong");
    state.textContent=share.revokedAt ? copy.revoked : share.active ? copy.activeState : copy.expired;
    const detail=document.createElement("p"); detail.textContent=`${copy.until} ${formatDate(share.expiresAt)} · ${share.accessCount || 0} ${copy.views}`;
    const created=document.createElement("small"); created.textContent=formatDate(share.createdAt); info.append(state,detail,created); item.append(info);
    if (share.active) { const button=document.createElement("button"); button.type="button"; button.textContent=copy.revoke; button.addEventListener("click",()=>revokeShare(share.id,button)); item.append(button); }
    elements.list.append(item);
  });
}

async function request(url, options={}) {
  const response=await fetch(url,{...options,headers:{"Content-Type":"application/json",...(options.headers||{})},cache:"no-store"});
  const payload=await response.json().catch(()=>({}));
  if (!response.ok) { const error=new Error(payload.error||`HTTP ${response.status}`); error.status=response.status; throw error; }
  return payload;
}

async function load() {
  if (!/^[A-Za-z0-9-]{6,128}$/.test(projectId)) throw new Error("Invalid project");
  const [projectPayload,sharePayload]=await Promise.all([request(`/api/projects/${encodeURIComponent(projectId)}`),request(`/api/projects/${encodeURIComponent(projectId)}/family-shares`)]);
  copy=COPY[localeFrom(projectPayload.project)]||COPY.fr; applyCopy(); shares=sharePayload.shares||[]; renderList();
  elements.loading.hidden=true; elements.app.hidden=false;
}

async function createShare() {
  elements.create.disabled=true; elements.status.textContent="";
  try {
    const payload=await request(`/api/projects/${encodeURIComponent(projectId)}/family-shares`,{method:"POST",body:JSON.stringify({expiresInDays:Number(elements.expiry.value)})});
    elements.url.value=payload.shareUrl; elements.fresh.hidden=false; shares.unshift(payload.share); renderList();
    elements.nativeShare.hidden=!("share" in navigator); elements.url.focus(); elements.url.select();
  } catch(error) { elements.status.textContent=error.message||copy.createError; }
  finally { elements.create.disabled=false; }
}

async function revokeShare(id,button) {
  button.disabled=true;
  try { const payload=await request(`/api/projects/${encodeURIComponent(projectId)}/family-shares/${encodeURIComponent(id)}`,{method:"DELETE"}); shares=shares.map((item)=>item.id===id?payload.share:item); renderList(); }
  catch(error) { elements.status.textContent=error.message; button.disabled=false; }
}

elements.create.addEventListener("click",createShare);
elements.copy.addEventListener("click",async()=>{ await navigator.clipboard.writeText(elements.url.value); elements.status.textContent=copy.copied; });
elements.nativeShare.addEventListener("click",async()=>{ if (navigator.share) await navigator.share({title:"Calitiki",text:copy.shareText,url:elements.url.value}); });

load().catch((error)=>{ elements.loading.textContent=error.status===401?"Reconnectez-vous à Calitiki pour gérer ce partage.":copy.loadError; console.error(error); });

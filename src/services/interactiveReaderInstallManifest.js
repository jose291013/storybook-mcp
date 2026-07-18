const SAFE_PROJECT_ID = /^[A-Za-z0-9_-]{6,128}$/;

export function interactiveReaderInstallManifest({ projectId = "", language = "fr" } = {}) {
  const safeProjectId = SAFE_PROJECT_ID.test(String(projectId).trim()) ? String(projectId).trim() : "";
  const safeLanguage = ["fr", "es", "en"].includes(String(language).toLowerCase().split("-")[0])
    ? String(language).toLowerCase().split("-")[0]
    : "fr";
  const startParams = new URLSearchParams({ source: "installed" });
  if (safeProjectId) startParams.set("project", safeProjectId);

  return {
    name: "Calitiki — Livres interactifs",
    short_name: "Calitiki",
    id: "./",
    description: "Écouter, imaginer et découvrir les histoires Calitiki.",
    lang: safeLanguage,
    start_url: `./?${startParams.toString()}`,
    scope: "./",
    display: "standalone",
    orientation: "portrait",
    background_color: "#102f35",
    theme_color: "#102f35",
    icons: [
      { src: "./icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "./icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  };
}

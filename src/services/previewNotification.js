import crypto from "crypto";

function endpointUrl() {
  const configured = process.env.WOOCOMMERCE_BRIDGE_URL;
  if (!configured) return "";
  const url = new URL(configured);
  url.pathname = "/";
  url.search = "";
  url.searchParams.set("calitiki_preview_ready", "1");
  return url.toString();
}

export async function notifyPreviewReady({ project, identity }) {
  const endpoint = endpointUrl();
  const secret = process.env.WOOCOMMERCE_BRIDGE_SECRET || "";
  if (!endpoint || secret.length < 32) throw new Error("WooCommerce preview notification is not configured");
  const baseUrl = String(process.env.BASE_URL || "").replace(/\/$/, "");
  const body = JSON.stringify({
    projectId: project.id,
    generationId: project.generationJobId || "",
    wooCustomerId: String(identity.wooCustomerId),
    title: project.finalBlueprint?.cover?.title || project.title || "Calitiki",
    locale: project.locale || "FR",
    readyUrl: `${baseUrl}/api/auth/woocommerce/project?projectId=${encodeURIComponent(project.id)}`,
  });
  const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Calitiki-Signature": signature },
      body,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`WooCommerce preview notification returned ${response.status}`);
    return response.json().catch(() => ({ sent: true }));
  } finally {
    clearTimeout(timeout);
  }
}

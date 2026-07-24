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

function milestoneEndpointUrl() {
  const configured = process.env.WOOCOMMERCE_BRIDGE_URL;
  if (!configured) return "";
  const url = new URL(configured);
  url.pathname = "/";
  url.search = "";
  url.searchParams.set("calitiki_preview_event", "1");
  return url.toString();
}

async function postNotification({ endpoint, body }) {
  const secret = process.env.WOOCOMMERCE_BRIDGE_SECRET || "";
  if (!endpoint || secret.length < 32) throw new Error("WooCommerce preview notification is not configured");
  const serialized = JSON.stringify(body);
  const signature = crypto.createHmac("sha256", secret).update(serialized).digest("hex");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Calitiki-Signature": signature },
      body: serialized,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.success !== true) {
      throw new Error(`WooCommerce preview notification returned ${response.status}`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function sharedPayload({ project, identity }) {
  const baseUrl = String(process.env.BASE_URL || "").replace(/\/$/, "");
  return {
    projectId: project.id,
    generationId: project.generationJobId || "",
    wooCustomerId: String(identity.wooCustomerId),
    title: project.finalBlueprint?.cover?.title || project.title || "Calitiki",
    locale: project.locale || "FR",
    readyUrl: `${baseUrl}/api/auth/woocommerce/project?projectId=${encodeURIComponent(project.id)}`,
  };
}

export async function notifyPreviewReady({ project, identity }) {
  return postNotification({
    endpoint: endpointUrl(),
    body: sharedPayload({ project, identity }),
  });
}

export async function notifyPreviewMilestone({
  project,
  identity,
  event,
  eventId,
  retryAvailable = false,
}) {
  if (!["cover_ready", "generation_failed"].includes(event)) {
    throw new Error("Unsupported preview notification event");
  }
  return postNotification({
    endpoint: milestoneEndpointUrl(),
    body: {
      ...sharedPayload({ project, identity }),
      event,
      eventId: String(eventId || ""),
      retryAvailable: retryAvailable === true,
    },
  });
}

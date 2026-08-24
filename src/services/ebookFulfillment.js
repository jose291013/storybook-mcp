import { createEbookPdfBuffer } from "./createEbookPdf.js";
import { createDeliveryUrl } from "./deliveryToken.js";
import { commerceOrderStore } from "./commerceOrderStore.js";
import { getDeliveryStorage } from "./deliveryStorage.js";
import { projectStore } from "./projectStore.js";
import { normalizePageCount } from "../config/bookOptions.js";
import { logMemory } from "./runtimeMemory.js";
import { storageBodyToBuffer } from "./previewAssetStorage.js";
import { existingBookProductContract } from "./bookProductContract.js";

export const EBOOK_LAYOUT_ID = "digital-v3-format-v1";

function usesCurrentEbookLayout(record) {
  return String(record?.storageKey || "").endsWith(`/book-${EBOOK_LAYOUT_ID}.pdf`);
}

function deliveryIdentity({ orderId, projectId, productType = "ebook", wooCustomerId = "" }) {
  return { orderId: String(orderId), projectId: String(projectId), productType, wooCustomerId: String(wooCustomerId) };
}

function readyPayload(record, options = {}) {
  const expiresInSeconds = Math.max(60, Number(options.expiresInSeconds || Number(process.env.EBOOK_LINK_DAYS || 7) * 86400));
  return {
    status: record.fulfillmentStatus,
    productType: record.productType,
    filename: record.downloadFilename,
    layoutId: EBOOK_LAYOUT_ID,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    downloadUrl: createDeliveryUrl({
      projectId: record.projectId, orderId: record.orderId, customerId: record.wooCustomerId, storageKey: record.storageKey,
    }, { expiresInSeconds, ...options }),
  };
}

function generatingPayload(record) {
  return { status: "generating", productType: record.productType, retryAfterSeconds: 300 };
}

export async function fulfillPaidBookOrder(input, dependencies = {}) {
  const projects = dependencies.projectStore || projectStore;
  const orders = dependencies.commerceOrderStore || commerceOrderStore;
  const identity = { wooCustomerId: String(input.wooCustomerId), email: String(input.email || "") };
  const project = await projects.getForCustomer(String(input.projectId), identity);
  if (!project) throw new Error("Purchased project not found for this customer");
  if (!project.previewResult || !["preview_ready", "purchased"].includes(project.status)) throw new Error("A completed preview is required before fulfillment");

  const productType = String(input.productType || "").toLowerCase();
  if (!['ebook', 'print'].includes(productType)) throw new Error("Invalid purchased product type");
  const expectedPageCount = normalizePageCount(project.questionnaire?.page_count || project.productConfiguration?.page_count || project.productConfiguration?.pageCount || 24);
  if (Number(input.pageCount) !== expectedPageCount) throw new Error("Purchased page count does not match the personalized project");
  const productContract = existingBookProductContract(project);
  if (input.bookFormatId && String(input.bookFormatId) !== productContract.bookFormatId) {
    throw new Error("Purchased book format does not match the personalized project");
  }
  if (input.pricingVersion && String(input.pricingVersion) !== productContract.pricingVersion) {
    throw new Error("Purchased pricing version does not match the personalized project");
  }
  const record = await orders.recordPaid({
    orderId: String(input.orderId), projectId: project.id, customerId: project.customerId, wooCustomerId: identity.wooCustomerId,
    productType, pageCount: expectedPageCount, orderTotalCents: Math.max(0, Math.round(Number(input.orderTotalCents || 0))),
  });
  await projects.update(project.id, { status: "purchased", expiresAt: null });
  if (productType !== "ebook") return { status: "paid", productType };
  const storage = dependencies.deliveryStorage || getDeliveryStorage();
  if (record.fulfillmentStatus === "ready" && record.storageKey && usesCurrentEbookLayout(record)) {
    return readyPayload(record, dependencies.deliveryUrlOptions);
  }

  const key = `ebooks/${project.id}/${String(input.orderId)}/book-${EBOOK_LAYOUT_ID}.pdf`;
  const filename = `calitiki-ebook-${project.id.slice(0, 8)}.pdf`;
  const orderIdentity = deliveryIdentity({ orderId: input.orderId, projectId: project.id, productType, wooCustomerId: identity.wooCustomerId });
  const claimed = await orders.claimDelivery(orderIdentity, {
    staleAfterMs: dependencies.staleAfterMs,
    allowReady: record.fulfillmentStatus === "ready" && !usesCurrentEbookLayout(record),
  });
  if (!claimed) return generatingPayload(record);
  logMemory("ebook.start", { orderId: String(input.orderId), pageCount: expectedPageCount });
  try {
    const pdf = await createEbookPdfBuffer({
      title: project.title || project.finalBlueprint?.cover?.title || "Calitiki",
      language: project.finalBlueprint?.language || project.questionnaire?.language || project.locale || "FR",
      coverPreviewUrl: project.previewResult.coverPreviewUrl,
      coverStorageKey: project.previewResult.coverStorageKey || "",
      pages: project.previewResult.draftPages || [],
      bookFormat: project.finalBlueprint?.format,
      outputsDir: dependencies.outputsDir || "data/outputs",
      loadAsset: async (asset) => {
        if (!asset.storageKey) return null;
        const storedAsset = await storage.get(asset.storageKey);
        return storageBodyToBuffer(storedAsset.body);
      },
      onProgress: async ({ completed, total }) => {
        if (completed === 1 || completed === total || completed % 4 === 0) {
          await orders.updateDelivery(orderIdentity, { fulfillmentStatus: "generating" });
          logMemory("ebook.page", { orderId: String(input.orderId), completed, total });
        }
      },
    });
    logMemory("ebook.pdf-ready", { orderId: String(input.orderId), pdfMb: Math.round((pdf.length / 1024 / 1024) * 10) / 10 });
    await storage.put({ key, body: pdf, contentType: "application/pdf" });
    const ready = await orders.updateDelivery(orderIdentity, {
      fulfillmentStatus: "ready", storageKey: key, downloadFilename: filename, deliveryError: "", readyAt: new Date().toISOString(),
    });
    logMemory("ebook.stored", { orderId: String(input.orderId) });
    return readyPayload(ready, dependencies.deliveryUrlOptions);
  } catch (error) {
    logMemory("ebook.failed", { orderId: String(input.orderId), error: String(error?.message || error).slice(0, 160) });
    await orders.updateDelivery(orderIdentity, { fulfillmentStatus: "failed", deliveryError: String(error?.message || error) }).catch(() => null);
    throw error;
  }
}

export async function freshEbookDeliveryLink(input, dependencies = {}) {
  const orders = dependencies.commerceOrderStore || commerceOrderStore;
  const record = await orders.findForCustomer({
    orderId: String(input.orderId), projectId: String(input.projectId), wooCustomerId: String(input.wooCustomerId), productType: "ebook",
  });
  if (!record || record.paymentStatus !== "paid") return null;
  if (record.fulfillmentStatus === "ready" && record.storageKey && usesCurrentEbookLayout(record)) {
    return readyPayload(record, dependencies.deliveryUrlOptions);
  }
  const sourceAssetsMissing = /Input file is missing|ENOENT|no such file/i.test(String(record.deliveryError || ""));
  const shouldBuild = (record.fulfillmentStatus === "ready" && !usesCurrentEbookLayout(record))
    || record.fulfillmentStatus === "queued"
    || (record.fulfillmentStatus === "failed" && !sourceAssetsMissing);
  if (shouldBuild) {
    setImmediate(() => {
      fulfillPaidBookOrder({
        orderId: record.orderId,
        projectId: record.projectId,
        productType: "ebook",
        pageCount: record.pageCount,
        bookFormatId: record.bookFormatId || "",
        pricingVersion: record.pricingVersion || "",
        orderTotalCents: record.orderTotalCents,
        wooCustomerId: record.wooCustomerId,
        email: "",
      }, dependencies).catch((error) => {
        logMemory("ebook.background-failed", { orderId: record.orderId, error: String(error?.message || error).slice(0, 160) });
      });
    });
    return generatingPayload(record);
  }
  return {
    status: record.fulfillmentStatus || "queued",
    productType: record.productType,
    retryAfterSeconds: 300,
    errorCode: sourceAssetsMissing ? "preview_assets_missing" : "",
  };
}

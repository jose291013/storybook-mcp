export const PREVIEW_MODIFICATION_PRICE_CENTS = Object.freeze({
  text: 50,
  illustration: 100,
  both: 150,
});

export function previewModificationPriceCents(scope) {
  const normalized = String(scope || "").trim().toLowerCase();
  const price = PREVIEW_MODIFICATION_PRICE_CENTS[normalized];
  if (!price) throw new Error("Unsupported preview modification scope");
  return price;
}

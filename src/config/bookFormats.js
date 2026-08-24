export const BOOK_FORMAT_CONTRACT_VERSION = 1;
export const LEGACY_BOOK_FORMAT_ID = "square_21";

export const BOOK_FORMATS = Object.freeze([
  Object.freeze({
    id: LEGACY_BOOK_FORMAT_ID,
    trim: "SQUARE_21",
    label: "21 × 21 cm",
    widthMm: 210,
    heightMm: 210,
    bleedMm: 3,
    layoutFamily: "square",
    imageSize: "1024x1024",
    wooSlug: "carre-21",
  }),
  Object.freeze({
    id: "portrait_17x24",
    trim: "PORTRAIT_17X24",
    label: "17 × 24 cm",
    widthMm: 170,
    heightMm: 240,
    bleedMm: 3,
    layoutFamily: "portrait",
    imageSize: "1024x1536",
    wooSlug: "portrait-17x24",
  }),
  Object.freeze({
    id: "portrait_21x29_7",
    trim: "PORTRAIT_21X29_7",
    label: "21 × 29,7 cm",
    widthMm: 210,
    heightMm: 297,
    bleedMm: 3,
    layoutFamily: "portrait",
    imageSize: "1024x1536",
    wooSlug: "portrait-21x29-7",
  }),
]);

export function bookFormatV1Enabled(env = process.env) {
  return String(env.BOOK_FORMAT_V1_ENABLED || "").trim().toLowerCase() === "true";
}
export function findBookFormat(value, { allowDisabled = true, env = process.env } = {}) {
  const requested = String(value || "").trim().toLowerCase();
  const selected = BOOK_FORMATS.find((format) => format.id === requested) || BOOK_FORMATS[0];
  return allowDisabled || bookFormatV1Enabled(env) || selected.id === LEGACY_BOOK_FORMAT_ID
    ? selected
    : BOOK_FORMATS[0];
}

export function availableBookFormats(env = process.env) {
  return bookFormatV1Enabled(env) ? BOOK_FORMATS : [BOOK_FORMATS[0]];
}

export function publicBookFormat(format) {
  const selected = findBookFormat(format?.id || format);
  return {
    version: BOOK_FORMAT_CONTRACT_VERSION,
    id: selected.id,
    trim: selected.trim,
    label: selected.label,
    widthMm: selected.widthMm,
    heightMm: selected.heightMm,
    bleedMm: selected.bleedMm,
    layoutFamily: selected.layoutFamily,
  };
}

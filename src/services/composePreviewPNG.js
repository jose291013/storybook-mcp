// src/services/composePreviewPNG.js
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

const PAPER_MM = {
  A5: { w: 148, h: 210 },
  A4: { w: 210, h: 297 },
};

function mmToPx(mm, dpi) {
  // 1 inch = 25.4 mm
  return Math.round((mm / 25.4) * dpi);
}

function escapeXml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Compose a print-like preview PNG with exact A5/A4 ratio.
 * - White page
 * - Safe margin & text area
 * - Illustration placed as "full-bleed-ish" inside safe area (or top block)
 * - Clean typography (SVG overlay)
 */
export async function composePreviewPNG({
  baseUrl,
  imageUrl,
  title = "",
  body = "",
  outName,
  paper = "A5",     // "A5" | "A4"
  dpi = 150,        // 150/200/300
  layout = "page",  // "cover" | "page"
  outputsDir = "data/outputs",
}) {
  if (!baseUrl) throw new Error("composePreviewPNG: missing baseUrl");
  if (!imageUrl) throw new Error("composePreviewPNG: missing imageUrl");
  if (!outName) throw new Error("composePreviewPNG: missing outName");
  const paperDef = PAPER_MM[paper] || PAPER_MM.A5;
const { w, h } = paperDef;
  const width = mmToPx(w, dpi);
  const height = mmToPx(h, dpi);

  // Layout in mm (print-like)
  const marginMm = 10;         // safe margin
  const gutterMm = 0;          // can be >0 later for binding
  const marginPx = mmToPx(marginMm, dpi);
  const gutterPx = mmToPx(gutterMm, dpi);

  const safeLeft = marginPx + gutterPx;
  const safeRight = width - marginPx;
  const safeTop = marginPx;
  const safeBottom = height - marginPx;

  const safeW = safeRight - safeLeft;
  const safeH = safeBottom - safeTop;

  // Fetch image
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`composePreviewPNG: failed to fetch image (${imgRes.status})`);
  const imgBuf = Buffer.from(await imgRes.arrayBuffer());

  // Decide blocks
  // Cover: image occupies most of safe area, title at top (optional)
  // Page: image top ~60%, text bottom ~40%
  const titleBlockH = title ? Math.round(safeH * (layout === "cover" ? 0.12 : 0.10)) : 0;
  const textBlockH = body ? Math.round(safeH * (layout === "cover" ? 0.0 : 0.35)) : 0;

  const imageBlockTop = safeTop + titleBlockH;
  const imageBlockH = safeH - titleBlockH - textBlockH;
  const imageBlockW = safeW;

  // Resize illustration to fit image block
  const resizedImg = await sharp(imgBuf)
    .resize(imageBlockW, imageBlockH, { fit: "contain" })
    .png()
    .toBuffer();

  const imgMeta = await sharp(resizedImg).metadata();
  const imgW = imgMeta.width || imageBlockW;
  const imgH = imgMeta.height || imageBlockH;
  const imgLeft = safeLeft + Math.round((imageBlockW - imgW) / 2);
  const imgTop = imageBlockTop + Math.round((imageBlockH - imgH) / 2);

  // Typography sizes (scale with DPI)
  const titleFont = Math.round((paper === "A5" ? 28 : 34) * (dpi / 150));
  const bodyFont = Math.round((paper === "A5" ? 20 : 24) * (dpi / 150));
  const lineHeight = Math.round(bodyFont * 1.25);

  // Title SVG (within safe area)
  const titleSvg = title
    ? `
<svg width="${width}" height="${height}">
  <text x="${safeLeft}" y="${safeTop + Math.round(titleBlockH * 0.75)}"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${titleFont}"
        font-weight="800"
        fill="#111">${escapeXml(title)}</text>
</svg>`
    : "";

  // Body SVG (bottom text area), with simple wrapping via foreignObject
  const bodySvg = body && layout !== "cover"
    ? `
<svg width="${width}" height="${height}">
  <foreignObject x="${safeLeft}" y="${safeBottom - textBlockH + Math.round(lineHeight * 0.1)}"
                 width="${safeW}" height="${textBlockH}">
    <div xmlns="http://www.w3.org/1999/xhtml"
         style="
           font-family: Arial, Helvetica, sans-serif;
           font-size: ${bodyFont}px;
           line-height: ${lineHeight}px;
           font-weight: 600;
           color: #111;
           white-space: normal;
         ">
      ${escapeXml(body)}
    </div>
  </foreignObject>
</svg>`
    : "";

  // Base canvas
  const canvas = sharp({
    create: { width, height, channels: 4, background: "#ffffff" },
  });

  const composites = [];

  // Optional: draw a faint safe-area guide (disabled by default)
  // (If you want it: create an SVG rect and composite it.)

  // Title
  if (titleSvg) composites.push({ input: Buffer.from(titleSvg), top: 0, left: 0 });

  // Image
  composites.push({ input: resizedImg, top: imgTop, left: imgLeft });

  // Body
  if (bodySvg) composites.push({ input: Buffer.from(bodySvg), top: 0, left: 0 });

  const outBuf = await canvas.composite(composites).png().toBuffer();

  await fs.mkdir(outputsDir, { recursive: true });
  const filename = `${outName}.png`;
  const outPath = path.join(outputsDir, filename);
  await fs.writeFile(outPath, outBuf);

  return `${baseUrl}/outputs/${filename}`;
}

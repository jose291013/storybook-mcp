import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

function mmToPx(mm, dpi) {
  return Math.round((mm / 25.4) * dpi);
}
function escapeXml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wrapText(text, maxChars) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars) line = candidate;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function textSvg({ width, height, title, body, pageType, pageNumber }) {
  const isOpening = pageType === "opening_text";
  const isClosing = pageType === "closing_text";
  const fontSize = Math.round(width * (isOpening || isClosing ? 0.046 : 0.038));
  const titleSize = Math.round(width * 0.065);
  const lineHeight = Math.round(fontSize * 1.5);
  const lines = wrapText(body, isOpening || isClosing ? 34 : 42).slice(0, 14);
  const blockHeight = Math.max(lineHeight, lines.length * lineHeight);
  const startY = Math.round((height - blockHeight) / 2);
  const textLines = lines.map((line, index) =>
    `<tspan x="${Math.round(width / 2)}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
  ).join("");

  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="#fff8ed"/>
      <circle cx="${Math.round(width * 0.1)}" cy="${Math.round(height * 0.12)}" r="${Math.round(width * 0.035)}" fill="#f8d9b6" opacity="0.75"/>
      <circle cx="${Math.round(width * 0.9)}" cy="${Math.round(height * 0.84)}" r="${Math.round(width * 0.05)}" fill="#cfe7df" opacity="0.75"/>
      ${title ? `<text x="${Math.round(width / 2)}" y="${Math.round(height * 0.22)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${titleSize}" font-weight="700" fill="#3d4a4f">${escapeXml(title)}</text>` : ""}
      <text x="${Math.round(width / 2)}" y="${startY}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="500" fill="#34454c">${textLines}</text>
      <text x="${Math.round(width * 0.92)}" y="${Math.round(height * 0.94)}" text-anchor="end" font-family="Arial, sans-serif" font-size="${Math.round(width * 0.022)}" fill="#7b898d">${pageNumber || ""}</text>
    </svg>`);
}

function coverOverlaySvg({ width, height, title }) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#000" stop-opacity="0.38"/>
          <stop offset="55%" stop-color="#000" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="48%" fill="url(#shade)"/>
      <text x="${Math.round(width / 2)}" y="${Math.round(height * 0.14)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${Math.round(width * 0.07)}" font-weight="800" fill="#fff">${escapeXml(title)}</text>
    </svg>`);
}

export async function composeBookPagePNG({
  baseUrl,
  imageUrl = "",
  title = "",
  body = "",
  outName,
  pageType = "image",
  pageNumber,
  dpi = 150,
  outputsDir = "data/outputs",
}) {
  if (!baseUrl) throw new Error("composeBookPagePNG: missing baseUrl");
  if (!outName) throw new Error("composeBookPagePNG: missing outName");

  const width = mmToPx(210, dpi);
  const height = width;
  let output;

  if (["text", "opening_text", "closing_text"].includes(pageType)) {
    output = await sharp(textSvg({ width, height, title, body, pageType, pageNumber })).png().toBuffer();
  } else {
    if (!imageUrl) throw new Error(`composeBookPagePNG: ${pageType} requires imageUrl`);
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`composeBookPagePNG: failed to fetch image (${response.status})`);
    const imageBuffer = Buffer.from(await response.arrayBuffer());
    const canvas = sharp(imageBuffer).resize(width, height, { fit: "cover", position: "attention" });
    output = pageType === "cover"
      ? await canvas.composite([{ input: coverOverlaySvg({ width, height, title }), top: 0, left: 0 }]).png().toBuffer()
      : await canvas.png().toBuffer();
  }

  await fs.mkdir(outputsDir, { recursive: true });
  const filename = `${outName}.png`;
  await fs.writeFile(path.join(outputsDir, filename), output);
  return `${baseUrl}/outputs/${filename}`;
}

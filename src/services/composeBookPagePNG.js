import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

const BODY_FONT = path.resolve("assets/fonts/Andika-Regular.ttf");
const TITLE_FONT = path.resolve("assets/fonts/PatrickHand-Regular.ttf");
const FONT_STYLES = {
  school_round: { fontFile: BODY_FONT, fontFamily: "Andika", sizeMultiplier: 1 },
  handwritten_story: { fontFile: TITLE_FONT, fontFamily: "Patrick Hand", sizeMultiplier: 1.08 },
};

function mmToPx(mm, dpi) {
  return Math.round((mm / 25.4) * dpi);
}

function escapeMarkup(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function renderText({ text, fontFile, fontFamily, fontSize, width, height, color, align = "centre" }) {
  const input = await sharp({
    text: {
      text: `<span foreground="${color}">${escapeMarkup(text)}</span>`,
      font: `${fontFamily} ${fontSize}`,
      fontfile: fontFile,
      width,
      height,
      align,
      rgba: true,
    },
  }).png().toBuffer();
  const metadata = await sharp(input).metadata();
  return { input, width: metadata.width || width, height: metadata.height || height };
}

function pageDecorSvg(width, height) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <circle cx="${Math.round(width * 0.1)}" cy="${Math.round(height * 0.12)}" r="${Math.round(width * 0.035)}" fill="#f8d9b6" opacity="0.75"/>
      <circle cx="${Math.round(width * 0.9)}" cy="${Math.round(height * 0.84)}" r="${Math.round(width * 0.05)}" fill="#cfe7df" opacity="0.75"/>
      <path d="M ${Math.round(width * 0.82)} ${Math.round(height * 0.13)} q ${Math.round(width * 0.035)} ${Math.round(height * -0.045)} ${Math.round(width * 0.07)} 0 q ${Math.round(width * -0.035)} ${Math.round(height * 0.045)} ${Math.round(width * -0.07)} 0" fill="none" stroke="#e7b9a8" stroke-width="${Math.max(2, Math.round(width * 0.003))}" stroke-linecap="round"/>
    </svg>`);
}

function coverShadeSvg(width, height) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#000" stop-opacity="0.52"/>
          <stop offset="65%" stop-color="#000" stop-opacity="0.08"/>
          <stop offset="100%" stop-color="#000" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="52%" fill="url(#shade)"/>
    </svg>`);
}

async function composeTextPage({ width, height, title, body, pageType, fontStyle }) {
  const isOpening = pageType === "opening_text";
  const isClosing = pageType === "closing_text";
  const canvas = sharp({ create: { width, height, channels: 4, background: "#fff8ed" } });
  const composites = [{ input: pageDecorSvg(width, height), top: 0, left: 0 }];

  if (title) {
    const titleLayer = await renderText({
      text: title,
      fontFile: TITLE_FONT,
      fontFamily: "Patrick Hand",
      fontSize: Math.round(width * 0.043),
      width: Math.round(width * 0.76),
      height: Math.round(height * 0.18),
      color: "#3d4a4f",
    });
    composites.push({ input: titleLayer.input, top: Math.round(height * 0.13), left: Math.round((width - titleLayer.width) / 2) });
  }

  const selectedFont = FONT_STYLES[fontStyle] || FONT_STYLES.school_round;
  const bodyLayer = await renderText({
    text: body,
    fontFile: selectedFont.fontFile,
    fontFamily: selectedFont.fontFamily,
    fontSize: Math.round(width * (isOpening || isClosing ? 0.031 : 0.026) * selectedFont.sizeMultiplier),
    width: Math.round(width * 0.78),
    height: Math.round(height * (title ? 0.56 : 0.68)),
    color: "#34454c",
  });
  const bodyTop = Math.max(
    Math.round(height * (title ? 0.32 : 0.16)),
    Math.round((height - bodyLayer.height) / 2)
  );
  composites.push({ input: bodyLayer.input, top: bodyTop, left: Math.round((width - bodyLayer.width) / 2) });

  return canvas.composite(composites).png().toBuffer();
}

async function composeCover({ imageBuffer, width, height, title }) {
  const titleLayer = await renderText({
    text: title,
    fontFile: TITLE_FONT,
    fontFamily: "Patrick Hand",
    fontSize: Math.round(width * 0.052),
    width: Math.round(width * 0.8),
    height: Math.round(height * 0.34),
    color: "#ffffff",
  });
  const titleTop = Math.max(Math.round(height * 0.06), Math.round(height * 0.23 - titleLayer.height / 2));

  return sharp(imageBuffer)
    .resize(width, height, { fit: "cover", position: "attention" })
    .composite([
      { input: coverShadeSvg(width, height), top: 0, left: 0 },
      { input: titleLayer.input, top: titleTop, left: Math.round((width - titleLayer.width) / 2) },
    ])
    .png()
    .toBuffer();
}

export async function composeBookPagePNG({
  baseUrl,
  imageUrl = "",
  title = "",
  body = "",
  outName,
  pageType = "image",
  pageNumber,
  fontStyle = "school_round",
  dpi = 150,
  outputsDir = "data/outputs",
}) {
  if (!baseUrl) throw new Error("composeBookPagePNG: missing baseUrl");
  if (!outName) throw new Error("composeBookPagePNG: missing outName");

  const width = mmToPx(210, dpi);
  const height = width;
  let output;

  if (["text", "opening_text", "closing_text"].includes(pageType)) {
    output = await composeTextPage({ width, height, title, body, pageType, fontStyle });
  } else {
    if (!imageUrl) throw new Error(`composeBookPagePNG: ${pageType} requires imageUrl`);
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`composeBookPagePNG: failed to fetch image (${response.status})`);
    const imageBuffer = Buffer.from(await response.arrayBuffer());
    output = pageType === "cover"
      ? await composeCover({ imageBuffer, width, height, title })
      : await sharp(imageBuffer).resize(width, height, { fit: "cover", position: "attention" }).png().toBuffer();
  }

  await fs.mkdir(outputsDir, { recursive: true });
  const filename = `${outName}.png`;
  await fs.writeFile(path.join(outputsDir, filename), output);
  return `${baseUrl}/outputs/${filename}`;
}

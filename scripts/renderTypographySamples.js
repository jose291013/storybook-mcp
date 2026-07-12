import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { composeBookPagePNG } from "../src/services/composeBookPagePNG.js";

const outputsDir = path.resolve(process.argv[2] || "data/outputs");
await fs.mkdir(outputsDir, { recursive: true });

const illustration = await sharp({
  create: { width: 1024, height: 1024, channels: 3, background: "#7da89c" },
})
  .composite([{
    input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
      <circle cx="780" cy="690" r="250" fill="#e99a7e"/>
      <circle cx="260" cy="700" r="190" fill="#f4d9a4"/>
      <path d="M512 340 l25 65 70 3-55 43 18 68-58-38-58 38 18-68-55-43 70-3z" fill="#fff4bd"/>
    </svg>`),
  }])
  .png()
  .toBuffer();
const imageUrl = `data:image/png;base64,${illustration.toString("base64")}`;

await composeBookPagePNG({
  baseUrl: "http://localhost:3000",
  imageUrl,
  title: "Noa et la constellation mystérieuse",
  outName: "typography-cover-sample",
  pageType: "cover",
  dpi: 150,
  outputsDir,
});

await composeBookPagePNG({
  baseUrl: "http://localhost:3000",
  body: "Noa serre sa petite lampe jaune contre son cœur. Dans le jardin, les feuilles frémissent comme si elles chuchotaient un secret. Soudain, une minuscule étoile tombe derrière le vieux pommier. « Tu as vu ça, Pixel ? » souffle Noa. La mascotte remue les oreilles. Ensemble, ils avancent dans l’herbe brillante, sans savoir qu’une drôle de carte céleste les attend sous les racines.",
  outName: "typography-text-sample",
  pageType: "text",
  pageNumber: 7,
  dpi: 150,
  outputsDir,
});

console.log(outputsDir);

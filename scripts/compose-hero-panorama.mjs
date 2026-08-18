import sharp from "sharp";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "public", "assets", "alexey-grishchenko-about-wide.png");
const output = resolve(root, "public", "assets", "alexey-grishchenko-hero-original-v4.png");
const width = 1954;
const height = 805;

const foreground = await sharp(source).resize({ height }).png().toBuffer();
const foregroundMetadata = await sharp(foreground).metadata();
const foregroundWidth = foregroundMetadata.width;

const mask = Buffer.from(`
  <svg width="${foregroundWidth}" height="${height}">
    <defs>
      <linearGradient id="fade" x1="0" x2="1">
        <stop offset="0" stop-color="white" stop-opacity="0" />
        <stop offset="0.26" stop-color="white" stop-opacity="1" />
        <stop offset="1" stop-color="white" stop-opacity="1" />
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#fade)" />
  </svg>
`);

const featheredForeground = await sharp(foreground)
  .composite([{ input: mask, blend: "dest-in" }])
  .png()
  .toBuffer();

const background = await sharp({
  create: {
    width,
    height,
    channels: 3,
    background: { r: 3, g: 7, b: 21 },
  },
})
  .png()
  .toBuffer();

await sharp(background)
  .composite([{ input: featheredForeground, left: width - foregroundWidth, top: 0 }])
  .png()
  .toFile(output);

console.log(JSON.stringify({ output, width, height, foregroundWidth, rightExtension: 0 }));

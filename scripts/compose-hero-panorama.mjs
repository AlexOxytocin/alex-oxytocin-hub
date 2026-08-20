import sharp from "sharp";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "public", "assets", "alexey-original-rgb-cutout.png");
const output = resolve(root, "public", "assets", "alexey-grishchenko-hero-original-colors-v6.png");
const width = 1954;
const height = 805;

const { data: sourceData, info: sourceInfo } = await sharp(source)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

for (let pixel = 0, offset = 3; offset < sourceData.length; pixel += 1, offset += 4) {
  const y = Math.floor(pixel / sourceInfo.width);
  const originalAlpha = sourceData[offset];
  const opaqueAlpha = originalAlpha >= 7 ? 255 : originalAlpha > 0 ? 96 : 0;
  const opacityMix = Math.max(0, Math.min(1, (y - 1200) / 200));
  sourceData[offset] = Math.round(
    originalAlpha + (opaqueAlpha - originalAlpha) * opacityMix
  );
}

const foreground = await sharp(sourceData, {
  raw: {
    width: sourceInfo.width,
    height: sourceInfo.height,
    channels: 4,
  },
})
  .resize({ height })
  .png()
  .toBuffer();
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

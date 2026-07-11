import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const publicImages = path.join(root, "public", "images");
const files = await fs.readdir(publicImages);
const imageCount = files.filter((file) => /\.(jpg|jpeg|png|gif|bmp|tif|tiff|webp)$/i.test(file)).length;

if (imageCount === 0) {
  throw new Error("No survey images found in public/images.");
}

console.log(`Build check passed: ${imageCount} images found.`);

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "README.md",
  "manifest.json",
  "background.js",
  "content.js",
  "options.html",
  "options.js",
  "icons/icon16.png",
  "icons/icon32.png",
  "icons/icon48.png",
  "icons/icon128.png",
];

const archive = new JSZip();
for (const file of files) {
  archive.file(`chrome-extension/${file}`, await readFile(path.join(root, "chrome-extension", file)), {
    date: new Date("2000-01-01T00:00:00Z"),
  });
}

const destination = path.join(root, "public", "downloads", "savers-chrome-extension-1.1.1.zip");
await mkdir(path.dirname(destination), { recursive: true });
await writeFile(destination, await archive.generateAsync({
  type: "nodebuffer",
  compression: "DEFLATE",
  compressionOptions: { level: 9 },
}));
console.log(`Wrote ${path.relative(root, destination)}`);

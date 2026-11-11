import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const archive = new JSZip();
for (const name of ["manifest.json", "background.js", "content.js", "README.md"]) {
  archive.file(`savers-rebuild-capture/${name}`, await readFile(path.join(root, "chrome-extension", "rebuild-capture", name)));
}
for (const name of ["icon16.png", "icon32.png", "icon48.png", "icon128.png"]) {
  archive.file(`savers-rebuild-capture/icons/${name}`, await readFile(path.join(root, "chrome-extension", "rebuild-capture", "icons", name)));
}
const destination = path.join(root, "public", "downloads", "savers-rebuild-capture-0.2.1.zip");
await mkdir(path.dirname(destination), { recursive: true });
await writeFile(destination, await archive.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } }));
console.log(`Wrote ${path.relative(root, destination)}`);

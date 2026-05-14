import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const sourcePath = path.join(repoRoot, "shared", "save-surface-theme.css");
const source = fs.readFileSync(sourcePath, "utf8");

for (const relativeTarget of [
  path.join("public", "save-surface-theme.css"),
  path.join("chrome-extension", "save-surface-theme.css"),
]) {
  const targetPath = path.join(repoRoot, relativeTarget);
  fs.writeFileSync(
    targetPath,
    `/* Generated from shared/save-surface-theme.css */\n${source}`,
    "utf8",
  );
}

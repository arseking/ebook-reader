import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [readme, packageText] = await Promise.all([
  readFile(new URL("../README.md", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8")
]);
const scripts = JSON.parse(packageText).scripts;

test("README documents the working development and production commands", () => {
  assert.match(readme, /npm ci/);
  assert.match(readme, new RegExp(`npm run dev`));
  assert.match(readme, new RegExp(`npm run build`));
  assert.match(readme, new RegExp(`npm start`));
  assert.ok(scripts.dev && scripts.build && scripts.start);
});

test("README explains Windows packaging and where the unpacked app is written", () => {
  assert.match(readme, /npm run dist/);
  assert.match(readme, /release\/win-unpacked\/纸间\.exe/);
  assert.ok(scripts.dist);
});

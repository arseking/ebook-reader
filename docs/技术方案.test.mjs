import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const plan = await readFile(new URL("./技术方案.md", import.meta.url), "utf8");

test("technical plan records the agreed product scope and stack", () => {
  assert.match(plan, /本地离线阅读/);
  assert.match(plan, /Electron/);
  assert.match(plan, /TypeScript \+ Vite/);
  assert.match(plan, /不强制引入 React/);
});

test("technical plan covers local persistence, encoding, and Electron security", () => {
  assert.match(plan, /版本化 JSON 文件/);
  assert.match(plan, /GB18030/);
  assert.match(plan, /contextIsolation/);
  assert.match(plan, /nodeIntegration/);
  assert.match(plan, /不上传书籍正文/);
});

test("technical plan provides implementation steps and tradeoffs", () => {
  assert.match(plan, /实施顺序/);
  assert.match(plan, /Tauri/);
  assert.match(plan, /待确认事项/);
});

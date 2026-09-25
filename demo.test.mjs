import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
import test from "node:test";

const html = await readFile(new URL("./demo.html", import.meta.url), "utf8");
const scriptSource = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];

test("demo provides the core TXT reading controls", () => {
  assert.match(html, /type="file" accept="\.txt,text\/plain"/);
  assert.match(html, /id="pr-continue"/);
  assert.match(html, /id="pr-font-down"/);
  assert.match(html, /id="pr-font-up"/);
  assert.match(html, /id="pr-reading-column"/);
});

test("demo preserves text layout and supports common Chinese encodings", () => {
  assert.match(html, /white-space:\s*pre-wrap/);
  assert.match(html, /overflow-wrap:\s*anywhere/);
  assert.match(scriptSource ?? "", /new TextDecoder\("utf-8", \{ fatal: true \}\)/);
  assert.match(scriptSource ?? "", /new TextDecoder\("gb18030"\)/);
});

test("demo saves reading progress and keeps reader code syntactically valid", () => {
  assert.match(scriptSource ?? "", /localStorage\.setItem\("paper-reader-progress:/);
  assert.match(scriptSource ?? "", /column\.addEventListener\("scroll", saveProgress/);
  assert.ok(scriptSource, "reader script is present");
  assert.doesNotThrow(() => new Script(scriptSource));
});

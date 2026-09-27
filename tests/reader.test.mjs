import assert from "node:assert/strict";
import test from "node:test";
import { clampFontSize, clampProgress, decodeText, decodeTextAutomatically } from "../src/shared/reader.ts";

test("font size stays within the supported reader range", () => {
  assert.equal(clampFontSize(8), 14);
  assert.equal(clampFontSize(100), 28);
  assert.equal(clampFontSize(18.6), 19);
  assert.equal(clampFontSize(Number.NaN), 18);
});

test("reading progress is finite and bounded", () => {
  assert.equal(clampProgress(-1), 0);
  assert.equal(clampProgress(1.5), 1);
  assert.equal(clampProgress(Number.NaN), 0);
});

test("encoding detection strictly accepts UTF-8 and falls back to GB18030", () => {
  assert.deepEqual(decodeTextAutomatically(new TextEncoder().encode("你好，纸间")), { text: "你好，纸间", encoding: "utf-8" });
  const gb18030 = Uint8Array.from([0xc4, 0xe3, 0xba, 0xc3]);
  assert.deepEqual(decodeTextAutomatically(gb18030), { text: "你好", encoding: "gb18030" });
});

test("unsupported bytes can be retried with a user-selected encoding", () => {
  const bytes = Uint8Array.from([0xff, 0xfe, 0x60, 0x4f, 0x7d, 0x59]);
  assert.equal(decodeTextAutomatically(bytes), null);
  assert.equal(decodeText(bytes, "utf-16le"), "你好");
});

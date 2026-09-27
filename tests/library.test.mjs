import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadLibrary, saveLibrary } from "../src/main/library.ts";

test("library data survives an atomic write and reload", async () => {
  const directory = await mkdtemp(join(tmpdir(), "paper-reader-test-"));
  const filePath = join(directory, "library.json");
  try {
    const data = {
      version: 1,
      books: [{ id: "a".repeat(64), path: "C:\\Books\\book.txt", name: "book.txt", size: 42, modifiedAt: 10, lastOpenedAt: 20, progress: 0.42 }],
      preferences: { fontSize: 20 }
    };
    await saveLibrary(filePath, data);
    assert.deepEqual(await loadLibrary(filePath), data);
    assert.deepEqual(await readdir(directory), ["library.json"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("library loading bounds values and tolerates damaged or newer files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "paper-reader-test-"));
  const filePath = join(directory, "library.json");
  try {
    await writeFile(filePath, JSON.stringify({
      version: 1,
      books: [{ id: "b".repeat(64), path: "book.txt", name: "book.txt", size: 1, modifiedAt: 0, lastOpenedAt: 0, progress: 4 }],
      preferences: { fontSize: 99 }
    }));
    const restored = await loadLibrary(filePath);
    assert.equal(restored.books[0].progress, 1);
    assert.equal(restored.preferences.fontSize, 28);
    await writeFile(filePath, "not json");
    assert.deepEqual(await loadLibrary(filePath), { version: 1, books: [], preferences: { fontSize: 18 } });
    await writeFile(filePath, JSON.stringify({ version: 2, books: [], preferences: { fontSize: 20 } }));
    assert.deepEqual(await loadLibrary(filePath), { version: 1, books: [], preferences: { fontSize: 18 } });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

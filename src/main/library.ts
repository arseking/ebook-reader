import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { clampFontSize, clampProgress, DEFAULT_FONT_SIZE } from "../shared/reader.ts";

export interface BookEntry {
  id: string;
  path: string;
  name: string;
  size: number;
  modifiedAt: number;
  lastOpenedAt: number;
  progress: number;
}

export interface LibraryData {
  version: 1;
  books: BookEntry[];
  preferences: { fontSize: number };
}

export function emptyLibrary(): LibraryData {
  return { version: 1, books: [], preferences: { fontSize: DEFAULT_FONT_SIZE } };
}

function validBook(value: unknown): value is BookEntry {
  if (!value || typeof value !== "object") return false;
  const book = value as Partial<BookEntry>;
  return typeof book.id === "string" && typeof book.path === "string" && typeof book.name === "string"
    && Number.isFinite(book.size) && Number.isFinite(book.modifiedAt)
    && Number.isFinite(book.lastOpenedAt) && Number.isFinite(book.progress);
}

export async function loadLibrary(filePath: string): Promise<LibraryData> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
    if (!parsed || typeof parsed !== "object" || (parsed as { version?: unknown }).version !== 1) return emptyLibrary();
    const data = parsed as Partial<LibraryData>;
    return {
      version: 1,
      books: Array.isArray(data.books) ? data.books.filter(validBook).slice(0, 50).map(book => ({ ...book, progress: clampProgress(book.progress) })) : [],
      preferences: { fontSize: clampFontSize(Number(data.preferences?.fontSize)) }
    };
  } catch {
    return emptyLibrary();
  }
}

export async function saveLibrary(filePath: string, data: LibraryData): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, filePath);
  } catch (error) {
    const { rm } = await import("node:fs/promises");
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

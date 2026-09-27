import { app, BrowserWindow, dialog, ipcMain, session } from "electron";
import { createHash, randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { clampFontSize, clampProgress, decodeText, decodeTextAutomatically, type SupportedEncoding } from "./shared/reader";
import { emptyLibrary, loadLibrary, saveLibrary, type BookEntry, type LibraryData } from "./main/library";

const MAX_BOOKS = 50;
const libraryFile = join(app.getPath("userData"), "library.json");
let library: LibraryData = emptyLibrary();
let mainWindow: BrowserWindow | undefined;
let persistTimer: NodeJS.Timeout | undefined;
const pendingEncodings = new Map<string, { path: string; bytes: Uint8Array; modifiedAt: number }>();

type PublicBook = Pick<BookEntry, "id" | "name" | "size" | "lastOpenedAt" | "progress">;
type OpenResult =
  | { status: "opened"; book: PublicBook; content: string; encoding: SupportedEncoding }
  | { status: "encoding-required"; token: string; name: string }
  | { status: "cancelled" }
  | { status: "missing"; name: string }
  | { status: "error"; message: string };

function publicBook(book: BookEntry): PublicBook {
  const { id, name, size, lastOpenedAt, progress } = book;
  return { id, name, size, lastOpenedAt, progress };
}

function bookId(path: string): string {
  const key = process.platform === "win32" ? resolve(path).toLocaleLowerCase("en-US") : resolve(path);
  return createHash("sha256").update(key).digest("hex");
}

function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => { void saveLibrary(libraryFile, library); }, 250);
}

async function persistNow(): Promise<void> {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = undefined;
  await saveLibrary(libraryFile, library);
}

function ensureTrustedSender(senderId: number, url: string): void {
  if (mainWindow?.webContents.id !== senderId) throw new Error("Untrusted renderer");
  if (app.isPackaged) {
    if (!url.startsWith("file://")) throw new Error("Untrusted renderer URL");
  } else {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1" || parsed.port !== "5173") {
      throw new Error("Untrusted renderer URL");
    }
  }
}

function guardInvoke(event: Electron.IpcMainInvokeEvent): void {
  ensureTrustedSender(event.sender.id, event.senderFrame?.url ?? "");
}

function makeEncodingPrompt(path: string, bytes: Uint8Array, modifiedAt: number): OpenResult {
  const token = randomUUID();
  pendingEncodings.set(token, { path, bytes, modifiedAt });
  return { status: "encoding-required", token, name: basename(path) };
}

async function openPath(path: string, encoding?: SupportedEncoding): Promise<OpenResult> {
  try {
    const [bytes, fileInfo] = await Promise.all([readFile(path), stat(path)]);
    const decoded = encoding
      ? { text: decodeText(bytes, encoding), encoding }
      : decodeTextAutomatically(bytes);
    if (!decoded) return makeEncodingPrompt(path, bytes, fileInfo.mtimeMs);

    const id = bookId(path);
    let book = library.books.find(item => item.id === id);
    const now = Date.now();
    if (book) {
      book.name = basename(path);
      book.size = fileInfo.size;
      book.modifiedAt = fileInfo.mtimeMs;
      book.lastOpenedAt = now;
    } else {
      book = { id, path, name: basename(path), size: fileInfo.size, modifiedAt: fileInfo.mtimeMs, lastOpenedAt: now, progress: 0 };
      library.books.unshift(book);
      library.books = library.books.slice(0, MAX_BOOKS);
    }
    schedulePersist();
    return { status: "opened", book: publicBook(book), content: decoded.text, encoding: decoded.encoding };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "EACCES") {
      const entry = library.books.find(item => item.path === path);
      return { status: "missing", name: entry?.name ?? basename(path) };
    }
    return { status: "error", message: error instanceof Error ? error.message : "无法读取这个文件。" };
  }
}

function installIpc(): void {
  ipcMain.handle("library:load", event => {
    guardInvoke(event);
    return {
      books: library.books.map(publicBook),
      fontSize: library.preferences.fontSize
    };
  });

  ipcMain.handle("book:select", async event => {
    guardInvoke(event);
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: "打开 TXT 文件",
      properties: ["openFile"],
      filters: [{ name: "TXT 文本", extensions: ["txt"] }]
    });
    if (result.canceled || result.filePaths.length === 0) return { status: "cancelled" } satisfies OpenResult;
    return openPath(result.filePaths[0]);
  });

  ipcMain.handle("book:reopen", async (event, id: unknown) => {
    guardInvoke(event);
    if (typeof id !== "string" || id.length !== 64) throw new Error("Invalid book id");
    const entry = library.books.find(book => book.id === id);
    if (!entry) throw new Error("Book no longer exists in the library");
    return openPath(entry.path);
  });

  ipcMain.handle("book:decode", (event, token: unknown, encoding: unknown) => {
    guardInvoke(event);
    if (typeof token !== "string" || typeof encoding !== "string"
      || !["utf-8", "gb18030", "big5", "shift_jis", "utf-16le"].includes(encoding)) throw new Error("Invalid encoding request");
    const pending = pendingEncodings.get(token);
    if (!pending) throw new Error("Encoding request expired");
    pendingEncodings.delete(token);
    return openPathWithBytes(pending.path, pending.bytes, pending.modifiedAt, encoding as SupportedEncoding);
  });

  ipcMain.on("book:progress", (event, payload: unknown) => {
    ensureTrustedSender(event.sender.id, event.senderFrame?.url ?? "");
    if (!payload || typeof payload !== "object") return;
    const update = payload as { id?: unknown; progress?: unknown };
    if (typeof update.id !== "string" || !Number.isFinite(update.progress)) return;
    const book = library.books.find(item => item.id === update.id);
    if (!book) return;
    book.progress = clampProgress(update.progress as number);
    schedulePersist();
  });

  ipcMain.handle("preferences:font-size", (event, value: unknown) => {
    guardInvoke(event);
    const size = Number(value);
    if (!Number.isFinite(size)) throw new Error("Invalid font size");
    library.preferences.fontSize = clampFontSize(size);
    schedulePersist();
    return library.preferences.fontSize;
  });
}

async function openPathWithBytes(path: string, bytes: Uint8Array, modifiedAt: number, encoding: SupportedEncoding): Promise<OpenResult> {
  try {
    const content = decodeText(bytes, encoding);
    const fileInfo = await stat(path);
    const id = bookId(path);
    let book = library.books.find(item => item.id === id);
    if (book) {
      book.name = basename(path);
      book.size = fileInfo.size;
      book.modifiedAt = modifiedAt;
      book.lastOpenedAt = Date.now();
    } else {
      book = { id, path, name: basename(path), size: fileInfo.size, modifiedAt, lastOpenedAt: Date.now(), progress: 0 };
      library.books.unshift(book);
      library.books = library.books.slice(0, MAX_BOOKS);
    }
    schedulePersist();
    return { status: "opened", book: publicBook(book), content, encoding };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "无法解码这个文件。" };
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 720,
    minHeight: 560,
    title: "纸间 · TXT 阅读器",
    backgroundColor: "#f6f4ee",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, target) => {
    const local = app.isPackaged ? target.startsWith("file://") : target.startsWith("http://127.0.0.1:5173/");
    if (!local) event.preventDefault();
  });
  if (app.isPackaged) void mainWindow.loadFile(join(__dirname, "../dist/index.html"));
  else void mainWindow.loadURL("http://127.0.0.1:5173/");
}

app.whenReady().then(async () => {
  library = await loadLibrary(libraryFile);
  installIpc();
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
          "font-src 'self'; object-src 'none'; base-uri 'self'; frame-src 'none'; " +
          (app.isPackaged ? "connect-src 'self'" : "connect-src 'self' ws://127.0.0.1:5173")
        ]
      }
    });
  });
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("before-quit", event => {
  if (!persistTimer) return;
  event.preventDefault();
  void persistNow().finally(() => app.exit(0));
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

import "./style.css";
import { clampFontSize, clampProgress, DEFAULT_FONT_SIZE, MAX_FONT_SIZE, MIN_FONT_SIZE, type SupportedEncoding } from "./shared/reader";

interface Book { id: string; name: string; size: number; lastOpenedAt: number; progress: number }
const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const libraryView = byId<HTMLElement>("library-view");
const readerView = byId<HTMLElement>("reader-view");
const list = byId<HTMLElement>("book-list");
const emptyState = byId<HTMLElement>("empty-state");
const column = byId<HTMLElement>("reading-column");
const readingText = byId<HTMLElement>("reading-text");
const titleNode = byId<HTMLElement>("reading-title");
const toast = byId<HTMLElement>("toast");
const encodingDialog = byId<HTMLDialogElement>("encoding-dialog");
const encodingChoice = byId<HTMLSelectElement>("encoding-choice");
const books = new Map<string, Book>();
let activeBook: Book | undefined;
let fontSize = DEFAULT_FONT_SIZE;
let pendingEncodingToken: string | undefined;
let progressTimer: number | undefined;
let toastTimer: number | undefined;

function notify(message: string): void {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2800);
}

function formatDate(value: number): string {
  if (!value) return "还没有阅读";
  const elapsed = Date.now() - value;
  if (elapsed < 60_000) return "刚刚阅读";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`;
  if (new Date(value).toDateString() === new Date().toDateString()) return "今天阅读";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(value) + " 阅读";
}

function renderBooks(entries = [...books.values()]): void {
  books.clear();
  for (const entry of entries) books.set(entry.id, entry);
  list.replaceChildren();
  byId<HTMLElement>("book-count").textContent = `${entries.length} 本书`;
  emptyState.classList.toggle("visible", entries.length === 0);
  for (const book of entries) {
    const row = document.createElement("article");
    row.className = "book-row";
    const icon = document.createElement("div");
    icon.className = "book-icon";
    icon.textContent = "TXT";
    icon.setAttribute("aria-hidden", "true");
    const info = document.createElement("div");
    info.className = "book-info";
    const title = document.createElement("h3");
    title.className = "book-name";
    title.textContent = book.name;
    const meta = document.createElement("p");
    meta.className = "book-meta";
    meta.textContent = `${formatDate(book.lastOpenedAt)} · ${Math.max(1, Math.ceil(book.size / 1024))} KB`;
    const progress = document.createElement("div");
    progress.className = "row-progress";
    const progressTrack = document.createElement("div");
    progressTrack.className = "progress-track";
    progressTrack.setAttribute("role", "progressbar");
    progressTrack.setAttribute("aria-label", `${book.name} 阅读进度`);
    progressTrack.setAttribute("aria-valuemin", "0");
    progressTrack.setAttribute("aria-valuemax", "100");
    progressTrack.setAttribute("aria-valuenow", String(Math.round(book.progress * 100)));
    const progressValue = document.createElement("div");
    progressValue.className = "progress-value";
    progressValue.style.width = `${Math.round(book.progress * 100)}%`;
    progressTrack.append(progressValue);
    const percent = document.createElement("strong");
    percent.textContent = `${Math.round(book.progress * 100)}%`;
    progress.append(progressTrack, percent);
    info.append(title, meta, progress);
    const open = document.createElement("button");
    open.className = "open-recent";
    open.type = "button";
    open.textContent = "继续阅读  →";
    open.addEventListener("click", () => { void openRecent(book.id); });
    row.append(icon, info, open);
    list.append(row);
  }
}

function updateProgress(ratio: number): void {
  const percent = Math.round(clampProgress(ratio) * 100);
  const track = byId<HTMLElement>("progress-label").previousElementSibling as HTMLElement;
  track.setAttribute("aria-valuenow", String(percent));
  track.firstElementChild!.setAttribute("style", `width:${percent}%`);
  byId<HTMLElement>("progress-label").textContent = `${percent}%`;
}

function persistProgress(): void {
  if (!activeBook) return;
  const max = column.scrollHeight - column.clientHeight;
  activeBook.progress = max > 0 ? clampProgress(column.scrollTop / max) : 0;
  window.paperReader.saveProgress(activeBook.id, activeBook.progress);
  updateProgress(activeBook.progress);
}

function scheduleProgressSave(): void {
  if (progressTimer) window.clearTimeout(progressTimer);
  progressTimer = window.setTimeout(persistProgress, 350);
  const max = column.scrollHeight - column.clientHeight;
  updateProgress(max > 0 ? column.scrollTop / max : 0);
}

function showReader(book: Book, content: string, restore = true): void {
  activeBook = book;
  titleNode.textContent = book.name.replace(/\.txt$/i, "") || book.name;
  byId<HTMLElement>("reader-name").textContent = book.name;
  readingText.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const line of content.replace(/\r\n?/g, "\n").split("\n")) {
    const paragraph = document.createElement("p");
    paragraph.textContent = line;
    fragment.append(paragraph);
  }
  readingText.append(fragment);
  readingText.style.fontSize = `${fontSize}px`;
  byId<HTMLElement>("font-size-label").textContent = `${fontSize} px`;
  libraryView.hidden = true;
  readerView.hidden = false;
  column.scrollTop = 0;
  requestAnimationFrame(() => {
    const max = column.scrollHeight - column.clientHeight;
    column.scrollTop = restore ? max * clampProgress(book.progress) : 0;
    updateProgress(restore ? book.progress : 0);
    byId<HTMLElement>("save-note").textContent = "阅读位置会自动保存在这台设备";
    column.focus({ preventScroll: true });
  });
}

async function handleOpenResult(result: Awaited<ReturnType<typeof window.paperReader.selectBook>>): Promise<void> {
  if (result.status === "cancelled") return;
  if (result.status === "encoding-required") {
    pendingEncodingToken = result.token;
    byId<HTMLElement>("encoding-description").textContent = `无法自动识别“${result.name}”的编码，请选择一种编码后继续阅读。`;
    encodingDialog.showModal();
    return;
  }
  if (result.status === "missing") {
    notify(`找不到“${result.name}”，请重新选择文件。`);
    const replacement = await window.paperReader.selectBook();
    await handleOpenResult(replacement);
    return;
  }
  if (result.status === "error") { notify(`打开失败：${result.message}`); return; }
  books.set(result.book.id, result.book);
  renderBooks([...books.values()].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt));
  showReader(result.book, result.content);
}

async function selectBook(): Promise<void> {
  try { await handleOpenResult(await window.paperReader.selectBook()); }
  catch (error) { notify(error instanceof Error ? error.message : "打开文件失败。"); }
}

async function openRecent(id: string): Promise<void> {
  try { await handleOpenResult(await window.paperReader.reopenBook(id)); }
  catch (error) { notify(error instanceof Error ? error.message : "无法打开这本书。"); }
}

byId<HTMLButtonElement>("open-book").addEventListener("click", () => { void selectBook(); });
byId<HTMLButtonElement>("empty-open").addEventListener("click", () => { void selectBook(); });
byId<HTMLButtonElement>("back-to-library").addEventListener("click", () => {
  persistProgress();
  readerView.hidden = true;
  libraryView.hidden = false;
  activeBook = undefined;
});
column.addEventListener("scroll", scheduleProgressSave, { passive: true });
window.addEventListener("beforeunload", () => {
  if (progressTimer) window.clearTimeout(progressTimer);
  persistProgress();
});

async function changeFont(delta: number): Promise<void> {
  fontSize = clampFontSize(fontSize + delta);
  readingText.style.fontSize = `${fontSize}px`;
  byId<HTMLElement>("font-size-label").textContent = `${fontSize} px`;
  try { fontSize = await window.paperReader.saveFontSize(fontSize); }
  catch { notify("字号已调整，但未能保存设置。"); }
  scheduleProgressSave();
}

byId<HTMLButtonElement>("font-down").addEventListener("click", () => {
  if (fontSize > MIN_FONT_SIZE) void changeFont(-1);
});
byId<HTMLButtonElement>("font-up").addEventListener("click", () => {
  if (fontSize < MAX_FONT_SIZE) void changeFont(1);
});
encodingDialog.addEventListener("close", async () => {
  if (encodingDialog.returnValue !== "confirm" || !pendingEncodingToken) { pendingEncodingToken = undefined; return; }
  const token = pendingEncodingToken;
  pendingEncodingToken = undefined;
  try { await handleOpenResult(await window.paperReader.decodeBook(token, encodingChoice.value as SupportedEncoding)); }
  catch { notify("无法用该编码读取文件，请重新打开后再试。"); }
});

void window.paperReader.loadLibrary().then(data => {
  fontSize = clampFontSize(data.fontSize);
  renderBooks(data.books.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt));
}).catch(() => notify("无法读取本地书架数据。"));

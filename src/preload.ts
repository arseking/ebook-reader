import { contextBridge, ipcRenderer } from "electron";
import type { SupportedEncoding } from "./shared/reader";

contextBridge.exposeInMainWorld("paperReader", {
  loadLibrary: () => ipcRenderer.invoke("library:load"),
  selectBook: () => ipcRenderer.invoke("book:select"),
  reopenBook: (id: string) => ipcRenderer.invoke("book:reopen", id),
  decodeBook: (token: string, encoding: SupportedEncoding) => ipcRenderer.invoke("book:decode", token, encoding),
  saveProgress: (id: string, progress: number) => ipcRenderer.send("book:progress", { id, progress }),
  saveFontSize: (size: number) => ipcRenderer.invoke("preferences:font-size", size)
});

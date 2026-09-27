import type { SupportedEncoding } from "./shared/reader";

interface PaperBook {
  id: string;
  name: string;
  size: number;
  lastOpenedAt: number;
  progress: number;
  pathAvailable?: boolean;
}

type PaperOpenResult =
  | { status: "opened"; book: PaperBook; content: string; encoding: SupportedEncoding }
  | { status: "encoding-required"; token: string; name: string }
  | { status: "cancelled" }
  | { status: "missing"; name: string }
  | { status: "error"; message: string };

declare global {
  interface Window {
    paperReader: {
      loadLibrary(): Promise<{ books: PaperBook[]; fontSize: number }>;
      selectBook(): Promise<PaperOpenResult>;
      reopenBook(id: string): Promise<PaperOpenResult>;
      decodeBook(token: string, encoding: SupportedEncoding): Promise<PaperOpenResult>;
      saveProgress(id: string, progress: number): void;
      saveFontSize(size: number): Promise<number>;
    };
  }
}

export {};

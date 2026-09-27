export const MIN_FONT_SIZE = 14;
export const MAX_FONT_SIZE = 28;
export const DEFAULT_FONT_SIZE = 18;

export type SupportedEncoding = "utf-8" | "gb18030" | "big5" | "shift_jis" | "utf-16le";

export function clampFontSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_FONT_SIZE;
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(value)));
}

export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function decodeText(bytes: Uint8Array, encoding: SupportedEncoding): string {
  return new TextDecoder(encoding, { fatal: true }).decode(bytes);
}

export function decodeTextAutomatically(bytes: Uint8Array): { text: string; encoding: SupportedEncoding } | null {
  for (const encoding of ["utf-8", "gb18030"] as const) {
    try {
      return { text: decodeText(bytes, encoding), encoding };
    } catch {
      // Ask the reader to choose an encoding if both strict decoders reject the file.
    }
  }
  return null;
}

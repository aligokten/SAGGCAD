import { DrawingData } from "../core/document";

export function download(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

const AUTOSAVE_KEY = "saggcad:autosave";

export function autosave(data: DrawingData): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
  } catch {
    // Depolama kapalı ya da dolu olabilir; otomatik kayıt isteğe bağlıdır.
  }
}

export function loadAutosave(): DrawingData | null {
  try {
    const s = localStorage.getItem(AUTOSAVE_KEY);
    return s ? (JSON.parse(s) as DrawingData) : null;
  } catch {
    return null;
  }
}

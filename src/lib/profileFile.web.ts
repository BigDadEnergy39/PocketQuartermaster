import type { ExportOutcome } from './profileFile';

// Web file I/O for container profiles. Uses plain browser APIs — no
// expo-file-system/sharing/document-picker in the web bundle (Metro resolves
// this .web file instead of .native). Share.share() no-ops on desktop browsers,
// so the web path is download-first with a clipboard fallback.

export async function exportProfileFile(json: string, filename: string): Promise<ExportOutcome> {
  try {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return 'downloaded';
  } catch {
    // Last resort if the download path is blocked: put the JSON on the clipboard.
    try {
      await navigator.clipboard.writeText(json);
      return 'copied';
    } catch {
      return 'unavailable';
    }
  }
}

export async function importProfileFile(): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsText(f);
    };
    // Note: if the user cancels the OS file dialog, `onchange` never fires and
    // this promise stays pending. That's harmless here (the caller simply never
    // proceeds), and there is no reliable cross-browser "cancel" event to hook.
    input.click();
  });
}

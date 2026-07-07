// Shared type surface for the platform-split profile file I/O. Metro resolves
// the .native.ts / .web.ts implementation at bundle time; TypeScript resolves
// this declaration for the bare import path (same pattern as authStorage).

// What the export actually did, so the UI can show the right confirmation.
//   'shared'      — native OS share sheet was presented
//   'downloaded'  — web browser downloaded the .json file
//   'copied'      — fell back to copying the JSON to the clipboard
//   'unavailable' — no way to hand off the file on this device
export type ExportOutcome = 'shared' | 'downloaded' | 'copied' | 'unavailable';

// Write `json` to a file named `filename` and hand it off (share sheet on
// native, download on web).
export declare function exportProfileFile(json: string, filename: string): Promise<ExportOutcome>;

// Let the user pick a file and return its text contents, or null if cancelled.
export declare function importProfileFile(): Promise<string | null>;

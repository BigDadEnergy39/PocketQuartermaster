// Shared type surface for the platform-split profile file I/O. Metro resolves
// the .native.ts / .web.ts implementation at bundle time; TypeScript resolves
// this declaration for the bare import path (same pattern as authStorage).

// What an export actually did, so the UI can show the right confirmation.
//   'shared'      — native OS share sheet was presented (send to an app/person)
//   'saved'       — written to a user-chosen folder on the device (Android SAF)
//   'downloaded'  — web browser downloaded the .json file
//   'copied'      — fell back to copying the JSON to the clipboard
//   'cancelled'   — user backed out of the save/permission dialog
//   'unavailable' — no way to hand off the file on this device
export type ExportOutcome =
  | 'shared'
  | 'saved'
  | 'downloaded'
  | 'copied'
  | 'cancelled'
  | 'unavailable';

// Send the profile to another app/person (native share sheet; web download).
export declare function shareProfileFile(json: string, filename: string): Promise<ExportOutcome>;

// Save the profile as a real file on the device (Android Storage Access
// Framework folder picker; web download — which already lands on the device).
export declare function saveProfileFile(json: string, filename: string): Promise<ExportOutcome>;

// Let the user pick a file and return its text contents, or null if cancelled.
export declare function importProfileFile(): Promise<string | null>;

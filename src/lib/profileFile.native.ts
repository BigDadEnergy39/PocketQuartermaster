import { File, Paths } from 'expo-file-system';
import { StorageAccessFramework, writeAsStringAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import type { ExportOutcome } from './profileFile';

// Native (iOS/Android) file I/O for container profiles. Uses the SDK 56 class
// based expo-file-system API (File/Paths) for the share path, the OS share sheet
// (expo-sharing), the system document picker (expo-document-picker), and — for
// "save to device" — the Storage Access Framework, which only lives in the
// legacy expo-file-system entry point (the new API doesn't expose SAF yet).

// Send to another app/person via the OS share sheet. Writes to a cache file
// first because shareAsync shares a file URI, not a raw string.
export async function shareProfileFile(json: string, filename: string): Promise<ExportOutcome> {
  const file = new File(Paths.cache, filename);
  // Re-exporting reuses the same cache filename, so clear a stale copy first —
  // File.create() throws if the file already exists.
  try {
    if (file.exists) file.delete();
  } catch {
    // best-effort cleanup; if delete fails, create() below will surface it
  }
  file.create();
  file.write(json);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Share container profile',
      UTI: 'public.json',
    });
    return 'shared';
  }
  return 'unavailable';
}

// Save a real file onto the device. On Android this pops the SAF folder picker
// (e.g. Downloads); the user grants access to a folder, then we create the file
// there. iOS has no SAF, so fall back to the share sheet (whose "Save to Files"
// target is the equivalent there).
export async function saveProfileFile(json: string, filename: string): Promise<ExportOutcome> {
  if (StorageAccessFramework?.requestDirectoryPermissionsAsync) {
    const perm = await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!perm.granted) return 'cancelled';
    // createFileAsync takes the name WITHOUT extension; the mimeType supplies it.
    const baseName = filename.replace(/\.json$/i, '');
    const fileUri = await StorageAccessFramework.createFileAsync(
      perm.directoryUri,
      baseName,
      'application/json',
    );
    await writeAsStringAsync(fileUri, json);
    return 'saved';
  }
  return shareProfileFile(json, filename);
}

export async function importProfileFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.length) return null;
  const picked = new File(result.assets[0].uri);
  return await picked.text();
}

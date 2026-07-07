import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import type { ExportOutcome } from './profileFile';

// Native (iOS/Android) file I/O for container profiles. Uses the SDK 56 class
// based expo-file-system API (File/Paths), the OS share sheet (expo-sharing),
// and the system document picker (expo-document-picker).

export async function exportProfileFile(json: string, filename: string): Promise<ExportOutcome> {
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
      dialogTitle: 'Export container profile',
      UTI: 'public.json',
    });
    return 'shared';
  }
  return 'unavailable';
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

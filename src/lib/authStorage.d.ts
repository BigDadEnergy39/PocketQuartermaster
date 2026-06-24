// Shared type surface for the platform-split auth storage. Metro resolves the
// .native.ts / .web.ts implementation at bundle time; TypeScript resolves this
// declaration for the bare import path. Matches Supabase's SupportedStorage.
interface SupportedStorage {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

export declare const authStorage: SupportedStorage;

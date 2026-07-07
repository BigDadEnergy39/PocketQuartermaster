// Shared helpers for the container-profile export/import feature.
//
// A "container profile" is the template/structure of a unit — its containers,
// subcontainers, linked sets, item catalog, and expected quantities — with no
// live counts. The server (export_container_profile / import_container_profile
// RPCs) is the source of truth for the shape; these client helpers only build a
// filename and validate a file before we hand it to the import RPC, so the user
// gets a friendly error instead of a raw Postgres exception.

export const PROFILE_KIND = 'pocketquartermaster.container-profile';
export const PROFILE_SCHEMA_VERSION = 1;

export interface ProfileItem {
  ref: string;
  name: string;
  category: string | null;
  unitOfMeasure: string;
  minQuantity: number | null;
  minQuantityPerPerson: number | null;
  notes: string | null;
}

export interface ProfileGroup {
  ref: string;
  name: string;
}

export interface ProfileSlot {
  itemRef: string;
  expectedQuantity: number;
  notes: string | null;
}

export interface ProfileContainer {
  ref: string;
  parentRef: string | null;
  groupRef: string | null;
  name: string;
  type: string;
  purpose: string;
  notes: string | null;
  slots: ProfileSlot[];
}

export interface ContainerProfile {
  schemaVersion: number;
  kind: string;
  exportedAt?: string;
  sourceUnitName?: string;
  items: ProfileItem[];
  groups: ProfileGroup[];
  containers: ProfileContainer[];
}

export type ParseResult =
  | { ok: true; profile: ContainerProfile }
  | { ok: false; error: string };

// Validate a picked/pasted file before importing. Mirrors the server's own
// checks so we can fail early with a readable message; the server re-validates
// regardless (never trust the client).
export function parseAndValidateProfile(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }
  if (!data || typeof data !== 'object') {
    return { ok: false, error: "That file isn't a container profile." };
  }
  const p = data as Partial<ContainerProfile>;
  if (p.kind !== PROFILE_KIND) {
    return { ok: false, error: "That file isn't a PocketQuartermaster container profile." };
  }
  if (p.schemaVersion !== PROFILE_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `This profile is version ${p.schemaVersion ?? '?'}, but this app expects version ${PROFILE_SCHEMA_VERSION}. Update the app and try again.`,
    };
  }
  return { ok: true, profile: p as ContainerProfile };
}

// Human-friendly count summary for the export confirmation.
export function summarizeProfile(profile: ContainerProfile): string {
  const containers = profile.containers?.length ?? 0;
  const items = profile.items?.length ?? 0;
  const top = profile.containers?.filter(c => !c.parentRef).length ?? 0;
  const subs = containers - top;
  const parts = [`${top} container${top === 1 ? '' : 's'}`];
  if (subs > 0) parts.push(`${subs} subcontainer${subs === 1 ? '' : 's'}`);
  parts.push(`${items} item${items === 1 ? '' : 's'}`);
  return parts.join(', ');
}

// A local (not UTC) date stamp for the filename — the user's global convention
// is that any user-visible date must read in local time, and a filename dated
// "tomorrow" near midnight would look wrong even though it's only cosmetic.
function localDateStamp(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function profileFilename(unitName?: string): string {
  const slug =
    (unitName ?? 'unit')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'unit';
  return `pocketqm-${slug}-${localDateStamp()}.json`;
}

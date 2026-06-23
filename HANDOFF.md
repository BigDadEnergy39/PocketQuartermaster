# PocketQuartermaster — Session Handoff (2026-06-22)

## Where We Are
The app is in a clean, working state on **master**. A signed release APK is installed and
tested on device. All 19 Supabase migrations have been run.

## What Was Done This Session

### Trips feature removed
The trip planning shopping list was redundant with the unit shopping list (which now supports
categories, filtering, grouping, and price tracking). Trips were removed from the UI, tab bar,
and database (migration 019). The full trip implementation is preserved on the
`feature/trip-planning` branch if it ever needs to come back.

### Shopping list categories & price tracking (completed last session, merged this session)
- User-defined category dimensions per unit (e.g. "Store", "Section")
- Each shopping item can be tagged with values per dimension
- Filter + group the list by any dimension
- Price per unit input; running cart total banner
- Autocomplete on tag values to keep naming consistent
- Same system on both unit shopping list

### New icon
`assets/Pocket_Clipboard_v1-2.png` is now the app icon (denim pocket + clipboard with
green checkmarks). The alternate version (`v1-1`, light shadow background) is in assets
but not used.

### Contents check selective add (completed last session)
After a contents check, missing items appear as a pre-selected checklist. Only checked
items get added to the shopping list. `add_to_shopping_list` upserts by name — if an item
already exists it restores it (unpurchases) and accumulates quantity rather than duplicating.

## Tab Structure
1. 📦 Inventory
2. 🛒 Shopping  
3. ⚙️ Settings

## Build & Install
```powershell
cd C:\Dev\PocketQuartermaster\android
.\gradlew assembleRelease
adb install app\build\outputs\apk\release\app-release.apk
```

## Backlog (prioritized roughly)
1. **Member role management** — Settings shows member list but QMs can't change roles
2. **Expiration tracking UI testing** — migration 015 is in, needs a real perishable item to test the full flow
3. **Notification preferences UI** — unit-level defaults + per-user overrides (not started)
4. **Selective add from audit conduct screen** — same checklist pattern as contents check (deferred)
5. **Subcontainers** — nested organization within containers (backlog)

## Critical Architecture Notes
- **All DB access through RPCs** — direct Supabase queries fail silently due to `auth.uid()` not
  resolving through RLS. Every read and write uses a `security definer` RPC.
- **Changing an RPC's return type requires DROP first** — `CREATE OR REPLACE` won't change
  signatures. Always `DROP FUNCTION` the old signature before recreating.
- **Function overloads must be dropped individually** — if two overloads exist (e.g. from an
  old migration), drop each by its exact parameter signature.
- `android/gradle.properties` is gitignored — contains keystore credentials. Never commit it.
- `reactNativeArchitectures=arm64-v8a` in gradle.properties — required to avoid OOM during build.

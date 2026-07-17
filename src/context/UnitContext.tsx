import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { UnitWithRole } from '../types';

const STORAGE_KEY = 'pocketquartermaster.currentUnitId';

interface UnitContextValue {
  currentUnit: UnitWithRole | null;
  setCurrentUnit: (unit: UnitWithRole | null) => void;
  // The unit id persisted from a previous session, and whether that value has
  // finished loading from storage. Consumers that auto-pick a default unit
  // (e.g. the tab layout) must wait for `isRestored` before falling back to
  // units[0], otherwise a reload always races storage and lands on the wrong unit.
  restoredUnitId: string | null;
  isRestored: boolean;
  // The signed-in user's units, owned here so there is ONE shared copy. Every
  // consumer (routing guard, tab layout, switch/settings screens) reads this
  // same list and shares `refetchUnits`. Previously each call site had its own
  // `useUnits` instance with private state, so joining/creating a unit updated
  // one instance while the routing guard's stale [] bounced the user back to
  // /onboarding until a manual reload. See app/join-unit.tsx / app/create-unit.tsx.
  units: UnitWithRole[];
  unitsLoading: boolean;
  refetchUnits: () => Promise<void>;
}

const UnitContext = createContext<UnitContextValue>({
  currentUnit: null,
  setCurrentUnit: () => {},
  restoredUnitId: null,
  isRestored: false,
  units: [],
  unitsLoading: true,
  refetchUnits: async () => {},
});

export function UnitProvider({ userId, children }: { userId: string | undefined; children: ReactNode }) {
  const [currentUnit, setCurrentUnitState] = useState<UnitWithRole | null>(null);
  const [restoredUnitId, setRestoredUnitId] = useState<string | null>(null);
  const [isRestored, setIsRestored] = useState(false);
  const [units, setUnits] = useState<UnitWithRole[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(id => {
      setRestoredUnitId(id);
      setIsRestored(true);
    });
  }, []);

  // Fetch the units for the current user. Exposed as `refetchUnits` so that
  // after a join/create/delete the shared list refreshes for every consumer at
  // once — including the routing guard in app/_layout.tsx.
  const refetchUnits = useCallback(async () => {
    if (!userId) {
      setUnits([]);
      setUnitsLoading(false);
      return;
    }
    setUnitsLoading(true);
    const { data, error } = await supabase
      .from('unit_members')
      .select('role, units(*)')
      .eq('user_id', userId)
      .order('name', { referencedTable: 'units' });

    if (!error && data) {
      const mapped: UnitWithRole[] = data.map((row: any) => ({
        ...row.units,
        role: row.role,
      }));
      setUnits(mapped);
    }
    setUnitsLoading(false);
  }, [userId]);

  // Re-fetch whenever the signed-in user changes (sign in / switch account /
  // sign out). refetchUnits is keyed on userId, so this effect re-runs then.
  useEffect(() => {
    refetchUnits();
  }, [refetchUnits]);

  function setCurrentUnit(unit: UnitWithRole | null) {
    setCurrentUnitState(unit);
    if (unit) {
      AsyncStorage.setItem(STORAGE_KEY, unit.id);
    } else {
      AsyncStorage.removeItem(STORAGE_KEY);
    }
  }

  return (
    <UnitContext.Provider value={{
      currentUnit, setCurrentUnit, restoredUnitId, isRestored,
      units, unitsLoading, refetchUnits,
    }}>
      {children}
    </UnitContext.Provider>
  );
}

export function useUnit() {
  return useContext(UnitContext);
}

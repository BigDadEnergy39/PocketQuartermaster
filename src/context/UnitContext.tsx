import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
}

const UnitContext = createContext<UnitContextValue>({
  currentUnit: null,
  setCurrentUnit: () => {},
  restoredUnitId: null,
  isRestored: false,
});

export function UnitProvider({ children }: { children: ReactNode }) {
  const [currentUnit, setCurrentUnitState] = useState<UnitWithRole | null>(null);
  const [restoredUnitId, setRestoredUnitId] = useState<string | null>(null);
  const [isRestored, setIsRestored] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(id => {
      setRestoredUnitId(id);
      setIsRestored(true);
    });
  }, []);

  function setCurrentUnit(unit: UnitWithRole | null) {
    setCurrentUnitState(unit);
    if (unit) {
      AsyncStorage.setItem(STORAGE_KEY, unit.id);
    } else {
      AsyncStorage.removeItem(STORAGE_KEY);
    }
  }

  return (
    <UnitContext.Provider value={{ currentUnit, setCurrentUnit, restoredUnitId, isRestored }}>
      {children}
    </UnitContext.Provider>
  );
}

export function useUnit() {
  return useContext(UnitContext);
}

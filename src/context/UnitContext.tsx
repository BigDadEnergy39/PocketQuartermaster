import { createContext, useContext, useState, ReactNode } from 'react';
import { UnitWithRole } from '../types';

interface UnitContextValue {
  currentUnit: UnitWithRole | null;
  setCurrentUnit: (unit: UnitWithRole) => void;
}

const UnitContext = createContext<UnitContextValue>({
  currentUnit: null,
  setCurrentUnit: () => {},
});

export function UnitProvider({ children }: { children: ReactNode }) {
  const [currentUnit, setCurrentUnit] = useState<UnitWithRole | null>(null);

  return (
    <UnitContext.Provider value={{ currentUnit, setCurrentUnit }}>
      {children}
    </UnitContext.Provider>
  );
}

export function useUnit() {
  return useContext(UnitContext);
}

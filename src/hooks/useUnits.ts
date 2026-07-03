import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { UnitWithRole } from '../types';

export function useUnits(userId: string | undefined) {
  const [units, setUnits] = useState<UnitWithRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setUnits([]);
      setLoading(false);
      return;
    }
    fetchUnits();
  }, [userId]);

  async function fetchUnits() {
    setLoading(true);
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
    setLoading(false);
  }

  return { units, loading, refetch: fetchUnits };
}

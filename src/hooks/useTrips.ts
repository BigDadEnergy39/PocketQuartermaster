import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface Trip {
  id: string;
  name: string;
  trip_date: string;
  return_date: string | null;
  headcount: number | null;
  notes: string | null;
  shopping_item_count: number;
  purchased_count: number;
  created_at: string;
}

export function useTrips(unitId: string | undefined) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!unitId) { setLoading(false); return; }
    fetchTrips();
  }, [unitId]);

  async function fetchTrips() {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_trips', { p_unit_id: unitId });
    if (!error && data) setTrips(data);
    setLoading(false);
  }

  return { trips, loading, refetch: fetchTrips };
}

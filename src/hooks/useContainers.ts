import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface ContainerSummary {
  id: string;
  name: string;
  type: string;
  purpose: string;
  notes: string | null;
  item_count: number;
}

export function useContainers(unitId: string | undefined) {
  const [containers, setContainers] = useState<ContainerSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!unitId) { setLoading(false); return; }
    fetchContainers();
  }, [unitId]);

  async function fetchContainers() {
    setLoading(true);
    const { data, error } = await supabase
      .from('containers')
      .select(`
        id, name, type, purpose, notes,
        item_slots(count)
      `)
      .eq('unit_id', unitId)
      .eq('is_archived', false)
      .order('name');

    if (!error && data) {
      setContainers(data.map((c: any) => ({
        ...c,
        item_count: c.item_slots?.[0]?.count ?? 0,
      })));
    }
    setLoading(false);
  }

  return { containers, loading, refetch: fetchContainers };
}

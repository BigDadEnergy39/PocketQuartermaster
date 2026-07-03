import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface ContainerSummary {
  id: string;
  name: string;
  type: string;
  purpose: string;
  notes: string | null;
  item_count: number;
  subcontainer_count: number;
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
    const { data, error } = await supabase.rpc('get_containers', { p_unit_id: unitId });
    if (!error && data) setContainers(data);
    setLoading(false);
  }

  return { containers, loading, refetch: fetchContainers };
}

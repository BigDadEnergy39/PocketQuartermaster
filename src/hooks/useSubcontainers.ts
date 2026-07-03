import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface SubcontainerSummary {
  id: string;
  name: string;
  type: string;
  purpose: string;
  notes: string | null;
  item_count: number;
}

export function useSubcontainers(containerId: string | undefined) {
  const [subcontainers, setSubcontainers] = useState<SubcontainerSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerId) { setLoading(false); return; }
    fetchSubcontainers();
  }, [containerId]);

  async function fetchSubcontainers() {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_subcontainers', { p_container_id: containerId });
    if (!error && data) setSubcontainers(data);
    setLoading(false);
  }

  return { subcontainers, loading, refetch: fetchSubcontainers };
}

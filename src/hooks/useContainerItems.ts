import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface SlotWithItem {
  slot_id: string;
  expected_quantity: number;
  current_quantity: number | null;
  last_updated_at: string | null;
  item_id: string;
  item_name: string;
  category: string | null;
  unit_of_measure: string;
  min_quantity: number | null;
}

export function useContainerItems(containerId: string | undefined) {
  const [items, setItems] = useState<SlotWithItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerId) { setLoading(false); return; }
    fetchItems();
  }, [containerId]);

  async function fetchItems() {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_container_items', { p_container_id: containerId });
    if (!error && data) setItems(data);
    setLoading(false);
  }

  return { items, loading, refetch: fetchItems };
}

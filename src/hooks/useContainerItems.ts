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

    // Fetch slots with item details
    const { data: slots, error } = await supabase
      .from('item_slots')
      .select(`
        id,
        expected_quantity,
        items(id, name, category, unit_of_measure, min_quantity)
      `)
      .eq('container_id', containerId)
      .order('items(name)');

    if (error || !slots) { setLoading(false); return; }

    // Fetch current quantities for these slots
    const slotIds = slots.map((s: any) => s.id);
    const { data: quantities } = await supabase
      .from('current_quantities')
      .select('slot_id, quantity, updated_at')
      .in('slot_id', slotIds);

    const qtyMap = new Map(quantities?.map((q: any) => [q.slot_id, q]) ?? []);

    setItems(slots.map((s: any) => {
      const qty = qtyMap.get(s.id);
      return {
        slot_id: s.id,
        expected_quantity: s.expected_quantity,
        current_quantity: qty?.quantity ?? null,
        last_updated_at: qty?.updated_at ?? null,
        item_id: s.items.id,
        item_name: s.items.name,
        category: s.items.category,
        unit_of_measure: s.items.unit_of_measure,
        min_quantity: s.items.min_quantity,
      };
    }));

    setLoading(false);
  }

  return { items, loading, refetch: fetchItems };
}

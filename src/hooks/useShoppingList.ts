import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface ItemTag {
  type_id: string;
  type_name: string;
  value: string;
}

export interface ShoppingItem {
  id: string;
  item_id: string | null;
  item_name: string;
  quantity: number;
  unit_of_measure: string;
  notes: string | null;
  is_purchased: boolean;
  created_at: string;
  unit_price: number | null;
  tags: ItemTag[];
}

export function useShoppingList(unitId: string | undefined) {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!unitId) { setLoading(false); return; }
    fetchItems();
  }, [unitId]);

  async function fetchItems() {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_shopping_list', { p_unit_id: unitId });
    if (!error && data) setItems(data);
    setLoading(false);
  }

  return { items, loading, refetch: fetchItems };
}

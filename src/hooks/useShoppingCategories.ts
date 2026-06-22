import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';

export interface CategoryType {
  id: string;
  name: string;
  display_order: number;
}

export function useShoppingCategories(unitId: string | undefined) {
  const [categoryTypes, setCategoryTypes] = useState<CategoryType[]>([]);
  // map of typeId → sorted list of previously used values
  const [tagValues, setTagValues] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    const [typesRes, valuesRes] = await Promise.all([
      supabase.rpc('get_shopping_category_types', { p_unit_id: unitId }),
      supabase.rpc('get_all_tag_values', { p_unit_id: unitId }),
    ]);
    if (!typesRes.error && typesRes.data) setCategoryTypes(typesRes.data);
    if (!valuesRes.error && valuesRes.data) {
      const map: Record<string, string[]> = {};
      for (const row of valuesRes.data as { category_type_id: string; value: string }[]) {
        if (!map[row.category_type_id]) map[row.category_type_id] = [];
        map[row.category_type_id].push(row.value);
      }
      setTagValues(map);
    }
    setLoading(false);
  }, [unitId]);

  useFocusEffect(fetch);

  return { categoryTypes, tagValues, loading, refetch: fetch };
}

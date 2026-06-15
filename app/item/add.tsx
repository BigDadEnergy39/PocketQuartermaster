import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useUnit } from '../../src/context/UnitContext';

const UNITS_OF_MEASURE = ['each', 'pack', 'box', 'bag', 'bottle', 'can', 'roll', 'pair', 'set', 'lb', 'oz', 'gallon'];

export default function AddItem() {
  const { container_id } = useLocalSearchParams<{ container_id: string }>();
  const { currentUnit } = useUnit();

  const [itemName, setItemName] = useState('');
  const [category, setCategory] = useState('');
  const [unitOfMeasure, setUnitOfMeasure] = useState('each');
  const [expectedQty, setExpectedQty] = useState('1');
  const [minQty, setMinQty] = useState('');
  const [suggestions, setSuggestions] = useState<{ id: string; name: string; category: string | null; unit_of_measure: string }[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (itemName.length < 2 || selectedItemId) { setSuggestions([]); return; }
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from('items')
        .select('id, name, category, unit_of_measure')
        .ilike('name', `%${itemName}%`)
        .limit(5);
      setSuggestions(data ?? []);
    }, 300);
    return () => clearTimeout(timeout);
  }, [itemName, selectedItemId]);

  function selectSuggestion(s: typeof suggestions[0]) {
    setSelectedItemId(s.id);
    setItemName(s.name);
    setCategory(s.category ?? '');
    setUnitOfMeasure(s.unit_of_measure);
    setSuggestions([]);
  }

  async function save() {
    if (!itemName.trim()) { Alert.alert('Name required'); return; }
    const expected = parseInt(expectedQty, 10);
    if (isNaN(expected) || expected < 1) { Alert.alert('Invalid quantity', 'Expected quantity must be at least 1.'); return; }
    if (!container_id || !currentUnit) return;

    setSaving(true);

    const minVal = minQty.trim() ? parseInt(minQty, 10) : null;

    const { error } = await supabase.rpc('add_item_to_container', {
      p_container_id: container_id,
      p_item_name: itemName.trim(),
      p_category: category.trim() || null,
      p_unit_of_measure: unitOfMeasure,
      p_expected_qty: expected,
      p_min_qty: isNaN(minVal as any) ? null : minVal,
      p_existing_item_id: selectedItemId ?? null,
    });

    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      router.back();
    }
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Item Name</Text>
      <View>
        <TextInput
          style={styles.input}
          value={itemName}
          onChangeText={v => { setItemName(v); setSelectedItemId(null); }}
          placeholder="e.g. Paper Towels"
          placeholderTextColor="#aaa"
        />
        {suggestions.length > 0 && (
          <View style={styles.suggestions}>
            {suggestions.map(s => (
              <TouchableOpacity key={s.id} style={styles.suggestion} onPress={() => selectSuggestion(s)}>
                <Text style={styles.suggestionName}>{s.name}</Text>
                {s.category && <Text style={styles.suggestionMeta}>{s.category} · {s.unit_of_measure}</Text>}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {!selectedItemId && (
        <>
          <Text style={styles.label}>Category (optional)</Text>
          <TextInput
            style={styles.input}
            value={category}
            onChangeText={setCategory}
            placeholder="e.g. Kitchen, First Aid"
            placeholderTextColor="#aaa"
          />

          <Text style={styles.label}>Unit of Measure</Text>
          <View style={styles.chipRow}>
            {UNITS_OF_MEASURE.map(u => (
              <TouchableOpacity
                key={u}
                style={[styles.chip, unitOfMeasure === u && styles.chipSelected]}
                onPress={() => setUnitOfMeasure(u)}
              >
                <Text style={[styles.chipText, unitOfMeasure === u && styles.chipTextSelected]}>{u}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <Text style={styles.label}>Expected Quantity</Text>
      <TextInput
        style={styles.input}
        value={expectedQty}
        onChangeText={setExpectedQty}
        keyboardType="numeric"
        placeholder="1"
        placeholderTextColor="#aaa"
      />

      <Text style={styles.label}>Low Stock Threshold (optional)</Text>
      <TextInput
        style={styles.input}
        value={minQty}
        onChangeText={setMinQty}
        keyboardType="numeric"
        placeholder="Leave blank to auto-calculate (25%)"
        placeholderTextColor="#aaa"
      />
      <Text style={styles.hint}>Triggers LOW badge and shopping list prompt when reached.</Text>

      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: currentUnit?.accent_color ?? '#2d5a27' }, saving && styles.saveBtnDisabled]}
        onPress={save}
        disabled={saving}
      >
        <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Add Item'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f5f0e8' },
  content: { padding: 24, paddingBottom: 60 },
  label: { fontSize: 13, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 20 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#e0d8cc',
  },
  hint: { fontSize: 12, color: '#aaa', marginTop: 6 },
  suggestions: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0d8cc',
    marginTop: 4,
    overflow: 'hidden',
  },
  suggestion: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  suggestionName: { fontSize: 15, color: '#1a1a1a', fontWeight: '500' },
  suggestionMeta: { fontSize: 12, color: '#999', marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: '#e0d8cc',
  },
  chipSelected: { borderColor: '#2d5a27', backgroundColor: '#f0f7ee' },
  chipText: { fontSize: 13, color: '#666', fontWeight: '500' },
  chipTextSelected: { color: '#2d5a27', fontWeight: '700' },
  saveBtn: { padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 32 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn: { padding: 16, alignItems: 'center', marginTop: 8 },
  cancelText: { color: '#888', fontSize: 15 },
});

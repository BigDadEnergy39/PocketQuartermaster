import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Switch } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useUnit } from '../../src/context/UnitContext';

function CategoryAutocomplete({ categories, current, onSelect }: {
  categories: string[]; current: string; onSelect: (v: string) => void;
}) {
  const matches = categories.filter(c =>
    !current || c.toLowerCase().includes(current.toLowerCase())
  );
  if (!matches.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.acRow} keyboardShouldPersistTaps="always">
      {matches.map(c => (
        <TouchableOpacity key={c} style={styles.acChip} onPress={() => onSelect(c)}>
          <Text style={styles.acChipText}>{c}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const UNITS_OF_MEASURE = ['each', 'pack', 'box', 'bag', 'bottle', 'can', 'roll', 'pair', 'set', 'lb', 'oz', 'gallon'];

export default function EditItem() {
  const { slot_id } = useLocalSearchParams<{ slot_id: string }>();
  const { currentUnit } = useUnit();

  const [itemName, setItemName] = useState('');
  const [category, setCategory] = useState('');
  const [unitOfMeasure, setUnitOfMeasure] = useState('each');
  const [expectedQty, setExpectedQty] = useState('1');
  const [minQty, setMinQty] = useState('');
  const [isPerishable, setIsPerishable] = useState(false);
  const [itemId, setItemId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryFocused, setCategoryFocused] = useState(false);

  useEffect(() => {
    if (!currentUnit) return;
    supabase.rpc('get_item_categories', { p_unit_id: currentUnit.id })
      .then(({ data }) => { if (data) setCategories(data.map((r: any) => r.category)); });
  }, [currentUnit?.id]);

  useEffect(() => {
    if (!slot_id) return;
    (async () => {
      const { data } = await supabase
        .from('item_slots')
        .select(`expected_quantity, items(id, name, category, unit_of_measure, min_quantity, is_perishable)`)
        .eq('id', slot_id)
        .single();

      if (data) {
        const item = data.items as any;
        setItemId(item.id);
        setItemName(item.name);
        setCategory(item.category ?? '');
        setUnitOfMeasure(item.unit_of_measure);
        setExpectedQty(String(data.expected_quantity));
        setMinQty(item.min_quantity != null ? String(item.min_quantity) : '');
        setIsPerishable(item.is_perishable ?? false);
      }
      setLoaded(true);
    })();
  }, [slot_id]);

  async function save() {
    const expected = parseInt(expectedQty, 10);
    if (!itemName.trim()) { Alert.alert('Name required'); return; }
    if (isNaN(expected) || expected < 1) { Alert.alert('Invalid quantity', 'Expected quantity must be at least 1.'); return; }

    setSaving(true);
    const minVal = minQty.trim() ? parseInt(minQty, 10) : null;
    const { error } = await supabase.rpc('edit_item_slot', {
      p_slot_id: slot_id,
      p_item_name: itemName.trim(),
      p_category: category.trim() || null,
      p_unit_of_measure: unitOfMeasure,
      p_expected_qty: expected,
      p_min_qty: isNaN(minVal as any) ? null : minVal,
    });

    if (!error && itemId) {
      await supabase.rpc('set_item_perishable', { p_item_id: itemId, p_perishable: isPerishable });
    }
    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      router.back();
    }
  }

  function confirmRemove() {
    Alert.alert(
      'Remove Item',
      `Remove "${itemName}" from this container? The item and its quantity history are preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: doRemove },
      ]
    );
  }

  async function doRemove() {
    setRemoving(true);
    const { error } = await supabase.rpc('remove_item_from_container', { p_slot_id: slot_id });
    setRemoving(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      router.dismiss(2);
    }
  }

  if (!loaded) return null;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Item Name</Text>
      <TextInput
        style={styles.input}
        value={itemName}
        onChangeText={setItemName}
        placeholder="e.g. Paper Towels"
        placeholderTextColor="#aaa"
      />

      <Text style={styles.label}>Category (optional)</Text>
      <TextInput
        style={styles.input}
        value={category}
        onChangeText={setCategory}
        placeholder="e.g. Kitchen, First Aid"
        placeholderTextColor="#aaa"
        onFocus={() => setCategoryFocused(true)}
        onBlur={() => setCategoryFocused(false)}
      />
      {categoryFocused && (
        <CategoryAutocomplete categories={categories} current={category} onSelect={v => { setCategory(v); setCategoryFocused(false); }} />
      )}

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

      <Text style={styles.label}>Expected Quantity</Text>
      <TextInput
        style={styles.input}
        value={expectedQty}
        onChangeText={setExpectedQty}
        keyboardType="numeric"
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

      <View style={styles.toggleRow}>
        <View style={styles.toggleLabel}>
          <Text style={styles.toggleTitle}>Track Expiration Dates</Text>
          <Text style={styles.toggleSub}>For food and other perishables</Text>
        </View>
        <Switch
          value={isPerishable}
          onValueChange={setIsPerishable}
          trackColor={{ false: '#e0d8cc', true: currentUnit?.accent_color ?? '#2d5a27' }}
          thumbColor="#fff"
        />
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: currentUnit?.accent_color ?? '#2d5a27' }, saving && styles.disabled]}
        onPress={save}
        disabled={saving}
      >
        <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.removeBtn, removing && styles.disabled]}
        onPress={confirmRemove}
        disabled={removing}
      >
        <Text style={styles.removeBtnText}>{removing ? 'Removing…' : '🗑 Remove from Container'}</Text>
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
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, padding: 16, marginTop: 20, borderWidth: 1, borderColor: '#e0d8cc',
  },
  toggleLabel: { flex: 1 },
  toggleTitle: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  toggleSub: { fontSize: 12, color: '#aaa', marginTop: 2 },
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
  disabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  removeBtn: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: '#c0392b',
  },
  removeBtnText: { color: '#c0392b', fontSize: 15, fontWeight: '600' },
  acRow: { marginTop: 6 },
  acChip: { backgroundColor: '#e8f0e8', borderRadius: 16, paddingVertical: 5, paddingHorizontal: 12, marginRight: 6 },
  acChipText: { fontSize: 13, color: '#2d5a27', fontWeight: '600' },
});

import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert, ScrollView } from 'react-native';
import { useLocalSearchParams, router, useNavigation, useFocusEffect } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useUnit } from '../../src/context/UnitContext';

export default function ItemDetail() {
  const { slot_id } = useLocalSearchParams<{ slot_id: string }>();
  const { currentUnit } = useUnit();
  const navigation = useNavigation();

  const [item, setItem] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [newQty, setNewQty] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function loadItem() {
    if (!slot_id) return;
    const { data } = await supabase
      .from('item_slots')
      .select(`id, expected_quantity, items(id, name, category, unit_of_measure, min_quantity), containers(id, name)`)
      .eq('id', slot_id)
      .single();

    if (data) {
      const { data: qtyData } = await supabase
        .from('current_quantities')
        .select('quantity, updated_at, notes')
        .eq('slot_id', slot_id)
        .single();
      setItem({ ...data, current_quantity: qtyData?.quantity ?? null, last_updated: qtyData?.updated_at, last_notes: qtyData?.notes });
    }
    setLoaded(true);
  }

  useEffect(() => { loadItem(); }, [slot_id]);
  useFocusEffect(useCallback(() => { loadItem(); }, [slot_id]));

  useEffect(() => {
    if (!item) return;
    navigation.setOptions({
      title: item.items?.name ?? 'Item Detail',
      headerRight: () => (
        <TouchableOpacity onPress={() => router.push(`/item/edit?slot_id=${slot_id}`)} style={{ marginRight: 16 }}>
          <Text style={{ color: currentUnit?.accent_color ?? '#2d5a27', fontSize: 15, fontWeight: '600' }}>Edit</Text>
        </TouchableOpacity>
      ),
    });
  }, [item, currentUnit]);

  async function updateQty() {
    const qty = parseInt(newQty, 10);
    if (isNaN(qty) || qty < 0) { Alert.alert('Invalid quantity', 'Enter 0 or a positive number.'); return; }

    setSaving(true);
    const { error } = await supabase.rpc('record_quantity', {
      p_slot_id: slot_id,
      p_quantity: qty,
      p_notes: notes.trim() || null,
    });
    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setSaved(true);
      setTimeout(() => router.back(), 800);
    }
  }

  async function addToShopping() {
    if (!currentUnit || !item) return;
    const needed = Math.max(1, item.expected_quantity - (item.current_quantity ?? 0));
    const { error } = await supabase.rpc('add_to_shopping_list', {
      p_unit_id: currentUnit.id,
      p_item_id: item.items.id,
      p_item_name: item.items.name,
      p_quantity: needed,
      p_unit_of_measure: item.items.unit_of_measure,
      p_notes: `From ${item.containers?.name ?? 'container'}`,
    });
    if (error) { Alert.alert('Error', error.message); return; }
    Alert.alert('Added', `${item.items.name} added to the shopping list.`);
  }

  if (!loaded) return null;
  if (!item) return (
    <View style={styles.center}><Text style={styles.err}>Item not found.</Text></View>
  );

  const current = item.current_quantity;
  const expected = item.expected_quantity;
  const unit = item.items.unit_of_measure;
  const isLow = current !== null && current < expected && current <= (item.items.min_quantity ?? Math.ceil(expected * 0.25));
  const needsRestock = isLow || current === 0;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {item.containers && <Text style={styles.containerName}>In: {item.containers.name}</Text>}
      {item.items.category && <Text style={styles.category}>{item.items.category}</Text>}

      <View style={styles.qtyCard}>
        <View style={styles.qtyBlock}>
          <Text style={styles.qtyNum}>{current ?? '—'}</Text>
          <Text style={styles.qtyLabel}>Current</Text>
        </View>
        <Text style={styles.qtyDiv}>/</Text>
        <View style={styles.qtyBlock}>
          <Text style={styles.qtyNum}>{expected}</Text>
          <Text style={styles.qtyLabel}>Expected</Text>
        </View>
        <Text style={styles.qtyUnit}>{unit}</Text>
      </View>

      {item.last_notes && (
        <View style={styles.lastNotesBox}>
          <Text style={styles.lastNotesLabel}>Last note:</Text>
          <Text style={styles.lastNotesText}>{item.last_notes}</Text>
        </View>
      )}

      {needsRestock && (
        <TouchableOpacity style={styles.shoppingBtn} onPress={addToShopping}>
          <Text style={styles.shoppingBtnText}>🛒 Add to Shopping List</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.label}>Update Count</Text>
      <View style={styles.row}>
        <TextInput
          style={styles.qtyInput}
          value={newQty}
          onChangeText={setNewQty}
          placeholder={`Enter ${unit} count`}
          placeholderTextColor="#aaa"
          keyboardType="numeric"
          returnKeyType="done"
          onSubmitEditing={updateQty}
          autoFocus
        />
        <TouchableOpacity
          style={[styles.updateBtn, { backgroundColor: saved ? '#2d5a27' : currentUnit?.accent_color ?? '#2d5a27' }, saving && styles.disabled]}
          onPress={updateQty}
          disabled={saving || saved}
        >
          <Text style={styles.updateBtnText}>{saving ? '…' : saved ? '✓' : 'Record'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Notes (optional)</Text>
      <TextInput
        style={[styles.notesInput]}
        value={notes}
        onChangeText={setNotes}
        placeholder="e.g. Lid is cracked, needs replacement"
        placeholderTextColor="#aaa"
        multiline
        numberOfLines={2}
      />

      {item.last_updated && (
        <Text style={styles.lastUpdated}>
          Last counted: {new Date(item.last_updated).toLocaleDateString()}
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f5f0e8' },
  content: { padding: 24, paddingBottom: 60 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  err: { color: '#999' },
  containerName: { fontSize: 13, color: '#888', marginBottom: 4 },
  category: { fontSize: 12, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 16 },
  qtyCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 16, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  qtyBlock: { alignItems: 'center' },
  qtyNum: { fontSize: 40, fontWeight: '700', color: '#1a1a1a' },
  qtyLabel: { fontSize: 12, color: '#aaa', marginTop: 2 },
  qtyDiv: { fontSize: 32, color: '#ccc', marginBottom: 16 },
  qtyUnit: { fontSize: 14, color: '#888', alignSelf: 'flex-end', marginBottom: 6 },
  lastNotesBox: { backgroundColor: '#fffbe6', borderRadius: 8, padding: 10, marginBottom: 12 },
  lastNotesLabel: { fontSize: 11, color: '#b8860b', fontWeight: '700', marginBottom: 2 },
  lastNotesText: { fontSize: 13, color: '#555' },
  shoppingBtn: {
    backgroundColor: '#fff8ee', borderWidth: 1.5, borderColor: '#e67e22',
    borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 20,
  },
  shoppingBtnText: { color: '#e67e22', fontSize: 15, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, marginTop: 4 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  qtyInput: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1,
    borderColor: '#e0d8cc', padding: 14, fontSize: 20, color: '#1a1a1a',
  },
  updateBtn: { paddingHorizontal: 20, borderRadius: 10, justifyContent: 'center', minWidth: 80, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  updateBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  notesInput: {
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1,
    borderColor: '#e0d8cc', padding: 14, fontSize: 15, color: '#1a1a1a',
    textAlignVertical: 'top', minHeight: 70,
  },
  lastUpdated: { fontSize: 12, color: '#bbb', marginTop: 16, textAlign: 'center' },
});

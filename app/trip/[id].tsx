import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, TextInput, Modal, ScrollView,
} from 'react-native';
import { useLocalSearchParams, router, useNavigation, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { useUnit } from '../../src/context/UnitContext';

interface TripDetail {
  id: string;
  name: string;
  trip_date: string;
  return_date: string | null;
  headcount: number | null;
  notes: string | null;
}

interface ShoppingItem {
  id: string;
  item_id: string | null;
  item_name: string;
  quantity_needed: number;
  quantity_purchased: number;
  store: string | null;
  is_purchased: boolean;
  notes: string | null;
}

function fmt(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function TripDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currentUnit } = useUnit();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addQty, setAddQty] = useState('1');
  const [addStore, setAddStore] = useState('');
  const [addNotes, setAddNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!id) return;
    const [tripRes, itemsRes] = await Promise.all([
      supabase.from('trips').select('id,name,trip_date,return_date,headcount,notes').eq('id', id).single(),
      supabase.rpc('get_trip_shopping_items', { p_trip_id: id }),
    ]);
    if (tripRes.data) setTrip(tripRes.data);
    if (!itemsRes.error && itemsRes.data) setItems(itemsRes.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [id]));

  useEffect(() => {
    if (!trip) return;
    navigation.setOptions({
      title: trip.name,
      headerRight: () => (
        <TouchableOpacity onPress={confirmDelete} style={{ marginRight: 16 }}>
          <Text style={{ color: '#c0392b', fontSize: 15, fontWeight: '600' }}>Delete</Text>
        </TouchableOpacity>
      ),
    });
  }, [trip]);

  async function toggle(item: ShoppingItem) {
    await supabase.rpc('toggle_trip_item_purchased', { p_id: item.id });
    load();
  }

  async function removeItem(item: ShoppingItem) {
    Alert.alert('Remove', `Remove "${item.item_name}" from the list?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          await supabase.rpc('remove_trip_shopping_item', { p_id: item.id });
          load();
        },
      },
    ]);
  }

  function confirmDelete() {
    Alert.alert('Delete Trip', `Delete "${trip?.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await supabase.rpc('delete_trip', { p_trip_id: id });
          router.replace('/(tabs)/trips');
        },
      },
    ]);
  }

  async function addItem() {
    if (!addName.trim()) { Alert.alert('Name required'); return; }
    const qty = parseInt(addQty, 10);
    if (isNaN(qty) || qty < 1) { Alert.alert('Invalid quantity'); return; }

    setSaving(true);
    const { error } = await supabase.rpc('add_trip_shopping_item', {
      p_trip_id: id,
      p_item_name: addName.trim(),
      p_quantity_needed: qty,
      p_store: addStore.trim() || null,
      p_notes: addNotes.trim() || null,
    });
    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setShowAdd(false);
      setAddName(''); setAddQty('1'); setAddStore(''); setAddNotes('');
      load();
    }
  }

  if (loading || !trip) {
    return <View style={styles.center}><ActivityIndicator color="#2d5a27" /></View>;
  }

  const unpurchased = items.filter(i => !i.is_purchased);
  const purchased = items.filter(i => i.is_purchased);
  const accent = currentUnit?.accent_color ?? '#2d5a27';

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={i => i.id}
        contentContainerStyle={[styles.list, { paddingBottom: 100 + insets.bottom }]}
        ListHeaderComponent={
          <View>
            {/* Trip info card */}
            <View style={styles.infoCard}>
              <Text style={styles.infoDate}>
                🗓 {fmt(trip.trip_date)}
                {trip.return_date && trip.return_date !== trip.trip_date ? ` – ${fmt(trip.return_date)}` : ''}
              </Text>
              {trip.headcount && <Text style={styles.infoMeta}>👥 {trip.headcount} people</Text>}
              {trip.notes && <Text style={styles.infoNotes}>{trip.notes}</Text>}

              {items.length > 0 && (
                <View style={styles.progressRow}>
                  <View style={styles.progressBg}>
                    <View style={[styles.progressFill, {
                      width: `${Math.round((purchased.length / items.length) * 100)}%` as any,
                      backgroundColor: accent,
                    }]} />
                  </View>
                  <Text style={styles.progressLabel}>{purchased.length}/{items.length}</Text>
                </View>
              )}
            </View>

            {unpurchased.length > 0 && (
              <Text style={styles.sectionHeader}>{unpurchased.length} item{unpurchased.length !== 1 ? 's' : ''} to get</Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, item.is_purchased && styles.cardDone]}
            onPress={() => toggle(item)}
            onLongPress={() => removeItem(item)}
          >
            <View style={[styles.checkbox, item.is_purchased && { backgroundColor: accent, borderColor: accent }]}>
              {item.is_purchased && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <View style={styles.cardBody}>
              <Text style={[styles.itemName, item.is_purchased && styles.strike]}>{item.item_name}</Text>
              <Text style={styles.itemMeta}>
                Qty: {item.quantity_needed}
                {item.store ? ` · ${item.store}` : ''}
                {item.notes ? ` · ${item.notes}` : ''}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📋</Text>
            <Text style={styles.emptyTitle}>No items yet</Text>
            <Text style={styles.emptySub}>Build the shopping list for this trip.</Text>
          </View>
        }
        ListFooterComponent={purchased.length > 0 ? (
          <Text style={[styles.sectionHeader, { marginTop: 24 }]}>Purchased ({purchased.length})</Text>
        ) : null}
      />

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: accent, bottom: 24 + insets.bottom }]}
        onPress={() => setShowAdd(true)}
      >
        <Text style={styles.fabText}>+ Add Item</Text>
      </TouchableOpacity>

      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet">
        <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.modalTitle}>Add to Trip List</Text>

          <Text style={styles.label}>Item</Text>
          <TextInput style={styles.input} value={addName} onChangeText={setAddName}
            placeholder="e.g. Hot dogs" placeholderTextColor="#aaa" autoFocus />

          <Text style={styles.label}>Quantity</Text>
          <TextInput style={styles.input} value={addQty} onChangeText={setAddQty}
            keyboardType="numeric" placeholderTextColor="#aaa" />

          <Text style={styles.label}>Store (optional)</Text>
          <TextInput style={styles.input} value={addStore} onChangeText={setAddStore}
            placeholder="e.g. Costco" placeholderTextColor="#aaa" />

          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput style={styles.input} value={addNotes} onChangeText={setAddNotes}
            placeholder="e.g. Get the family size" placeholderTextColor="#aaa" />

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: accent }, saving && styles.disabled]}
            onPress={addItem} disabled={saving}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Adding…' : 'Add to List'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAdd(false)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f0e8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f0e8' },
  list: { padding: 16 },
  infoCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  infoDate: { fontSize: 15, color: '#333', marginBottom: 4 },
  infoMeta: { fontSize: 14, color: '#666', marginBottom: 4 },
  infoNotes: { fontSize: 13, color: '#999', marginTop: 4, fontStyle: 'italic' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  progressBg: { flex: 1, height: 6, backgroundColor: '#eee', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  progressLabel: { fontSize: 12, color: '#aaa', width: 36, textAlign: 'right' },
  sectionHeader: { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, padding: 14, gap: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  cardDone: { opacity: 0.6 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#ccc', justifyContent: 'center', alignItems: 'center' },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  cardBody: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  strike: { textDecorationLine: 'line-through', color: '#aaa' },
  itemMeta: { fontSize: 13, color: '#999', marginTop: 2 },
  emptyState: { alignItems: 'center', paddingTop: 40 },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', marginBottom: 6 },
  emptySub: { fontSize: 14, color: '#888', textAlign: 'center', paddingHorizontal: 32 },
  fab: {
    position: 'absolute', left: 24, right: 24, padding: 16, borderRadius: 12,
    alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, elevation: 4,
  },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modal: { flex: 1, backgroundColor: '#f5f0e8' },
  modalContent: { padding: 24, paddingBottom: 60 },
  modalTitle: { fontSize: 22, fontWeight: '700', color: '#1a1a1a', marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 20 },
  input: { backgroundColor: '#fff', borderRadius: 10, padding: 14, fontSize: 16, color: '#1a1a1a', borderWidth: 1, borderColor: '#e0d8cc' },
  saveBtn: { padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 32 },
  disabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn: { padding: 16, alignItems: 'center', marginTop: 8 },
  cancelText: { color: '#888', fontSize: 15 },
});

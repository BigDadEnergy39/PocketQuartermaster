import { useCallback, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, TextInput, Modal, ScrollView,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { useUnit } from '../../src/context/UnitContext';
import { useShoppingList, ShoppingItem } from '../../src/hooks/useShoppingList';

const UNITS_OF_MEASURE = ['each', 'pack', 'box', 'bag', 'bottle', 'can', 'roll', 'pair', 'set', 'lb', 'oz', 'gallon'];

export default function Shopping() {
  const { currentUnit } = useUnit();
  const { items, loading, refetch } = useShoppingList(currentUnit?.id);
  const insets = useSafeAreaInsets();

  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addQty, setAddQty] = useState('1');
  const [addUnit, setAddUnit] = useState('each');
  const [addNotes, setAddNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useFocusEffect(useCallback(() => { refetch(); }, [currentUnit?.id]));

  const unpurchased = items.filter(i => !i.is_purchased);
  const purchased = items.filter(i => i.is_purchased);

  async function toggle(item: ShoppingItem) {
    await supabase.rpc('toggle_shopping_item_purchased', { p_id: item.id });
    refetch();
  }

  async function remove(item: ShoppingItem) {
    Alert.alert('Remove Item', `Remove "${item.item_name}" from the list?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          await supabase.rpc('remove_shopping_item', { p_id: item.id });
          refetch();
        },
      },
    ]);
  }

  async function clearPurchased() {
    Alert.alert('Clear Purchased', 'Remove all checked-off items from the list?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear', style: 'destructive', onPress: async () => {
          await supabase.rpc('clear_purchased_shopping_items', { p_unit_id: currentUnit!.id });
          refetch();
        },
      },
    ]);
  }

  async function addItem() {
    if (!addName.trim()) { Alert.alert('Name required'); return; }
    const qty = parseInt(addQty, 10);
    if (isNaN(qty) || qty < 1) { Alert.alert('Invalid quantity'); return; }

    setSaving(true);
    const { data: rpcData, error } = await supabase.rpc('add_to_shopping_list', {
      p_unit_id: currentUnit!.id,
      p_item_name: addName.trim(),
      p_quantity: qty,
      p_unit_of_measure: addUnit,
      p_notes: addNotes.trim() || null,
    });
    setSaving(false);

    if (error) {
      Alert.alert('Error adding item', error.message);
    } else {
      setShowAdd(false);
      setAddName(''); setAddQty('1'); setAddUnit('each'); setAddNotes('');
      await refetch();
    }
  }

  function renderItem({ item }: { item: ShoppingItem }) {
    return (
      <TouchableOpacity
        style={[styles.card, item.is_purchased && styles.cardPurchased]}
        onPress={() => toggle(item)}
        onLongPress={() => remove(item)}
      >
        <View style={[
          styles.checkbox,
          item.is_purchased && { backgroundColor: currentUnit?.accent_color ?? '#2d5a27', borderColor: currentUnit?.accent_color ?? '#2d5a27' },
        ]}>
          {item.is_purchased && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <View style={styles.cardBody}>
          <Text style={[styles.itemName, item.is_purchased && styles.strikethrough]}>
            {item.item_name}
          </Text>
          <Text style={styles.itemMeta}>
            {item.quantity} {item.unit_of_measure}{item.notes ? ` · ${item.notes}` : ''}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  if (!currentUnit) {
    return <View style={styles.center}><Text style={styles.empty}>No unit selected.</Text></View>;
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#2d5a27" /></View>;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={i => i.id}
        contentContainerStyle={[styles.list, { paddingBottom: 100 + insets.bottom }]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🛒</Text>
            <Text style={styles.emptyTitle}>List is empty</Text>
            <Text style={styles.emptySub}>Items marked low in inventory will appear here, or add one manually.</Text>
          </View>
        }
        ListHeaderComponent={unpurchased.length > 0
          ? <Text style={styles.sectionHeader}>{unpurchased.length} item{unpurchased.length !== 1 ? 's' : ''} to get</Text>
          : null
        }
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListFooterComponent={purchased.length > 0
          ? (
            <View style={styles.purchasedHeader}>
              <Text style={styles.sectionHeader}>Purchased ({purchased.length})</Text>
              <TouchableOpacity onPress={clearPurchased}>
                <Text style={styles.clearBtn}>Clear</Text>
              </TouchableOpacity>
            </View>
          )
          : null
        }
      />

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: currentUnit.accent_color, bottom: 24 + insets.bottom }]}
        onPress={() => setShowAdd(true)}
      >
        <Text style={styles.fabText}>+ Add Item</Text>
      </TouchableOpacity>

      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet">
        <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.modalTitle}>Add to Shopping List</Text>

          <Text style={styles.label}>Item Name</Text>
          <TextInput
            style={styles.input}
            value={addName}
            onChangeText={setAddName}
            placeholder="e.g. Paper Towels"
            placeholderTextColor="#aaa"
            autoFocus
          />

          <Text style={styles.label}>Quantity</Text>
          <TextInput
            style={styles.input}
            value={addQty}
            onChangeText={setAddQty}
            keyboardType="numeric"
            placeholderTextColor="#aaa"
          />

          <Text style={styles.label}>Unit</Text>
          <View style={styles.chipRow}>
            {UNITS_OF_MEASURE.map(u => (
              <TouchableOpacity
                key={u}
                style={[styles.chip, addUnit === u && styles.chipSelected]}
                onPress={() => setAddUnit(u)}
              >
                <Text style={[styles.chipText, addUnit === u && styles.chipTextSelected]}>{u}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            style={styles.input}
            value={addNotes}
            onChangeText={setAddNotes}
            placeholder="e.g. Get the large size"
            placeholderTextColor="#aaa"
          />

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: currentUnit.accent_color }, saving && styles.disabled]}
            onPress={addItem}
            disabled={saving}
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
  sectionHeader: { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, marginTop: 8 },
  purchasedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 },
  clearBtn: { color: '#c0392b', fontSize: 13, fontWeight: '600' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardPurchased: { opacity: 0.6 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  cardBody: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  strikethrough: { textDecorationLine: 'line-through', color: '#aaa' },
  itemMeta: { fontSize: 13, color: '#999', marginTop: 2 },
  sep: { height: 8 },
  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 8 },
  emptySub: { fontSize: 14, color: '#888', textAlign: 'center', paddingHorizontal: 32 },
  empty: { color: '#999' },
  fab: {
    position: 'absolute',
    left: 24, right: 24,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modal: { flex: 1, backgroundColor: '#f5f0e8' },
  modalContent: { padding: 24, paddingBottom: 60 },
  modalTitle: { fontSize: 22, fontWeight: '700', color: '#1a1a1a', marginBottom: 24 },
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
  cancelBtn: { padding: 16, alignItems: 'center', marginTop: 8 },
  cancelText: { color: '#888', fontSize: 15 },
});

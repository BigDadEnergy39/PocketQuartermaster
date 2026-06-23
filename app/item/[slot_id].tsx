import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, Alert,
  ScrollView, Modal,
} from 'react-native';
import { useLocalSearchParams, router, useNavigation, useFocusEffect } from 'expo-router';
import ExpirationDatePicker from '../../src/components/ExpirationDatePicker';
import { supabase } from '../../src/lib/supabase';
import { useUnit } from '../../src/context/UnitContext';

interface ExpirationLot {
  id: string;
  quantity: number;
  expiration_date: string;
  days_until: number;
}

function lotColor(days: number): string {
  if (days < 0) return '#c0392b';
  if (days <= 7) return '#c0392b';
  if (days <= 30) return '#e67e22';
  return '#2d5a27';
}

function lotLabel(days: number): string {
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  if (days <= 30) return `Expires in ${days}d`;
  const weeks = Math.round(days / 7);
  return `Expires in ~${weeks}w`;
}

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

  const [lots, setLots] = useState<ExpirationLot[]>([]);
  const [lotsLoaded, setLotsLoaded] = useState(false);

  // Add lot modal state
  const [showAddLot, setShowAddLot] = useState(false);
  const [lotQty, setLotQty] = useState('1');
  const [lotDate, setLotDate] = useState(new Date());
  const [addingLot, setAddingLot] = useState(false);

  const accent = currentUnit?.accent_color ?? '#2d5a27';

  async function loadItem() {
    if (!slot_id) return;
    const { data } = await supabase
      .from('item_slots')
      .select(`id, expected_quantity, items(id, name, category, unit_of_measure, min_quantity, is_perishable), containers(id, name)`)
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

  async function loadLots() {
    if (!slot_id) return;
    const { data } = await supabase.rpc('get_expiration_lots', { p_slot_id: slot_id });
    if (data) setLots(data);
    setLotsLoaded(true);
  }

  useEffect(() => { loadItem(); loadLots(); }, [slot_id]);
  useFocusEffect(useCallback(() => { loadItem(); loadLots(); }, [slot_id]));

  useEffect(() => {
    if (!item) return;
    navigation.setOptions({
      title: item.items?.name ?? 'Item Detail',
      headerRight: () => (
        <TouchableOpacity onPress={() => router.push(`/item/edit?slot_id=${slot_id}`)} style={{ marginRight: 16 }}>
          <Text style={{ color: accent, fontSize: 15, fontWeight: '600' }}>Edit</Text>
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
      // If perishable and no lots recorded yet, offer to add one
      if (item?.items?.is_perishable && lots.length === 0) {
        setTimeout(() => {
          Alert.alert(
            'Add Expiration Date?',
            'This item tracks expiration dates. Want to log a batch now?',
            [
              { text: 'Skip', style: 'cancel', onPress: () => router.back() },
              { text: 'Add Date', onPress: () => { setSaved(false); setShowAddLot(true); } },
            ]
          );
        }, 300);
      } else {
        setTimeout(() => router.back(), 800);
      }
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

  async function submitLot() {
    const qty = parseInt(lotQty, 10);
    if (isNaN(qty) || qty < 1) { Alert.alert('Invalid quantity', 'Enter a positive number.'); return; }
    setAddingLot(true);
    // Local YYYY-MM-DD — toISOString() would shift the day in timezones behind UTC.
    const dateStr = `${lotDate.getFullYear()}-${String(lotDate.getMonth() + 1).padStart(2, '0')}-${String(lotDate.getDate()).padStart(2, '0')}`;
    const { error } = await supabase.rpc('add_expiration_lot', {
      p_slot_id: slot_id,
      p_expiration_date: dateStr,
      p_quantity: qty,
    });
    setAddingLot(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setShowAddLot(false);
    setLotQty('1');
    setLotDate(new Date());
    await loadLots();
    if (saved) setTimeout(() => router.back(), 400);
  }

  function confirmClearLot(lot: ExpirationLot) {
    const dateStr = new Date(lot.expiration_date).toLocaleDateString();
    Alert.alert(
      'Clear Lot',
      `Mark the "${dateStr}" batch (qty ${lot.quantity}) as used?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => clearLot(lot.id) },
      ]
    );
  }

  async function clearLot(lotId: string) {
    await supabase.rpc('clear_expiration_lot', { p_lot_id: lotId });
    await loadLots();
  }

  if (!loaded) return null;
  if (!item) return (
    <View style={styles.center}><Text style={styles.err}>Item not found.</Text></View>
  );

  const current = item.current_quantity;
  const expected = item.expected_quantity;
  const unit = item.items.unit_of_measure;
  const isPerishable = item.items.is_perishable;
  const isLow = current !== null && current < expected && current <= (item.items.min_quantity ?? Math.ceil(expected * 0.25));
  const needsRestock = isLow || current === 0;

  const expiredLots = lots.filter(l => l.days_until < 0);
  const urgentLots = lots.filter(l => l.days_until >= 0 && l.days_until <= 7);
  const hasUrgent = expiredLots.length > 0 || urgentLots.length > 0;

  return (
    <>
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
            style={[styles.updateBtn, { backgroundColor: saved ? '#2d5a27' : accent }, saving && styles.disabled]}
            onPress={updateQty}
            disabled={saving || saved}
          >
            <Text style={styles.updateBtnText}>{saving ? '…' : saved ? '✓' : 'Record'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput
          style={styles.notesInput}
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

        {/* Expiration section — only shown for perishable items */}
        {isPerishable && (
          <>
            <View style={styles.expirationHeader}>
              <Text style={styles.label}>Expiration Dates</Text>
              <TouchableOpacity onPress={() => setShowAddLot(true)}>
                <Text style={[styles.addLotLink, { color: accent }]}>+ Add Lot</Text>
              </TouchableOpacity>
            </View>

            {hasUrgent && (
              <View style={styles.urgentBanner}>
                <Text style={styles.urgentText}>
                  ⚠️{expiredLots.length > 0 ? ` ${expiredLots.length} expired` : ''}{expiredLots.length > 0 && urgentLots.length > 0 ? ',' : ''}{urgentLots.length > 0 ? ` ${urgentLots.length} expiring this week` : ''}
                </Text>
              </View>
            )}

            {lotsLoaded && lots.length === 0 && (
              <Text style={styles.noLots}>No expiration lots recorded.</Text>
            )}

            {lots.map(lot => {
              const color = lotColor(lot.days_until);
              const dateStr = new Date(lot.expiration_date).toLocaleDateString();
              return (
                <View key={lot.id} style={styles.lotRow}>
                  <View style={[styles.lotDot, { backgroundColor: color }]} />
                  <View style={styles.lotBody}>
                    <Text style={styles.lotDate}>{dateStr}</Text>
                    <Text style={[styles.lotUrgency, { color }]}>{lotLabel(lot.days_until)}</Text>
                  </View>
                  <Text style={styles.lotQty}>Qty: {lot.quantity}</Text>
                  <TouchableOpacity onPress={() => confirmClearLot(lot)} style={styles.clearBtn}>
                    <Text style={styles.clearBtnText}>Clear</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* Add Lot Modal */}
      <Modal visible={showAddLot} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Add Expiration Lot</Text>

            <Text style={styles.modalLabel}>Quantity</Text>
            <TextInput
              style={styles.modalInput}
              value={lotQty}
              onChangeText={setLotQty}
              keyboardType="numeric"
              placeholder="e.g. 2"
              placeholderTextColor="#aaa"
            />

            <Text style={styles.modalLabel}>Expiration Date</Text>
            <ExpirationDatePicker value={lotDate} onChange={setLotDate} minimumDate={new Date()} />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => { setShowAddLot(false); if (saved) setTimeout(() => router.back(), 200); }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSave, { backgroundColor: accent }, addingLot && styles.disabled]}
                onPress={submitLot}
                disabled={addingLot}
              >
                <Text style={styles.modalSaveText}>{addingLot ? 'Saving…' : 'Save Lot'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
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
  expirationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 28 },
  addLotLink: { fontSize: 14, fontWeight: '700' },
  urgentBanner: { backgroundColor: '#fdf0ee', borderRadius: 8, padding: 10, marginBottom: 10 },
  urgentText: { color: '#c0392b', fontSize: 13, fontWeight: '700' },
  noLots: { fontSize: 13, color: '#aaa', marginBottom: 8 },
  lotRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 10, padding: 12, marginBottom: 8, gap: 10,
    borderWidth: 1, borderColor: '#e0d8cc',
  },
  lotDot: { width: 10, height: 10, borderRadius: 5 },
  lotBody: { flex: 1 },
  lotDate: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  lotUrgency: { fontSize: 12, marginTop: 2 },
  lotQty: { fontSize: 13, color: '#888' },
  clearBtn: { backgroundColor: '#f5f0e8', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  clearBtnText: { fontSize: 12, color: '#888', fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1a1a1a', marginBottom: 20 },
  modalLabel: { fontSize: 13, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 16 },
  modalInput: { backgroundColor: '#f5f0e8', borderRadius: 10, padding: 14, fontSize: 20, color: '#1a1a1a' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  modalCancel: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center', backgroundColor: '#f5f0e8' },
  modalCancelText: { color: '#666', fontWeight: '600', fontSize: 15 },
  modalSave: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center' },
  modalSaveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

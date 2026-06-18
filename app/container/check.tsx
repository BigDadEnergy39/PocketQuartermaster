import { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, Modal, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useUnit } from '../../src/context/UnitContext';
import { useContainerItems, SlotWithItem } from '../../src/hooks/useContainerItems';

type CheckState = 'unchecked' | 'checked' | 'adjusted';

interface ItemCheck {
  slot_id: string;
  item_name: string;
  expected_quantity: number;
  unit_of_measure: string;
  min_quantity: number | null;
  state: CheckState;
  quantity: number;   // what we'll record
  editing: boolean;
}

export default function ContainerCheck() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currentUnit } = useUnit();
  const { items, loading } = useContainerItems(id);
  const insets = useSafeAreaInsets();

  const [checks, setChecks] = useState<ItemCheck[]>([]);
  const [saving, setSaving] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const editRef = useRef<TextInput>(null);

  const accent = currentUnit?.accent_color ?? '#2d5a27';

  useEffect(() => {
    if (items.length > 0) {
      setChecks(
        [...items]
          .sort((a, b) => a.item_name.localeCompare(b.item_name))
          .map(i => ({
            slot_id: i.slot_id,
            item_name: i.item_name,
            expected_quantity: i.expected_quantity,
            unit_of_measure: i.unit_of_measure,
            min_quantity: i.min_quantity,
            state: 'unchecked',
            quantity: i.expected_quantity,
            editing: false,
          }))
      );
    }
  }, [items]);

  function tapItem(slot_id: string) {
    setChecks(prev => prev.map(c => {
      if (c.slot_id !== slot_id) return { ...c, editing: false };
      if (c.state === 'unchecked') {
        return { ...c, state: 'checked', quantity: c.expected_quantity, editing: false };
      }
      if (c.state === 'checked' || c.state === 'adjusted') {
        // Toggle editing
        return { ...c, editing: !c.editing };
      }
      return c;
    }));
    setTimeout(() => editRef.current?.focus(), 100);
  }

  function uncheckItem(slot_id: string) {
    setChecks(prev => prev.map(c =>
      c.slot_id === slot_id ? { ...c, state: 'unchecked', quantity: c.expected_quantity, editing: false } : c
    ));
  }

  function commitQty(slot_id: string, text: string) {
    const qty = parseInt(text, 10);
    setChecks(prev => prev.map(c => {
      if (c.slot_id !== slot_id) return c;
      if (isNaN(qty) || qty < 0) return { ...c, editing: false };
      const state: CheckState = qty === 0 ? 'unchecked' : qty !== c.expected_quantity ? 'adjusted' : 'checked';
      return { ...c, state, quantity: qty === 0 ? c.expected_quantity : qty, editing: false };
    }));
  }

  const checkedCount = checks.filter(c => c.state !== 'unchecked').length;
  const total = checks.length;
  const missing = checks.filter(c => c.state === 'unchecked');
  const adjusted = checks.filter(c => c.state === 'adjusted');

  async function finish() {
    setSaving(true);
    const toRecord = checks.filter(c => c.state !== 'unchecked');
    for (const c of toRecord) {
      await supabase.rpc('record_quantity', {
        p_slot_id: c.slot_id,
        p_quantity: c.quantity,
        p_notes: c.state === 'adjusted' ? `Contents check — adjusted from expected ${c.expected_quantity}` : null,
      });
    }
    // Record missing items as 0
    for (const c of missing) {
      await supabase.rpc('record_quantity', {
        p_slot_id: c.slot_id,
        p_quantity: 0,
        p_notes: 'Contents check — not found',
      });
    }
    setSaving(false);
    setShowSummary(true);
  }

  async function addMissingToShopping() {
    if (!currentUnit) return;
    for (const c of missing) {
      await supabase.rpc('add_to_shopping_list', {
        p_unit_id: currentUnit.id,
        p_item_name: c.item_name,
        p_quantity: c.expected_quantity,
        p_unit_of_measure: c.unit_of_measure,
        p_notes: 'Missing from contents check',
      });
    }
    Alert.alert('Added', `${missing.length} item${missing.length !== 1 ? 's' : ''} added to the shopping list.`);
    setShowSummary(false);
    router.back();
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={accent} /></View>;
  }

  const progress = total > 0 ? checkedCount / total : 0;

  return (
    <>
      <View style={styles.container}>
        {/* Progress bar */}
        <View style={styles.progressBg}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` as any, backgroundColor: accent }]} />
        </View>
        <Text style={styles.progressLabel}>{checkedCount} of {total} checked</Text>

        <FlatList
          data={checks}
          keyExtractor={c => c.slot_id}
          contentContainerStyle={[styles.list, { paddingBottom: 120 + insets.bottom }]}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item: c }) => {
            const isChecked = c.state !== 'unchecked';
            const color = c.state === 'unchecked' ? '#aaa' : c.state === 'adjusted' ? '#e67e22' : accent;

            return (
              <TouchableOpacity
                style={[styles.card, isChecked && styles.cardChecked]}
                onPress={() => tapItem(c.slot_id)}
                onLongPress={() => uncheckItem(c.slot_id)}
                delayLongPress={400}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, isChecked && { backgroundColor: color, borderColor: color }]}>
                  {isChecked && <Text style={styles.checkmark}>✓</Text>}
                </View>

                <View style={styles.cardBody}>
                  <Text style={[styles.itemName, isChecked && styles.itemNameChecked]}>
                    {c.item_name}
                  </Text>
                  {c.editing ? (
                    <TextInput
                      ref={editRef}
                      style={styles.inlineInput}
                      defaultValue={String(c.quantity)}
                      keyboardType="numeric"
                      returnKeyType="done"
                      onEndEditing={e => commitQty(c.slot_id, e.nativeEvent.text)}
                      onSubmitEditing={e => commitQty(c.slot_id, e.nativeEvent.text)}
                      selectTextOnFocus
                    />
                  ) : (
                    <Text style={[styles.qtyLabel, { color }]}>
                      {c.state === 'unchecked'
                        ? `Expected: ${c.expected_quantity} ${c.unit_of_measure}`
                        : `${c.quantity} / ${c.expected_quantity} ${c.unit_of_measure}`}
                    </Text>
                  )}
                </View>

                {isChecked && !c.editing && (
                  <Text style={styles.hint}>tap to adjust · hold to uncheck</Text>
                )}
              </TouchableOpacity>
            );
          }}
        />

        <View style={[styles.footer, { paddingBottom: 16 + insets.bottom }]}>
          {missing.length > 0 && (
            <Text style={styles.missingWarning}>
              {missing.length} item{missing.length !== 1 ? 's' : ''} not checked
            </Text>
          )}
          <TouchableOpacity
            style={[styles.finishBtn, { backgroundColor: accent }, saving && styles.disabled]}
            onPress={finish}
            disabled={saving}
          >
            <Text style={styles.finishBtnText}>{saving ? 'Recording…' : 'Finish Check ✓'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Summary Modal */}
      <Modal visible={showSummary} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Check Complete</Text>

            <View style={styles.scorePills}>
              <View style={[styles.pill, { backgroundColor: '#e8f5e9' }]}>
                <Text style={[styles.pillNum, { color: '#2d5a27' }]}>{checkedCount}</Text>
                <Text style={styles.pillLabel}>Found</Text>
              </View>
              {adjusted.length > 0 && (
                <View style={[styles.pill, { backgroundColor: '#fff3e0' }]}>
                  <Text style={[styles.pillNum, { color: '#e67e22' }]}>{adjusted.length}</Text>
                  <Text style={styles.pillLabel}>Adjusted</Text>
                </View>
              )}
              {missing.length > 0 && (
                <View style={[styles.pill, { backgroundColor: '#fdecea' }]}>
                  <Text style={[styles.pillNum, { color: '#c0392b' }]}>{missing.length}</Text>
                  <Text style={styles.pillLabel}>Missing</Text>
                </View>
              )}
            </View>

            {missing.length > 0 && (
              <>
                <Text style={styles.missingHeader}>Missing Items</Text>
                <ScrollView style={styles.missingList}>
                  {missing.map(c => (
                    <View key={c.slot_id} style={styles.missingRow}>
                      <Text style={styles.missingName}>{c.item_name}</Text>
                      <Text style={styles.missingQty}>{c.expected_quantity} {c.unit_of_measure}</Text>
                    </View>
                  ))}
                </ScrollView>
                <TouchableOpacity
                  style={[styles.shoppingBtn, { borderColor: '#e67e22' }]}
                  onPress={addMissingToShopping}
                >
                  <Text style={styles.shoppingBtnText}>🛒 Add Missing to Shopping List</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={[styles.doneBtn, { backgroundColor: accent }]}
              onPress={() => { setShowSummary(false); router.back(); }}
            >
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f0e8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  progressBg: { height: 4, backgroundColor: '#e0d8cc' },
  progressFill: { height: 4 },
  progressLabel: { textAlign: 'right', fontSize: 12, color: '#aaa', paddingRight: 16, paddingTop: 6, paddingBottom: 4 },
  list: { padding: 16 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, padding: 14, gap: 12,
    borderWidth: 1.5, borderColor: '#e0d8cc',
  },
  cardChecked: { borderColor: 'transparent', backgroundColor: '#f8fdf8' },
  checkbox: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 2,
    borderColor: '#ccc', alignItems: 'center', justifyContent: 'center',
  },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '800' },
  cardBody: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: '600', color: '#555' },
  itemNameChecked: { color: '#1a1a1a' },
  qtyLabel: { fontSize: 12, marginTop: 2, fontWeight: '600' },
  inlineInput: {
    fontSize: 18, fontWeight: '700', color: '#1a1a1a',
    borderBottomWidth: 2, borderBottomColor: '#2d5a27',
    paddingVertical: 2, marginTop: 2, minWidth: 60,
  },
  hint: { fontSize: 10, color: '#bbb', textAlign: 'right', flexShrink: 1 },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, backgroundColor: '#f5f0e8',
    borderTopWidth: 1, borderTopColor: '#e8e0d4',
  },
  missingWarning: { textAlign: 'center', color: '#c0392b', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  finishBtn: { padding: 16, borderRadius: 12, alignItems: 'center' },
  finishBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.6 },
  // Summary modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 36, maxHeight: '80%' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1a1a1a', marginBottom: 20 },
  scorePills: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  pill: { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center' },
  pillNum: { fontSize: 28, fontWeight: '800' },
  pillLabel: { fontSize: 11, color: '#888', marginTop: 2, fontWeight: '600' },
  missingHeader: { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  missingList: { maxHeight: 160, marginBottom: 16 },
  missingRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0ebe3' },
  missingName: { fontSize: 14, color: '#1a1a1a', fontWeight: '500' },
  missingQty: { fontSize: 13, color: '#888' },
  shoppingBtn: {
    borderWidth: 1.5, borderRadius: 10, padding: 14,
    alignItems: 'center', marginBottom: 12,
  },
  shoppingBtnText: { color: '#e67e22', fontSize: 15, fontWeight: '700' },
  doneBtn: { padding: 16, borderRadius: 12, alignItems: 'center' },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});

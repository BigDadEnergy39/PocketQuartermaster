import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  Alert, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useUnit } from '../../src/context/UnitContext';

interface AuditItem {
  container_id: string;
  container_name: string;
  container_type: string;
  slot_id: string;
  item_name: string;
  category: string | null;
  unit_of_measure: string;
  expected_quantity: number;
  current_quantity: number | null;
  min_quantity: number | null;
}

const TYPE_EMOJI: Record<string, string> = {
  tote: '📦', shelf: '🗄️', stuff_sack: '🎒', compartment: '🗃️', cooler: '🧊', bag: '👜', other: '📫',
};

export default function AuditConduct() {
  const { audit_id } = useLocalSearchParams<{ audit_id: string }>();
  const { currentUnit } = useUnit();
  const inputRef = useRef<TextInput>(null);

  const [items, setItems] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});  // slot_id → count
  const [currentInput, setCurrentInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [newContainer, setNewContainer] = useState(true);

  const accent = currentUnit?.accent_color ?? '#2d5a27';

  useEffect(() => {
    if (!currentUnit) return;
    supabase.rpc('get_audit_items', { p_unit_id: currentUnit.id }).then(({ data }) => {
      if (data) {
        setItems(data);
        // Pre-fill with last known quantities
        const pre: Record<string, number> = {};
        data.forEach((i: AuditItem) => {
          if (i.current_quantity != null) pre[i.slot_id] = i.current_quantity;
        });
        setCounts(pre);
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (items.length === 0) return;
    const current = items[step];
    const prev = step > 0 ? items[step - 1] : null;
    setNewContainer(!prev || prev.container_id !== current.container_id);
    // Pre-fill input with existing count for this item
    setCurrentInput(counts[current.slot_id] != null ? String(counts[current.slot_id]) : '');
    setTimeout(() => inputRef.current?.focus(), 150);
  }, [step, items.length]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={accent} /></View>;
  if (items.length === 0) return <View style={styles.center}><Text style={styles.empty}>No items to audit.</Text></View>;

  const current = items[step];
  const total = items.length;
  const progress = step / total;

  async function submitCount(skip = false) {
    const qty = skip ? (counts[current.slot_id] ?? 0) : parseInt(currentInput, 10);
    if (!skip && (isNaN(qty) || qty < 0)) {
      Alert.alert('Invalid count', 'Enter 0 or a positive number, or skip this item.');
      return;
    }

    setSaving(true);
    if (!skip) {
      await supabase.rpc('record_audit_item', {
        p_audit_id: audit_id,
        p_slot_id: current.slot_id,
        p_expected_qty: current.expected_quantity,
        p_actual_qty: qty,
      });
      setCounts(prev => ({ ...prev, [current.slot_id]: qty }));
    }
    setSaving(false);

    if (step + 1 >= total) {
      finishAudit();
    } else {
      setStep(s => s + 1);
    }
  }

  async function finishAudit() {
    await supabase.rpc('complete_audit', { p_audit_id: audit_id });
    router.replace(`/audit/summary?audit_id=${audit_id}`);
  }

  function goBack() {
    if (step === 0) {
      Alert.alert('Quit Audit', 'Abandon this audit? Counts recorded so far are saved.', [
        { text: 'Keep Going', style: 'cancel' },
        { text: 'Quit', style: 'destructive', onPress: () => router.replace('/(tabs)') },
      ]);
    } else {
      setStep(s => s - 1);
    }
  }

  const isLow = (qty: number) => qty < current.expected_quantity && qty <= (current.min_quantity ?? Math.ceil(current.expected_quantity * 0.25));
  const parsedQty = parseInt(currentInput, 10);
  const qtyColor = isNaN(parsedQty) ? '#aaa' : parsedQty === 0 ? '#c0392b' : isLow(parsedQty) ? '#e67e22' : '#2d5a27';

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Progress bar */}
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` as any, backgroundColor: accent }]} />
      </View>
      <Text style={styles.progressLabel}>{step + 1} of {total}</Text>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Container header — shown when switching containers */}
        {newContainer && (
          <View style={[styles.containerHeader, { borderLeftColor: accent }]}>
            <Text style={styles.containerHeaderEmoji}>{TYPE_EMOJI[current.container_type] ?? '📦'}</Text>
            <Text style={styles.containerHeaderName}>{current.container_name}</Text>
          </View>
        )}

        {/* Item card */}
        <View style={styles.itemCard}>
          {current.category && <Text style={styles.category}>{current.category}</Text>}
          <Text style={styles.itemName}>{current.item_name}</Text>
          <Text style={styles.expected}>Expected: {current.expected_quantity} {current.unit_of_measure}</Text>

          {current.current_quantity != null && (
            <Text style={styles.lastCount}>Last count: {current.current_quantity}</Text>
          )}
        </View>

        {/* Count input */}
        <Text style={styles.countLabel}>How many do you see?</Text>
        <View style={styles.inputRow}>
          <TextInput
            ref={inputRef}
            style={[styles.countInput, { borderColor: isNaN(parsedQty) ? '#e0d8cc' : qtyColor }]}
            value={currentInput}
            onChangeText={setCurrentInput}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor="#ccc"
            returnKeyType="done"
            onSubmitEditing={() => submitCount()}
          />
          <Text style={styles.unitLabel}>{current.unit_of_measure}</Text>
        </View>

        {!isNaN(parsedQty) && parsedQty !== current.expected_quantity && (
          <View style={[styles.discrepancy, { backgroundColor: parsedQty === 0 ? '#fdf0ee' : '#fdf6ee' }]}>
            <Text style={[styles.discrepancyText, { color: parsedQty === 0 ? '#c0392b' : '#e67e22' }]}>
              {parsedQty === 0 ? '⚠️ Out of stock' : parsedQty < current.expected_quantity ? `⬇️ ${current.expected_quantity - parsedQty} short` : `⬆️ ${parsedQty - current.expected_quantity} over`}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.backBtn} onPress={goBack}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.skipBtn} onPress={() => submitCount(true)}>
          <Text style={styles.skipBtnText}>Skip</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: accent }, saving && styles.disabled]}
          onPress={() => submitCount()}
          disabled={saving}
        >
          <Text style={styles.nextBtnText}>
            {saving ? '…' : step + 1 >= total ? 'Finish ✓' : 'Next →'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f0e8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { color: '#999' },
  progressBg: { height: 4, backgroundColor: '#e0d8cc' },
  progressFill: { height: 4 },
  progressLabel: { textAlign: 'right', fontSize: 12, color: '#aaa', paddingRight: 16, paddingTop: 6 },
  content: { padding: 24, paddingBottom: 24 },
  containerHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderLeftWidth: 4, paddingLeft: 12, marginBottom: 20,
  },
  containerHeaderEmoji: { fontSize: 22 },
  containerHeaderName: { fontSize: 16, fontWeight: '700', color: '#555' },
  itemCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
    marginBottom: 28,
  },
  category: { fontSize: 12, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  itemName: { fontSize: 24, fontWeight: '800', color: '#1a1a1a', marginBottom: 8 },
  expected: { fontSize: 14, color: '#888' },
  lastCount: { fontSize: 13, color: '#bbb', marginTop: 4 },
  countLabel: { fontSize: 14, fontWeight: '700', color: '#555', marginBottom: 10 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  countInput: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, borderWidth: 2,
    padding: 16, fontSize: 36, fontWeight: '700', color: '#1a1a1a', textAlign: 'center',
  },
  unitLabel: { fontSize: 16, color: '#888', width: 60 },
  discrepancy: { borderRadius: 10, padding: 12, alignItems: 'center' },
  discrepancyText: { fontSize: 15, fontWeight: '700' },
  actions: {
    flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 32,
    borderTopWidth: 1, borderTopColor: '#e8e0d4', backgroundColor: '#f5f0e8',
  },
  backBtn: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#e8e0d4' },
  backBtnText: { color: '#666', fontWeight: '600' },
  skipBtn: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#e8e0d4' },
  skipBtnText: { color: '#666', fontWeight: '600' },
  nextBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  nextBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  disabled: { opacity: 0.6 },
});

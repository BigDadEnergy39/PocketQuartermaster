import { useState, useEffect, useRef } from 'react';
import {
  View, Text, SectionList, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator,
} from 'react-native';
import { showAlert } from '../../src/lib/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

type CheckState = 'unchecked' | 'checked' | 'adjusted';

interface ItemCheck extends AuditItem {
  state: CheckState;
  quantity: number;
  editing: boolean;
}

const TYPE_EMOJI: Record<string, string> = {
  tote: '📦', shelf: '🗄️', stuff_sack: '🎒', compartment: '🗃️', cooler: '🧊', bag: '👜', other: '📫',
};

export default function AuditConduct() {
  const { audit_id } = useLocalSearchParams<{ audit_id: string }>();
  const { currentUnit } = useUnit();
  const insets = useSafeAreaInsets();
  const editRef = useRef<TextInput>(null);

  const [checks, setChecks] = useState<ItemCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const accent = currentUnit?.accent_color ?? '#2d5a27';

  useEffect(() => {
    if (!currentUnit) return;
    supabase.rpc('get_audit_items', { p_unit_id: currentUnit.id }).then(({ data }) => {
      if (data) {
        setChecks(data.map((i: AuditItem) => ({
          ...i,
          state: 'unchecked' as CheckState,
          quantity: i.expected_quantity,
          editing: false,
        })));
      }
      setLoading(false);
    });
  }, []);

  function tapItem(slot_id: string) {
    setChecks(prev => prev.map(c => {
      if (c.slot_id !== slot_id) return { ...c, editing: false };
      if (c.state === 'unchecked') {
        return { ...c, state: 'checked', quantity: c.expected_quantity, editing: false };
      }
      return { ...c, editing: !c.editing };
    }));
    setTimeout(() => editRef.current?.focus(), 100);
  }

  function uncheckItem(slot_id: string) {
    setChecks(prev => prev.map(c =>
      c.slot_id === slot_id
        ? { ...c, state: 'unchecked', quantity: c.expected_quantity, editing: false }
        : c
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
  const progress = total > 0 ? checkedCount / total : 0;

  // Build sections grouped by container, preserving order from RPC
  const sections = (() => {
    const order: string[] = [];
    const groups: Record<string, ItemCheck[]> = {};
    checks.forEach(c => {
      if (!groups[c.container_id]) { groups[c.container_id] = []; order.push(c.container_id); }
      groups[c.container_id].push(c);
    });
    return order.map(cid => ({
      container_id: cid,
      container_name: groups[cid][0].container_name,
      container_type: groups[cid][0].container_type,
      data: groups[cid],
    }));
  })();

  async function finish() {
    const unchecked = checks.filter(c => c.state === 'unchecked');
    if (unchecked.length > 0) {
      showAlert(
        `${unchecked.length} item${unchecked.length !== 1 ? 's' : ''} not counted`,
        'Uncounted items will be skipped in the summary. Continue?',
        [
          { text: 'Keep Counting', style: 'cancel' },
          { text: 'Finish Anyway', onPress: doFinish },
        ]
      );
    } else {
      doFinish();
    }
  }

  async function doFinish() {
    setSaving(true);
    for (const c of checks) {
      if (c.state === 'unchecked') continue;
      await supabase.rpc('record_audit_item', {
        p_audit_id: audit_id,
        p_slot_id: c.slot_id,
        p_expected_qty: c.expected_quantity,
        p_actual_qty: c.quantity,
      });
    }
    await supabase.rpc('complete_audit', { p_audit_id: audit_id });
    setSaving(false);
    router.replace(`/audit/summary?audit_id=${audit_id}`);
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={accent} /></View>;
  if (checks.length === 0) return <View style={styles.center}><Text style={styles.empty}>No items to audit.</Text></View>;

  return (
    <View style={styles.container}>
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` as any, backgroundColor: accent }]} />
      </View>
      <Text style={styles.progressLabel}>{checkedCount} of {total} counted</Text>

      <SectionList
        sections={sections}
        keyExtractor={c => c.slot_id}
        contentContainerStyle={[styles.list, { paddingBottom: 120 + insets.bottom }]}
        stickySectionHeadersEnabled={false}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { borderLeftColor: accent }]}>
            <Text style={styles.sectionEmoji}>{TYPE_EMOJI[section.container_type] ?? '📦'}</Text>
            <Text style={styles.sectionName}>{section.container_name}</Text>
            <Text style={styles.sectionCount}>
              {section.data.filter((i: ItemCheck) => i.state !== 'unchecked').length}/{section.data.length}
            </Text>
          </View>
        )}
        renderSectionFooter={() => <View style={{ height: 16 }} />}
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
                {c.category && <Text style={styles.categoryLabel}>{c.category}</Text>}
                <Text style={[styles.itemName, isChecked && styles.itemNameChecked]}>{c.item_name}</Text>
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
        {checkedCount < total && (
          <Text style={styles.remainingNote}>
            {total - checkedCount} item{total - checkedCount !== 1 ? 's' : ''} remaining
          </Text>
        )}
        <TouchableOpacity
          style={[styles.finishBtn, { backgroundColor: accent }, saving && styles.disabled]}
          onPress={finish}
          disabled={saving}
        >
          <Text style={styles.finishBtnText}>
            {saving ? 'Saving…' : checkedCount === total ? 'Finish Audit ✓' : 'Finish Audit'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f0e8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { color: '#999' },
  progressBg: { height: 4, backgroundColor: '#e0d8cc' },
  progressFill: { height: 4 },
  progressLabel: { textAlign: 'right', fontSize: 12, color: '#aaa', paddingRight: 16, paddingTop: 6, paddingBottom: 4 },
  list: { padding: 16 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderLeftWidth: 4, paddingLeft: 10, marginBottom: 10, marginTop: 4,
  },
  sectionEmoji: { fontSize: 18 },
  sectionName: { flex: 1, fontSize: 15, fontWeight: '700', color: '#444' },
  sectionCount: { fontSize: 12, color: '#aaa', fontWeight: '600' },
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
  categoryLabel: { fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 },
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
  remainingNote: { textAlign: 'center', fontSize: 13, color: '#aaa', marginBottom: 8 },
  finishBtn: { padding: 16, borderRadius: 12, alignItems: 'center' },
  finishBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.6 },
});

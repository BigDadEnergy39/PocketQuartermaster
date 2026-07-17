import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { showAlert } from '../../src/lib/alert';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { useUnit } from '../../src/context/UnitContext';

interface LineItem {
  slot_id: string;
  item_name: string;
  container_name: string;
  expected_quantity: number;
  actual_quantity: number | null;
  unit_of_measure: string;
  min_quantity: number | null;
}

export default function AuditSummary() {
  const { audit_id } = useLocalSearchParams<{ audit_id: string }>();
  const { currentUnit } = useUnit();
  const insets = useSafeAreaInsets();

  const [lines, setLines] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingAll, setAddingAll] = useState(false);

  const accent = currentUnit?.accent_color ?? '#2d5a27';

  useEffect(() => {
    supabase
      .from('audit_line_items')
      .select(`
        slot_id, expected_quantity, actual_quantity,
        item_slots!inner(
          items!inner(name, unit_of_measure, min_quantity),
          containers!inner(name)
        )
      `)
      .eq('audit_id', audit_id)
      .then(({ data }) => {
        if (data) {
          setLines(data.map((l: any) => ({
            slot_id: l.slot_id,
            item_name: l.item_slots.items.name,
            container_name: l.item_slots.containers.name,
            expected_quantity: l.expected_quantity,
            actual_quantity: l.actual_quantity,
            unit_of_measure: l.item_slots.items.unit_of_measure,
            min_quantity: l.item_slots.items.min_quantity,
          })));
        }
        setLoading(false);
      });
  }, [audit_id]);

  function isLow(line: LineItem) {
    if (line.actual_quantity == null) return false;
    return line.actual_quantity < line.expected_quantity &&
      line.actual_quantity <= (line.min_quantity ?? Math.ceil(line.expected_quantity * 0.25));
  }

  const outOfStock = lines.filter(l => l.actual_quantity === 0);
  const low = lines.filter(l => l.actual_quantity != null && l.actual_quantity > 0 && isLow(l));
  const ok = lines.filter(l => l.actual_quantity != null && !isLow(l));
  const skipped = lines.filter(l => l.actual_quantity == null);

  async function addLowToShopping() {
    if (!currentUnit) return;
    const needRestock = [...outOfStock, ...low];
    setAddingAll(true);
    for (const line of needRestock) {
      const needed = Math.max(1, line.expected_quantity - (line.actual_quantity ?? 0));
      await supabase.rpc('add_to_shopping_list', {
        p_unit_id: currentUnit.id,
        p_item_name: line.item_name,
        p_quantity: needed,
        p_unit_of_measure: line.unit_of_measure,
        p_notes: `Audit · ${line.container_name}`,
      });
    }
    setAddingAll(false);
    showAlert('Added to Shopping List', `${needRestock.length} item${needRestock.length !== 1 ? 's' : ''} added.`);
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={accent} /></View>;

  const needRestock = outOfStock.length + low.length;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 100 + insets.bottom }]}>

        {/* Score card */}
        <View style={[styles.scoreBanner, { backgroundColor: accent }]}>
          <Text style={styles.scoreTitle}>Audit Complete ✓</Text>
          <View style={styles.scoreRow}>
            <View style={styles.scoreBlock}>
              <Text style={styles.scoreNum}>{ok.length}</Text>
              <Text style={styles.scoreLabel}>Good</Text>
            </View>
            <View style={styles.scoreBlock}>
              <Text style={styles.scoreNum}>{low.length}</Text>
              <Text style={styles.scoreLabel}>Low</Text>
            </View>
            <View style={styles.scoreBlock}>
              <Text style={styles.scoreNum}>{outOfStock.length}</Text>
              <Text style={styles.scoreLabel}>Out</Text>
            </View>
            {skipped.length > 0 && (
              <View style={styles.scoreBlock}>
                <Text style={styles.scoreNum}>{skipped.length}</Text>
                <Text style={styles.scoreLabel}>Skipped</Text>
              </View>
            )}
          </View>
        </View>

        {/* Add all low items to shopping */}
        {needRestock > 0 && (
          <TouchableOpacity
            style={[styles.addAllBtn, addingAll && styles.disabled]}
            onPress={addLowToShopping}
            disabled={addingAll}
          >
            <Text style={styles.addAllText}>
              {addingAll ? 'Adding…' : `🛒 Add ${needRestock} item${needRestock !== 1 ? 's' : ''} to Shopping List`}
            </Text>
          </TouchableOpacity>
        )}

        {/* Out of stock */}
        {outOfStock.length > 0 && (
          <>
            <Text style={styles.sectionHeader}>Out of Stock ({outOfStock.length})</Text>
            {outOfStock.map(l => <LineRow key={l.slot_id} line={l} color="#c0392b" />)}
          </>
        )}

        {/* Low */}
        {low.length > 0 && (
          <>
            <Text style={styles.sectionHeader}>Low Stock ({low.length})</Text>
            {low.map(l => <LineRow key={l.slot_id} line={l} color="#e67e22" />)}
          </>
        )}

        {/* OK */}
        {ok.length > 0 && (
          <>
            <Text style={styles.sectionHeader}>Good ({ok.length})</Text>
            {ok.map(l => <LineRow key={l.slot_id} line={l} color="#2d5a27" />)}
          </>
        )}

        {/* Skipped */}
        {skipped.length > 0 && (
          <>
            <Text style={styles.sectionHeader}>Skipped ({skipped.length})</Text>
            {skipped.map(l => <LineRow key={l.slot_id} line={l} color="#aaa" />)}
          </>
        )}
      </ScrollView>

      <TouchableOpacity
        style={[styles.doneBtn, { backgroundColor: accent, bottom: 24 + insets.bottom }]}
        onPress={() => router.replace('/(tabs)')}
      >
        <Text style={styles.doneBtnText}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}

function LineRow({ line, color }: { line: LineItem; color: string }) {
  return (
    <View style={styles.lineRow}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={styles.lineBody}>
        <Text style={styles.lineName}>{line.item_name}</Text>
        <Text style={styles.lineMeta}>{line.container_name}</Text>
      </View>
      <Text style={[styles.lineQty, { color }]}>
        {line.actual_quantity ?? '—'} / {line.expected_quantity}
        {' '}{line.unit_of_measure}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f0e8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16 },
  scoreBanner: { borderRadius: 16, padding: 20, marginBottom: 16 },
  scoreTitle: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 16 },
  scoreRow: { flexDirection: 'row', gap: 8 },
  scoreBlock: { flex: 1, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: 12, alignItems: 'center' },
  scoreNum: { fontSize: 28, fontWeight: '800', color: '#fff' },
  scoreLabel: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2, fontWeight: '600' },
  addAllBtn: {
    backgroundColor: '#fff8ee', borderWidth: 1.5, borderColor: '#e67e22',
    borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 24,
  },
  addAllText: { color: '#e67e22', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.6 },
  sectionHeader: { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 16 },
  lineRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 6,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  lineBody: { flex: 1 },
  lineName: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  lineMeta: { fontSize: 12, color: '#aaa', marginTop: 1 },
  lineQty: { fontSize: 13, fontWeight: '700' },
  doneBtn: {
    position: 'absolute', left: 24, right: 24,
    padding: 16, borderRadius: 12, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, elevation: 4,
  },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});

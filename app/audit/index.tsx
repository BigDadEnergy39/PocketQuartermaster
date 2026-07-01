import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { showAlert } from '../../src/lib/alert';
import { router } from 'expo-router';
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

interface ContainerGroup {
  container_id: string;
  container_name: string;
  container_type: string;
  items: AuditItem[];
}

const TYPE_EMOJI: Record<string, string> = {
  tote: '📦', shelf: '🗄️', stuff_sack: '🎒', compartment: '🗃️', cooler: '🧊', bag: '👜', other: '📫',
};

export default function AuditStart() {
  const { currentUnit } = useUnit();
  const [items, setItems] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!currentUnit) return;
    supabase.rpc('get_audit_items', { p_unit_id: currentUnit.id }).then(({ data, error }) => {
      if (!error && data) setItems(data);
      setLoading(false);
    });
  }, [currentUnit?.id]);

  // Group by container
  const containers: ContainerGroup[] = items.reduce((acc: ContainerGroup[], item) => {
    const existing = acc.find(c => c.container_id === item.container_id);
    if (existing) { existing.items.push(item); }
    else acc.push({ container_id: item.container_id, container_name: item.container_name, container_type: item.container_type, items: [item] });
    return acc;
  }, []);

  async function startAudit() {
    if (!currentUnit) return;
    if (items.length === 0) { showAlert('No items', 'Add items to containers before running an audit.'); return; }
    setStarting(true);
    const { data: auditId, error } = await supabase.rpc('start_audit', { p_unit_id: currentUnit.id });
    setStarting(false);
    if (error) { showAlert('Error', error.message); return; }
    router.push(`/audit/conduct?audit_id=${auditId}`);
  }

  if (!currentUnit) return null;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={[styles.banner, { backgroundColor: currentUnit.accent_color }]}>
        <Text style={styles.bannerTitle}>📋 Inventory Audit</Text>
        <Text style={styles.bannerSub}>
          Walk through each container and confirm what's actually there. Counts update live and low items get flagged.
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={currentUnit.accent_color} style={{ marginTop: 32 }} />
      ) : (
        <>
          <Text style={styles.sectionHeader}>What you'll count</Text>
          {containers.length === 0 ? (
            <Text style={styles.empty}>No containers with items yet. Add some inventory first.</Text>
          ) : (
            containers.map(c => (
              <View key={c.container_id} style={styles.containerRow}>
                <Text style={styles.containerEmoji}>{TYPE_EMOJI[c.container_type] ?? '📦'}</Text>
                <View style={styles.containerInfo}>
                  <Text style={styles.containerName}>{c.container_name}</Text>
                  <Text style={styles.containerCount}>{c.items.length} item{c.items.length !== 1 ? 's' : ''}</Text>
                </View>
              </View>
            ))
          )}

          <View style={styles.summary}>
            <Text style={styles.summaryText}>
              {containers.length} container{containers.length !== 1 ? 's' : ''} · {items.length} item{items.length !== 1 ? 's' : ''} to count
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.startBtn, { backgroundColor: currentUnit.accent_color }, (starting || items.length === 0) && styles.disabled]}
            onPress={startAudit}
            disabled={starting || items.length === 0}
          >
            <Text style={styles.startBtnText}>{starting ? 'Starting…' : 'Start Audit'}</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f5f0e8' },
  content: { padding: 16, paddingBottom: 60 },
  banner: { borderRadius: 14, padding: 20, marginBottom: 24 },
  bannerTitle: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 8 },
  bannerSub: { fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 20 },
  sectionHeader: { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  containerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  containerEmoji: { fontSize: 24 },
  containerInfo: { flex: 1 },
  containerName: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  containerCount: { fontSize: 13, color: '#999', marginTop: 2 },
  summary: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginTop: 8, marginBottom: 24, alignItems: 'center' },
  summaryText: { fontSize: 14, color: '#666', fontWeight: '500' },
  startBtn: { padding: 18, borderRadius: 12, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 3 },
  startBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  empty: { color: '#aaa', fontSize: 14, textAlign: 'center', marginTop: 24 },
});

import { useEffect, useCallback, useState, useMemo } from 'react';
import { View, Text, SectionList, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useNavigation, useFocusEffect } from 'expo-router';
import { useContainerItems, SlotWithItem } from '../../src/hooks/useContainerItems';
import { useSubcontainers, SubcontainerSummary } from '../../src/hooks/useSubcontainers';
import { useUnit } from '../../src/context/UnitContext';
import { supabase } from '../../src/lib/supabase';
import { showAlert, showPrompt } from '../../src/lib/alert';

const TYPE_EMOJI: Record<string, string> = {
  tote: '📦', shelf: '🗄️', stuff_sack: '🎒', compartment: '🗃️', cooler: '🧊', bag: '👜', other: '📫',
};

function statusColor(current: number | null, expected: number, min: number | null): string {
  if (current === null) return '#aaa';
  if (current === 0) return '#c0392b';
  const threshold = min ?? Math.ceil(expected * 0.25);
  if (current < expected && current <= threshold) return '#e67e22';
  return '#2d5a27';
}

function statusLabel(current: number | null, expected: number, unit: string): string {
  if (current === null) return 'Not counted';
  return `${current} / ${expected} ${unit}`;
}

function ItemCard({ item }: { item: SlotWithItem }) {
  const color = statusColor(item.current_quantity, item.expected_quantity, item.min_quantity);
  const label = statusLabel(item.current_quantity, item.expected_quantity, item.unit_of_measure);
  const isLow = item.current_quantity !== null &&
    item.current_quantity < item.expected_quantity &&
    item.current_quantity <= (item.min_quantity ?? Math.ceil(item.expected_quantity * 0.25));

  return (
    <TouchableOpacity style={styles.card} onPress={() => router.push(`/item/${item.slot_id}`)}>
      <View style={[styles.indicator, { backgroundColor: color }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardRow}>
          <Text style={styles.itemName}>{item.item_name}</Text>
          {isLow && item.current_quantity !== null && (
            <View style={styles.lowBadge}><Text style={styles.lowText}>LOW</Text></View>
          )}
        </View>
        <Text style={[styles.qty, { color }]}>{label}</Text>
      </View>
      <Text style={styles.arrow}>›</Text>
    </TouchableOpacity>
  );
}

function SubcontainerCard({
  sub, expanded, onToggle, onChanged,
}: {
  sub: SubcontainerSummary;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const { items, loading, refetch } = useContainerItems(expanded ? sub.id : undefined);

  useEffect(() => { if (expanded) refetch(); }, [expanded]);

  function rename() {
    showPrompt(
      'Rename Subcontainer',
      'New name:',
      async (newName: string) => {
        if (!newName?.trim()) return;
        const { error } = await supabase.rpc('edit_container', {
          p_container_id: sub.id,
          p_name: newName.trim(),
          p_type: sub.type,
          p_purpose: sub.purpose,
          p_notes: sub.notes,
        });
        if (error) { showAlert('Error', error.message); return; }
        onChanged();
      },
      sub.name,
    );
  }

  function confirmDelete() {
    showAlert(
      'Delete Subcontainer',
      `Remove "${sub.name}"? Its item list will be archived. Quantity history is preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            const { error } = await supabase.rpc('delete_container', { p_container_id: sub.id });
            if (error) { showAlert('Error', error.message); return; }
            onChanged();
          },
        },
      ]
    );
  }

  return (
    <View style={styles.subCard}>
      <TouchableOpacity style={styles.subCardHeader} onPress={onToggle} activeOpacity={0.7}>
        <Text style={styles.subCardEmoji}>{TYPE_EMOJI[sub.type] ?? '📫'}</Text>
        <View style={styles.subCardBody}>
          <Text style={styles.subCardName}>{sub.name}</Text>
          <Text style={styles.subCardMeta}>{sub.item_count} {sub.item_count === 1 ? 'item' : 'items'}</Text>
        </View>
        <TouchableOpacity onPress={rename} hitSlop={8} style={styles.subCardAction}>
          <Text style={styles.subCardActionText}>✏️</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={confirmDelete} hitSlop={8} style={styles.subCardAction}>
          <Text style={styles.subCardActionText}>🗑</Text>
        </TouchableOpacity>
        <Text style={styles.subCardArrow}>{expanded ? '︿' : '﹀'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.subCardContent}>
          {loading ? (
            <ActivityIndicator style={{ paddingVertical: 12 }} />
          ) : items.length === 0 ? (
            <Text style={styles.subCardEmpty}>No items yet.</Text>
          ) : (
            [...items]
              .sort((a, b) => a.item_name.localeCompare(b.item_name))
              .map(item => <ItemCard key={item.slot_id} item={item} />)
          )}
          <TouchableOpacity
            style={styles.subCardAddItem}
            onPress={() => router.push(`/item/add?container_id=${sub.id}`)}
          >
            <Text style={styles.subCardAddItemText}>+ Add Item</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function ContainerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currentUnit } = useUnit();
  const { items, loading, refetch } = useContainerItems(id);
  const { subcontainers, refetch: refetchSubcontainers } = useSubcontainers(id);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [groupByCategory, setGroupByCategory] = useState(false);
  const [containerName, setContainerName] = useState('Container');
  const [linkedGroupName, setLinkedGroupName] = useState<string | null>(null);
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());

  const accent = currentUnit?.accent_color ?? '#2d5a27';

  useFocusEffect(useCallback(() => { refetch(); refetchSubcontainers(); }, [id]));

  function toggleSub(subId: string) {
    setExpandedSubs(prev => {
      const next = new Set(prev);
      if (next.has(subId)) next.delete(subId); else next.add(subId);
      return next;
    });
  }

  useEffect(() => {
    if (!id) return;
    supabase.from('containers').select('name, group_id').eq('id', id).single()
      .then(({ data }) => {
        if (!data) return;
        setContainerName(data.name);
        if (!data.group_id) { setLinkedGroupName(null); return; }
        supabase.from('container_groups').select('name').eq('id', data.group_id).single()
          .then(({ data: g }) => setLinkedGroupName(g?.name ?? null));
      });
  }, [id]);

  useEffect(() => {
    navigation.setOptions({
      title: containerName,
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 16, marginRight: 16 }}>
          <TouchableOpacity onPress={() => router.push(`/container/check?id=${id}`)}>
            <Text style={{ color: accent, fontSize: 15, fontWeight: '600' }}>Contents Check</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push(`/container/edit?id=${id}`)}>
            <Text style={{ color: accent, fontSize: 15, fontWeight: '600' }}>Edit</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [id, currentUnit, containerName]);

  // Build section data for category view
  const sections = useMemo(() => {
    const groups: Record<string, SlotWithItem[]> = {};
    [...items]
      .sort((a, b) => a.item_name.localeCompare(b.item_name))
      .forEach(item => {
        const key = item.category ?? 'Uncategorized';
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
      });
    return Object.keys(groups).sort().map(key => ({ title: key, data: groups[key] }));
  }, [items]);

  const sortedItems = useMemo(() =>
    [...items].sort((a, b) => a.item_name.localeCompare(b.item_name)),
    [items]
  );

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={accent} /></View>;
  }

  const hasCategories = items.some(i => i.category);

  const emptyComponent = (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>🗂️</Text>
      <Text style={styles.emptyTitle}>No items yet</Text>
      <Text style={styles.emptySub}>Add items to track what belongs in this container.</Text>
    </View>
  );

  const fab = (
    <TouchableOpacity
      style={[styles.fab, { backgroundColor: accent, bottom: 24 + insets.bottom }]}
      onPress={() => router.push(`/item/add?container_id=${id}`)}
    >
      <Text style={styles.fabText}>+ Add Item</Text>
    </TouchableOpacity>
  );

  const subcontainersSection = (
    <View style={styles.subSection}>
      <View style={styles.subSectionHeader}>
        <Text style={styles.subSectionTitle}>Subcontainers</Text>
        <TouchableOpacity onPress={() => router.push(`/container/add?parent_id=${id}`)}>
          <Text style={[styles.subSectionAdd, { color: accent }]}>+ Add Subcontainer</Text>
        </TouchableOpacity>
      </View>
      {subcontainers.map(sub => (
        <SubcontainerCard
          key={sub.id}
          sub={sub}
          expanded={expandedSubs.has(sub.id)}
          onToggle={() => toggleSub(sub.id)}
          onChanged={() => { refetchSubcontainers(); }}
        />
      ))}
    </View>
  );

  const toggleBar = hasCategories ? (
    <View style={styles.toggleBar}>
      <TouchableOpacity
        style={[styles.toggleBtn, !groupByCategory && { backgroundColor: accent }]}
        onPress={() => setGroupByCategory(false)}
      >
        <Text style={[styles.toggleText, !groupByCategory && styles.toggleTextActive]}>A–Z</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.toggleBtn, groupByCategory && { backgroundColor: accent }]}
        onPress={() => setGroupByCategory(true)}
      >
        <Text style={[styles.toggleText, groupByCategory && styles.toggleTextActive]}>Category</Text>
      </TouchableOpacity>
    </View>
  ) : null;

  return (
    <View style={styles.container}>
      {linkedGroupName && (
        <TouchableOpacity
          style={styles.linkedBanner}
          onPress={() => router.push(`/container/edit?id=${id}`)}
        >
          <Text style={styles.linkedBannerText}>🔗 Linked: {linkedGroupName}</Text>
        </TouchableOpacity>
      )}
      {groupByCategory && hasCategories ? (
        <SectionList
          sections={sections}
          keyExtractor={s => s.slot_id}
          contentContainerStyle={[styles.list, { paddingBottom: 100 + insets.bottom }]}
          ListHeaderComponent={toggleBar}
          ListFooterComponent={subcontainersSection}
          ListEmptyComponent={emptyComponent}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item }) => <ItemCard item={item} />}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          SectionSeparatorComponent={() => <View style={{ height: 4 }} />}
        />
      ) : (
        <FlatList
          data={sortedItems}
          keyExtractor={s => s.slot_id}
          contentContainerStyle={[styles.list, { paddingBottom: 100 + insets.bottom }]}
          ListHeaderComponent={toggleBar}
          ListFooterComponent={subcontainersSection}
          ListEmptyComponent={emptyComponent}
          renderItem={({ item }) => <ItemCard item={item} />}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}
      {fab}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f0e8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f0e8' },
  linkedBanner: { paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#eef4fb' },
  linkedBannerText: { fontSize: 13, fontWeight: '600', color: '#1a5276' },
  list: { padding: 16 },
  toggleBar: {
    flexDirection: 'row',
    backgroundColor: '#e8e0d4',
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
  },
  toggleBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
  },
  toggleText: { fontSize: 13, fontWeight: '600', color: '#888' },
  toggleTextActive: { color: '#fff' },
  sectionHeader: {
    paddingVertical: 6, paddingHorizontal: 4, marginTop: 8,
  },
  sectionHeaderText: {
    fontSize: 12, fontWeight: '800', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, padding: 16, gap: 12,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  indicator: { width: 6, height: 48, borderRadius: 3 },
  cardBody: { flex: 1 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemName: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  qty: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  arrow: { fontSize: 22, color: '#ccc' },
  lowBadge: { backgroundColor: '#e67e22', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  lowText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 8 },
  emptySub: { fontSize: 14, color: '#888', textAlign: 'center', paddingHorizontal: 32 },
  fab: {
    position: 'absolute', left: 24, right: 24, padding: 16, borderRadius: 12,
    alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, elevation: 4,
  },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  subSection: { marginTop: 24, paddingBottom: 8 },
  subSectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
  },
  subSectionTitle: {
    fontSize: 12, fontWeight: '800', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  subSectionAdd: { fontSize: 13, fontWeight: '700' },
  subCard: {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 10,
    borderWidth: 1, borderColor: '#e0d8cc', overflow: 'hidden',
  },
  subCardHeader: {
    flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10,
  },
  subCardEmoji: { fontSize: 22 },
  subCardBody: { flex: 1 },
  subCardName: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  subCardMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  subCardAction: { paddingHorizontal: 4 },
  subCardActionText: { fontSize: 16 },
  subCardArrow: { fontSize: 14, color: '#aaa', marginLeft: 2 },
  subCardContent: {
    paddingHorizontal: 14, paddingBottom: 14, gap: 8,
    borderTopWidth: 1, borderTopColor: '#f0ebe3',
  },
  subCardEmpty: { fontSize: 13, color: '#aaa', paddingVertical: 12, textAlign: 'center' },
  subCardAddItem: {
    padding: 10, borderRadius: 10, alignItems: 'center', marginTop: 4,
    borderWidth: 1.5, borderColor: '#e0d8cc', borderStyle: 'dashed',
  },
  subCardAddItemText: { fontSize: 13, fontWeight: '700', color: '#666' },
});

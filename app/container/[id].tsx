import { useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useNavigation, useFocusEffect } from 'expo-router';
import { useContainerItems } from '../../src/hooks/useContainerItems';
import { useUnit } from '../../src/context/UnitContext';

function statusColor(current: number | null, expected: number, min: number | null): string {
  if (current === null) return '#aaa';
  if (current === 0) return '#c0392b';
  const threshold = min ?? Math.ceil(expected * 0.25);
  if (current <= threshold) return '#e67e22';
  return '#2d5a27';
}

function statusLabel(current: number | null, expected: number, unit: string): string {
  if (current === null) return 'Not counted';
  return `${current} / ${expected} ${unit}`;
}

export default function ContainerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currentUnit } = useUnit();
  const { items, loading, refetch } = useContainerItems(id);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  useFocusEffect(useCallback(() => { refetch(); }, [id]));

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => router.push(`/container/edit?id=${id}`)} style={{ marginRight: 16 }}>
          <Text style={{ color: currentUnit?.accent_color ?? '#2d5a27', fontSize: 15, fontWeight: '600' }}>Edit</Text>
        </TouchableOpacity>
      ),
    });
  }, [id, currentUnit]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#2d5a27" /></View>;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={s => s.slot_id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🗂️</Text>
            <Text style={styles.emptyTitle}>No items yet</Text>
            <Text style={styles.emptySub}>Add items to track what belongs in this container.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const color = statusColor(item.current_quantity, item.expected_quantity, item.min_quantity);
          const label = statusLabel(item.current_quantity, item.expected_quantity, item.unit_of_measure);
          const isLow = item.current_quantity !== null &&
            item.current_quantity <= (item.min_quantity ?? Math.ceil(item.expected_quantity * 0.25));

          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/item/${item.slot_id}`)}
            >
              <View style={[styles.indicator, { backgroundColor: color }]} />
              <View style={styles.cardBody}>
                <View style={styles.cardRow}>
                  <Text style={styles.itemName}>{item.item_name}</Text>
                  {isLow && item.current_quantity !== null && (
                    <View style={styles.lowBadge}>
                      <Text style={styles.lowText}>LOW</Text>
                    </View>
                  )}
                </View>
                {item.category && (
                  <Text style={styles.category}>{item.category}</Text>
                )}
                <Text style={[styles.qty, { color }]}>{label}</Text>
              </View>
              <Text style={styles.arrow}>›</Text>
            </TouchableOpacity>
          );
        }}
      />

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: currentUnit?.accent_color ?? '#2d5a27', bottom: 24 + insets.bottom }]}
        onPress={() => router.push(`/item/add?container_id=${id}`)}
      >
        <Text style={styles.fabText}>+ Add Item</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f0e8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f0e8' },
  list: { padding: 16, paddingBottom: 100 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  indicator: { width: 6, height: 48, borderRadius: 3 },
  cardBody: { flex: 1 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemName: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  category: { fontSize: 12, color: '#999', marginTop: 2 },
  qty: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  arrow: { fontSize: 22, color: '#ccc' },
  lowBadge: { backgroundColor: '#e67e22', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  lowText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 8 },
  emptySub: { fontSize: 14, color: '#888', textAlign: 'center', paddingHorizontal: 32 },
  fab: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

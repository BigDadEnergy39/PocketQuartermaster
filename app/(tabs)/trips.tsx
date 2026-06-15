import { useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUnit } from '../../src/context/UnitContext';
import { useTrips, Trip } from '../../src/hooks/useTrips';

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function tripStatus(trip: Trip): { label: string; color: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tripDate = new Date(trip.trip_date + 'T00:00:00');
  const returnDate = trip.return_date ? new Date(trip.return_date + 'T00:00:00') : tripDate;

  if (today >= tripDate && today <= returnDate) return { label: 'Active', color: '#2d5a27' };
  if (today > returnDate) return { label: 'Past', color: '#aaa' };
  return { label: 'Upcoming', color: '#1a5276' };
}

export default function Trips() {
  const { currentUnit } = useUnit();
  const { trips, loading, refetch } = useTrips(currentUnit?.id);
  const insets = useSafeAreaInsets();

  useFocusEffect(useCallback(() => { refetch(); }, [currentUnit?.id]));

  if (!currentUnit) {
    return <View style={styles.center}><Text style={styles.empty}>No unit selected.</Text></View>;
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#2d5a27" /></View>;
  }

  const upcoming = trips.filter(t => tripStatus(t).label !== 'Past');
  const past = trips.filter(t => tripStatus(t).label === 'Past');

  function renderTrip({ item }: { item: Trip }) {
    const status = tripStatus(item);
    const progress = item.shopping_item_count > 0
      ? Math.round((item.purchased_count / item.shopping_item_count) * 100)
      : null;

    return (
      <TouchableOpacity style={styles.card} onPress={() => router.push(`/trip/${item.id}`)}>
        <View style={styles.cardTop}>
          <Text style={styles.tripName}>{item.name}</Text>
          <View style={[styles.statusBadge, { backgroundColor: status.color }]}>
            <Text style={styles.statusText}>{status.label}</Text>
          </View>
        </View>

        <Text style={styles.tripDate}>
          🗓 {formatDate(item.trip_date)}
          {item.return_date && item.return_date !== item.trip_date
            ? ` – ${formatDate(item.return_date)}`
            : ''}
        </Text>

        {item.headcount && (
          <Text style={styles.tripMeta}>👥 {item.headcount} people</Text>
        )}

        {progress !== null && (
          <View style={styles.progressRow}>
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, { width: `${progress}%` as any, backgroundColor: currentUnit.accent_color }]} />
            </View>
            <Text style={styles.progressLabel}>{item.purchased_count}/{item.shopping_item_count} items</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={[...upcoming, ...past]}
        keyExtractor={t => t.id}
        contentContainerStyle={[styles.list, { paddingBottom: 100 + insets.bottom }]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🏕️</Text>
            <Text style={styles.emptyTitle}>No trips yet</Text>
            <Text style={styles.emptySub}>Plan your first camping trip and build a shopping list together.</Text>
          </View>
        }
        ListHeaderComponent={upcoming.length > 0
          ? <Text style={styles.sectionHeader}>Upcoming & Active</Text>
          : null
        }
        renderItem={renderTrip}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      />

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: currentUnit.accent_color, bottom: 24 + insets.bottom }]}
        onPress={() => router.push('/trip/add')}
      >
        <Text style={styles.fabText}>+ Plan a Trip</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f0e8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f0e8' },
  list: { padding: 16 },
  sectionHeader: { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  tripName: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', flex: 1, marginRight: 8 },
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  tripDate: { fontSize: 14, color: '#555', marginBottom: 4 },
  tripMeta: { fontSize: 13, color: '#888', marginBottom: 8 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  progressBg: { flex: 1, height: 6, backgroundColor: '#eee', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  progressLabel: { fontSize: 12, color: '#aaa', width: 70, textAlign: 'right' },
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
});

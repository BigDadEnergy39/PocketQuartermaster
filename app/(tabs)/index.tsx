import { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import { useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUnit } from '../../src/context/UnitContext';
import { useContainers } from '../../src/hooks/useContainers';

const PURPOSE_LABEL: Record<string, { label: string; color: string }> = {
  camping: { label: 'Camping', color: '#2d5a27' },
  storage: { label: 'Storage', color: '#8b6914' },
  both:    { label: 'Both',    color: '#1a5276' },
};

const TYPE_EMOJI: Record<string, string> = {
  tote:        '📦',
  shelf:       '🗄️',
  stuff_sack:  '🎒',
  compartment: '🗃️',
  cooler:      '🧊',
  bag:         '👜',
  other:       '📫',
};

interface Container { id: string; name: string; type: string; purpose: string; item_count: number; }

export default function Inventory() {
  const { currentUnit } = useUnit();
  const { containers, loading, refetch } = useContainers(currentUnit?.id);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [menuContainer, setMenuContainer] = useState<Container | null>(null);

  const accent = currentUnit?.accent_color ?? '#2d5a27';

  useFocusEffect(useCallback(() => { refetch(); }, [currentUnit?.id]));

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => router.push('/audit')} style={{ marginRight: 16 }}>
          <Text style={{ color: accent, fontSize: 15, fontWeight: '600' }}>Audit</Text>
        </TouchableOpacity>
      ),
    });
  }, [currentUnit]);

  function openMenu(container: Container) {
    setMenuContainer(container);
  }

  function closeMenu() { setMenuContainer(null); }

  if (!currentUnit) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>No unit selected.</Text>
      </View>
    );
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={accent} /></View>;
  }

  return (
    <>
      <View style={styles.container}>
        <FlatList
          data={containers}
          keyExtractor={c => c.id}
          contentContainerStyle={[styles.list, { paddingBottom: 100 + insets.bottom }]}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>📦</Text>
              <Text style={styles.emptyTitle}>No containers yet</Text>
              <Text style={styles.emptySub}>Add your first bin, tote, or shelf to get started.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const purpose = PURPOSE_LABEL[item.purpose] ?? { label: item.purpose, color: '#666' };
            const emoji = TYPE_EMOJI[item.type] ?? '📦';
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => router.push(`/container/${item.id}`)}
                onLongPress={() => openMenu(item)}
                delayLongPress={400}
              >
                <Text style={styles.cardEmoji}>{emoji}</Text>
                <View style={styles.cardBody}>
                  <Text style={styles.cardName}>{item.name}</Text>
                  <Text style={styles.cardMeta}>
                    {item.item_count} {item.item_count === 1 ? 'item' : 'items'}
                  </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: purpose.color }]}>
                  <Text style={styles.badgeText}>{purpose.label}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />

        <TouchableOpacity
          style={[styles.fab, { backgroundColor: accent, bottom: 24 + insets.bottom }]}
          onPress={() => router.push('/container/add')}
        >
          <Text style={styles.fabText}>+ Add Container</Text>
        </TouchableOpacity>
      </View>

      {/* Long-press action sheet */}
      <Modal visible={!!menuContainer} animationType="slide" transparent onRequestClose={closeMenu}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={closeMenu}>
          <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
            <View style={styles.sheetHandle} />
            {menuContainer && (
              <>
                <Text style={styles.sheetTitle}>{menuContainer.name}</Text>
                <Text style={styles.sheetSubtitle}>
                  {menuContainer.item_count} {menuContainer.item_count === 1 ? 'item' : 'items'} · {TYPE_EMOJI[menuContainer.type] ?? '📦'} {menuContainer.type.replace('_', ' ')}
                </Text>

                <TouchableOpacity style={styles.sheetAction} onPress={() => { closeMenu(); router.push(`/container/${menuContainer.id}`); }}>
                  <Text style={styles.sheetActionIcon}>🗂️</Text>
                  <Text style={styles.sheetActionText}>View Contents</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.sheetAction} onPress={() => { closeMenu(); router.push(`/container/check?id=${menuContainer.id}`); }}>
                  <Text style={styles.sheetActionIcon}>✅</Text>
                  <Text style={styles.sheetActionText}>Contents Check</Text>
                  <Text style={styles.sheetActionSub}>Quick pack checklist</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.sheetAction} onPress={() => { closeMenu(); router.push(`/container/edit?id=${menuContainer.id}`); }}>
                  <Text style={styles.sheetActionIcon}>✏️</Text>
                  <Text style={styles.sheetActionText}>Edit Container</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.sheetCancel} onPress={closeMenu}>
                  <Text style={styles.sheetCancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f0e8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f0e8' },
  list: { padding: 16 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, padding: 16, marginBottom: 10, gap: 12,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  cardEmoji: { fontSize: 28 },
  cardBody: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  cardMeta: { fontSize: 13, color: '#888', marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 8 },
  emptySub: { fontSize: 14, color: '#888', textAlign: 'center', paddingHorizontal: 32 },
  empty: { color: '#999' },
  fab: {
    position: 'absolute', left: 24, right: 24, padding: 16, borderRadius: 12,
    alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, elevation: 4,
  },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  // Action sheet
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  sheetHandle: { width: 36, height: 4, backgroundColor: '#e0d8cc', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#1a1a1a', marginBottom: 2 },
  sheetSubtitle: { fontSize: 13, color: '#888', marginBottom: 20, textTransform: 'capitalize' },
  sheetAction: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0ebe3',
  },
  sheetActionIcon: { fontSize: 22, width: 32, textAlign: 'center' },
  sheetActionText: { fontSize: 16, fontWeight: '600', color: '#1a1a1a', flex: 1 },
  sheetActionSub: { fontSize: 12, color: '#aaa' },
  sheetCancel: { paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  sheetCancelText: { fontSize: 16, color: '#888', fontWeight: '600' },
});

import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { showAlert } from '../../src/lib/alert';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useUnit } from '../../src/context/UnitContext';

interface GroupOption { id: string; name: string; member_count: number; }

export default function JoinContainerGroup() {
  const { container_id } = useLocalSearchParams<{ container_id: string }>();
  const { currentUnit } = useUnit();

  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);

  const accent = currentUnit?.accent_color ?? '#2d5a27';

  useEffect(() => {
    if (!currentUnit) return;
    supabase.rpc('get_container_groups', { p_unit_id: currentUnit.id })
      .then(({ data, error }) => {
        if (!error && data) setGroups(data);
        setLoading(false);
      });
  }, [currentUnit?.id]);

  function confirmJoin(group: GroupOption) {
    showAlert(
      'Join Linked Set',
      `This container's expected contents will be overwritten to match "${group.name}". Actual counted quantities stay independent.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Join', onPress: () => join(group.id) },
      ]
    );
  }

  async function join(groupId: string) {
    setJoining(groupId);
    const { error } = await supabase.rpc('join_container_group', {
      p_container_id: container_id,
      p_group_id: groupId,
    });
    setJoining(null);
    if (error) { showAlert('Error', error.message); return; }
    router.back();
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={accent} /></View>;
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        Pick an existing linked set to join. This container's expected contents will be overwritten
        to match the set — actual counted quantities stay independent per container.
      </Text>

      {groups.length === 0 ? (
        <Text style={styles.empty}>No linked sets exist yet in this unit.</Text>
      ) : (
        groups.map(g => (
          <TouchableOpacity
            key={g.id}
            style={[styles.row, joining === g.id && styles.disabled]}
            onPress={() => confirmJoin(g)}
            disabled={!!joining}
          >
            <View style={styles.rowBody}>
              <Text style={styles.rowText}>🔗 {g.name}</Text>
              <Text style={styles.rowMeta}>{g.member_count} container{g.member_count === 1 ? '' : 's'}</Text>
            </View>
            <Text style={styles.arrow}>{joining === g.id ? '…' : '›'}</Text>
          </TouchableOpacity>
        ))
      )}

      <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f5f0e8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f0e8' },
  content: { padding: 24, paddingBottom: 60 },
  intro: { fontSize: 13, color: '#666', lineHeight: 18, marginBottom: 16 },
  empty: { fontSize: 14, color: '#999', paddingVertical: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#e0d8cc',
  },
  disabled: { opacity: 0.6 },
  rowBody: { flex: 1 },
  rowText: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  rowMeta: { fontSize: 12, color: '#999', marginTop: 2 },
  arrow: { fontSize: 20, color: '#ccc' },
  cancelBtn: { padding: 16, alignItems: 'center', marginTop: 16 },
  cancelText: { color: '#888', fontSize: 15 },
});

import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { showAlert, showPrompt } from '../../src/lib/alert';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useUnit } from '../../src/context/UnitContext';

interface Member { id: string; name: string; type: string; purpose: string; item_count: number; }

const TYPE_EMOJI: Record<string, string> = {
  tote: '📦', shelf: '🗄️', stuff_sack: '🎒', compartment: '🗃️', cooler: '🧊', bag: '👜', other: '📫',
};

export default function ManageGroup() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currentUnit } = useUnit();
  const [name, setName] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [diverging, setDiverging] = useState<string | null>(null);

  const accent = currentUnit?.accent_color ?? '#2d5a27';

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      supabase.from('container_groups').select('name').eq('id', id).single(),
      supabase.rpc('get_container_group_members', { p_group_id: id }),
    ]).then(([groupRes, membersRes]) => {
      if (groupRes.data) setName(groupRes.data.name);
      if (membersRes.data) setMembers(membersRes.data);
      setLoading(false);
    });
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function renameGroup() {
    showPrompt(
      'Rename Linked Set',
      'New name:',
      async (newName: string) => {
        if (!newName?.trim()) return;
        const { error } = await supabase.rpc('rename_container_group', { p_group_id: id, p_name: newName.trim() });
        if (error) { showAlert('Error', error.message); return; }
        setName(newName.trim());
      },
      name,
    );
  }

  function confirmDiverge(member: Member) {
    showAlert(
      'Diverge',
      `"${member.name}" will become independent, keeping its current contents. It will no longer receive changes made to the rest of "${name}".`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Diverge', style: 'destructive', onPress: () => doDiverge(member.id) },
      ]
    );
  }

  async function doDiverge(containerId: string) {
    setDiverging(containerId);
    const { error } = await supabase.rpc('diverge_container', { p_container_id: containerId });
    setDiverging(null);
    if (error) { showAlert('Error', error.message); return; }
    if (members.length <= 2) {
      // The set dissolves once one member (or none) remains.
      router.back();
      return;
    }
    load();
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={accent} /></View>;
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.nameRow} onPress={renameGroup}>
        <Text style={styles.nameText}>{name}</Text>
        <Text style={[styles.renameHint, { color: accent }]}>✏️ Rename</Text>
      </TouchableOpacity>
      <Text style={styles.subtitle}>
        {members.length} linked container{members.length === 1 ? '' : 's'} · edits to expected contents on any one apply to all
      </Text>

      <FlatList
        data={members}
        keyExtractor={m => m.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <TouchableOpacity style={styles.cardBody} onPress={() => router.push(`/container/${item.id}`)}>
              <Text style={styles.cardEmoji}>{TYPE_EMOJI[item.type] ?? '📦'}</Text>
              <View style={styles.cardText}>
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.cardMeta}>{item.item_count} {item.item_count === 1 ? 'item' : 'items'}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.divergeBtn, diverging === item.id && styles.disabled]}
              onPress={() => confirmDiverge(item)}
              disabled={diverging === item.id}
            >
              <Text style={styles.divergeBtnText}>{diverging === item.id ? '…' : 'Diverge'}</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f0e8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f0e8' },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 4 },
  nameText: { fontSize: 20, fontWeight: '800', color: '#1a1a1a' },
  renameHint: { fontSize: 13, fontWeight: '600' },
  subtitle: { fontSize: 13, color: '#888', paddingHorizontal: 20, paddingBottom: 16, lineHeight: 18 },
  list: { padding: 16, paddingTop: 0 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, padding: 14, marginBottom: 10, gap: 12,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  cardBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardEmoji: { fontSize: 24 },
  cardText: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  cardMeta: { fontSize: 13, color: '#888', marginTop: 2 },
  divergeBtn: {
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8,
    borderWidth: 1.5, borderColor: '#e67e22',
  },
  divergeBtnText: { color: '#e67e22', fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.6 },
});

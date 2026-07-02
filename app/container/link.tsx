import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { showAlert } from '../../src/lib/alert';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useUnit } from '../../src/context/UnitContext';
import { useContainers } from '../../src/hooks/useContainers';

export default function LinkContainer() {
  const { source_id } = useLocalSearchParams<{ source_id: string }>();
  const { currentUnit } = useUnit();
  const { containers, loading } = useContainers(currentUnit?.id);

  const [sourceName, setSourceName] = useState('');
  const [sourceGroupId, setSourceGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (!source_id) return;
    supabase.from('containers').select('name, group_id').eq('id', source_id).single()
      .then(({ data }) => {
        if (data) {
          setSourceName(data.name);
          setSourceGroupId(data.group_id);
          setGroupName(prev => prev || data.name);
        }
      });
  }, [source_id]);

  const candidates = containers.filter(c =>
    c.id !== source_id && (c.group_id === null || c.group_id === sourceGroupId)
  );

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function save() {
    if (selected.size === 0) { showAlert('Pick at least one container to link.'); return; }
    setLinking(true);
    const { error } = await supabase.rpc('link_containers', {
      p_source_container_id: source_id,
      p_target_container_ids: Array.from(selected),
      p_group_name: groupName.trim() || null,
    });
    setLinking(false);
    if (error) { showAlert('Error', error.message); return; }
    router.back();
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={currentUnit?.accent_color ?? '#2d5a27'} /></View>;
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>
        Linking will overwrite the selected containers' expected contents to match "{sourceName}".
        Actual counted quantities stay independent for each container.
      </Text>

      <Text style={styles.label}>Linked Set Name</Text>
      <TextInput
        style={styles.input}
        value={groupName}
        onChangeText={setGroupName}
        placeholder="e.g. Patrol Box Standard"
        placeholderTextColor="#aaa"
      />

      <Text style={styles.label}>Containers to Link</Text>
      {candidates.length === 0 ? (
        <Text style={styles.empty}>No other containers available to link.</Text>
      ) : (
        candidates.map(c => {
          const isSelected = selected.has(c.id);
          return (
            <TouchableOpacity key={c.id} style={styles.row} onPress={() => toggle(c.id)}>
              <View style={[styles.checkbox, isSelected && { backgroundColor: currentUnit?.accent_color ?? '#2d5a27', borderColor: currentUnit?.accent_color ?? '#2d5a27' }]}>
                {isSelected && <Text style={styles.checkboxMark}>✓</Text>}
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowText}>{c.name}</Text>
                <Text style={styles.rowMeta}>
                  {c.item_count} {c.item_count === 1 ? 'item' : 'items'}
                  {c.group_name ? ` · Already linked: ${c.group_name}` : ''}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })
      )}

      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: currentUnit?.accent_color ?? '#2d5a27' }, (linking || selected.size === 0) && styles.disabled]}
        onPress={save}
        disabled={linking || selected.size === 0}
      >
        <Text style={styles.saveBtnText}>{linking ? 'Linking…' : 'Link Containers'}</Text>
      </TouchableOpacity>

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
  intro: { fontSize: 13, color: '#666', lineHeight: 18, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 20 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#e0d8cc',
  },
  empty: { fontSize: 14, color: '#999', paddingVertical: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#e0d8cc',
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#ccc',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxMark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  rowBody: { flex: 1 },
  rowText: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  rowMeta: { fontSize: 12, color: '#999', marginTop: 2 },
  saveBtn: { padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 32 },
  disabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn: { padding: 16, alignItems: 'center', marginTop: 8 },
  cancelText: { color: '#888', fontSize: 15 },
});

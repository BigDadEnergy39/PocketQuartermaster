import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { showAlert, showPrompt } from '../../src/lib/alert';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useUnit } from '../../src/context/UnitContext';

const CONTAINER_TYPES = ['tote', 'shelf', 'stuff_sack', 'compartment', 'cooler', 'bag', 'other'] as const;
const CONTAINER_PURPOSES = ['camping', 'storage', 'both'] as const;

const TYPE_EMOJI: Record<string, string> = {
  tote: '📦', shelf: '🗄️', stuff_sack: '🎒', compartment: '🗃️', cooler: '🧊', bag: '👜', other: '📫',
};
const TYPE_LABEL: Record<string, string> = {
  tote: 'Tote', shelf: 'Shelf', stuff_sack: 'Stuff Sack', compartment: 'Compartment',
  cooler: 'Cooler', bag: 'Bag', other: 'Other',
};

export default function EditContainer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currentUnit } = useUnit();

  const [name, setName] = useState('');
  const [type, setType] = useState<typeof CONTAINER_TYPES[number]>('tote');
  const [purpose, setPurpose] = useState<typeof CONTAINER_PURPOSES[number]>('both');
  const [notes, setNotes] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [groupSiblingCount, setGroupSiblingCount] = useState(0);
  const [diverging, setDiverging] = useState(false);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('containers')
      .select('name, type, purpose, notes, group_id')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (!data) { setLoaded(true); return; }
        setName(data.name);
        setType(data.type as any);
        setPurpose(data.purpose as any);
        setNotes(data.notes ?? '');
        setGroupId(data.group_id);
        setLoaded(true);
        if (!data.group_id) { setGroupName(null); return; }
        supabase.from('container_groups').select('name').eq('id', data.group_id).single()
          .then(({ data: g }) => setGroupName(g?.name ?? null));
      });
  }, [id]);

  useEffect(() => {
    if (!groupId) { setGroupSiblingCount(0); return; }
    supabase
      .from('containers')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', groupId)
      .eq('is_archived', false)
      .then(({ count }) => setGroupSiblingCount(Math.max((count ?? 1) - 1, 0)));
  }, [groupId]);

  async function save() {
    if (!name.trim()) { showAlert('Name required'); return; }
    setSaving(true);
    const { error } = await supabase.rpc('edit_container', {
      p_container_id: id,
      p_name: name.trim(),
      p_type: type,
      p_purpose: purpose,
      p_notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) {
      showAlert('Error', error.message);
    } else {
      router.back();
    }
  }

  function confirmDuplicate() {
    showPrompt(
      'Duplicate Container',
      'Name for the new container:',
      async (newName: string) => {
        if (!newName?.trim()) return;
        setDuplicating(true);
        const { data: newId, error } = await supabase.rpc('duplicate_container', {
          p_container_id: id,
          p_new_name: newName.trim(),
        });
        setDuplicating(false);
        if (error) { showAlert('Error', error.message); return; }
        router.replace(`/container/${newId}`);
      },
      `${name} (copy)`,
    );
  }

  function confirmDuplicateLinked() {
    showPrompt(
      'Duplicate & Link',
      'Name for the new linked container:',
      async (newName: string) => {
        if (!newName?.trim()) return;
        setDuplicating(true);
        const { data: newId, error } = await supabase.rpc('duplicate_container', {
          p_container_id: id,
          p_new_name: newName.trim(),
          p_keep_linked: true,
        });
        setDuplicating(false);
        if (error) { showAlert('Error', error.message); return; }
        router.replace(`/container/${newId}`);
      },
      `${name} (copy)`,
    );
  }

  function confirmDiverge() {
    showAlert(
      'Diverge from Linked Set',
      `"${name}" will become independent. Its current contents stay exactly as they are, but it will no longer receive changes made to the rest of "${groupName}".`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Diverge', style: 'destructive', onPress: doDiverge },
      ]
    );
  }

  async function doDiverge() {
    setDiverging(true);
    const { error } = await supabase.rpc('diverge_container', { p_container_id: id });
    setDiverging(false);
    if (error) { showAlert('Error', error.message); return; }
    setGroupId(null);
    setGroupName(null);
    setGroupSiblingCount(0);
  }

  function confirmDelete() {
    showAlert(
      'Delete Container',
      `Remove "${name}"? The container and its item list will be archived. Quantity history is preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]
    );
  }

  async function doDelete() {
    setDeleting(true);
    const { error } = await supabase.rpc('delete_container', { p_container_id: id });
    setDeleting(false);
    if (error) {
      showAlert('Error', error.message);
    } else {
      router.replace('/(tabs)');
    }
  }

  if (!loaded) return null;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Container Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Kitchen Tote #1"
        placeholderTextColor="#aaa"
      />

      <Text style={styles.label}>Type</Text>
      <View style={styles.chipRow}>
        {CONTAINER_TYPES.map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.chip, type === t && styles.chipSelected]}
            onPress={() => setType(t)}
          >
            <Text style={styles.chipEmoji}>{TYPE_EMOJI[t]}</Text>
            <Text style={[styles.chipText, type === t && styles.chipTextSelected]}>{TYPE_LABEL[t]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Purpose</Text>
      <View style={styles.segRow}>
        {CONTAINER_PURPOSES.map(p => (
          <TouchableOpacity
            key={p}
            style={[styles.seg, purpose === p && { backgroundColor: currentUnit?.accent_color ?? '#2d5a27' }]}
            onPress={() => setPurpose(p)}
          >
            <Text style={[styles.segText, purpose === p && styles.segTextSelected]}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Notes (optional)</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={notes}
        onChangeText={setNotes}
        placeholder="e.g. Usually stored in the trailer near the door"
        placeholderTextColor="#aaa"
        multiline
        numberOfLines={3}
      />

      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: currentUnit?.accent_color ?? '#2d5a27' }, saving && styles.disabled]}
        onPress={save}
        disabled={saving}
      >
        <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.duplicateBtn, duplicating && styles.disabled]}
        onPress={confirmDuplicate}
        disabled={duplicating}
      >
        <Text style={styles.duplicateBtnText}>{duplicating ? 'Duplicating…' : '⧉ Duplicate Container'}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.duplicateBtn, duplicating && styles.disabled]}
        onPress={confirmDuplicateLinked}
        disabled={duplicating}
      >
        <Text style={styles.duplicateBtnText}>{duplicating ? 'Duplicating…' : '⧉🔗 Duplicate & Link'}</Text>
      </TouchableOpacity>

      {groupId ? (
        <>
          <TouchableOpacity
            style={styles.linkInfoBtn}
            onPress={() => router.push(`/container/group?id=${groupId}`)}
          >
            <Text style={styles.linkInfoBtnText}>
              🔗 Linked to {groupSiblingCount} other{groupSiblingCount === 1 ? '' : 's'} ({groupName}) · Manage
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.divergeBtn, diverging && styles.disabled]}
            onPress={confirmDiverge}
            disabled={diverging}
          >
            <Text style={styles.divergeBtnText}>{diverging ? 'Diverging…' : '✂️ Diverge from Linked Set'}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity
          style={styles.linkInfoBtn}
          onPress={() => router.push(`/container/link?source_id=${id}`)}
        >
          <Text style={styles.linkInfoBtnText}>🔗 Link to Existing Container…</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.deleteBtn, deleting && styles.disabled]}
        onPress={confirmDelete}
        disabled={deleting}
      >
        <Text style={styles.deleteBtnText}>{deleting ? 'Deleting…' : '🗑 Delete Container'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f5f0e8' },
  content: { padding: 24, paddingBottom: 60 },
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
  textArea: { height: 80, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: '#e0d8cc',
  },
  chipSelected: { borderColor: '#2d5a27', backgroundColor: '#f0f7ee' },
  chipEmoji: { fontSize: 14 },
  chipText: { fontSize: 13, color: '#666', fontWeight: '500' },
  chipTextSelected: { color: '#2d5a27', fontWeight: '700' },
  segRow: { flexDirection: 'row', borderRadius: 10, overflow: 'hidden', borderWidth: 1.5, borderColor: '#e0d8cc' },
  seg: { flex: 1, padding: 12, alignItems: 'center', backgroundColor: '#fff' },
  segText: { fontSize: 14, fontWeight: '600', color: '#666' },
  segTextSelected: { color: '#fff' },
  saveBtn: { padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 32 },
  disabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  duplicateBtn: {
    padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 12,
    borderWidth: 1.5, borderColor: '#1a5276',
  },
  duplicateBtnText: { color: '#1a5276', fontSize: 15, fontWeight: '600' },
  linkInfoBtn: {
    padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 12,
    backgroundColor: '#eef4fb',
  },
  linkInfoBtnText: { color: '#1a5276', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  divergeBtn: {
    padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 12,
    borderWidth: 1.5, borderColor: '#e67e22',
  },
  divergeBtnText: { color: '#e67e22', fontSize: 15, fontWeight: '600' },
  deleteBtn: {
    padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 12,
    borderWidth: 1.5, borderColor: '#c0392b',
  },
  deleteBtnText: { color: '#c0392b', fontSize: 15, fontWeight: '600' },
});

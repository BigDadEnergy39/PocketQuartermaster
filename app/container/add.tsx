import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { showAlert } from '../../src/lib/alert';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
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

export default function AddContainer() {
  const { currentUnit } = useUnit();
  const { parent_id } = useLocalSearchParams<{ parent_id?: string }>();
  const isSubcontainer = !!parent_id;
  const navigation = useNavigation();
  const [name, setName] = useState('');
  const [type, setType] = useState<typeof CONTAINER_TYPES[number]>('tote');
  const [purpose, setPurpose] = useState<typeof CONTAINER_PURPOSES[number]>('both');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isSubcontainer) navigation.setOptions({ title: 'Add Subcontainer' });
  }, [isSubcontainer]);

  async function save() {
    if (!name.trim()) { showAlert('Name required', 'Please give this container a name.'); return; }
    if (!currentUnit) return;

    setSaving(true);
    const { error } = await supabase.rpc('add_container', {
      p_unit_id: currentUnit.id,
      p_name: name.trim(),
      p_type: type,
      p_purpose: purpose,
      p_notes: notes.trim() || null,
      p_parent_container_id: parent_id ?? null,
    });

    setSaving(false);
    if (error) {
      showAlert('Error', error.message);
    } else {
      router.back();
    }
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.label}>{isSubcontainer ? 'Subcontainer Name' : 'Container Name'}</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder={isSubcontainer ? 'e.g. Tool Kit' : 'e.g. Kitchen Tote #1'}
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
            <Text style={[styles.chipText, type === t && styles.chipTextSelected]}>
              {TYPE_LABEL[t]}
            </Text>
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
        style={[styles.saveBtn, { backgroundColor: currentUnit?.accent_color ?? '#2d5a27' }, saving && styles.saveBtnDisabled]}
        onPress={save}
        disabled={saving}
      >
        <Text style={styles.saveBtnText}>{saving ? 'Saving…' : isSubcontainer ? 'Add Subcontainer' : 'Add Container'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
        <Text style={styles.cancelText}>Cancel</Text>
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
  saveBtn: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 32,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn: { padding: 16, alignItems: 'center', marginTop: 8 },
  cancelText: { color: '#888', fontSize: 15 },
});

import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { showAlert } from '../src/lib/alert';
import { router } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { useUnit } from '../src/context/UnitContext';
import { ColorPicker, UNIT_COLORS } from '../src/components/ColorPicker';

export default function CreateUnit() {
  const { refetchUnits } = useUnit();
  const [name, setName] = useState('');
  const [color, setColor] = useState(UNIT_COLORS[0]);
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!name.trim()) {
      showAlert('Unit name required');
      return;
    }
    setLoading(true);

    const { data, error } = await supabase.rpc('create_unit', {
      unit_name: name.trim(),
      unit_color: color,
    });

    if (error || data?.error) {
      showAlert('Error', data?.error ?? error?.message ?? 'Could not create unit');
      setLoading(false);
      return;
    }

    // Refresh the shared units list BEFORE navigating so the routing guard sees
    // the new unit and keeps us in /(tabs) rather than bouncing to /onboarding.
    await refetchUnits();

    setLoading(false);
    router.replace('/(tabs)');
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Create Your Unit</Text>
      <Text style={styles.sub}>You'll be the Quartermaster. You can invite others once it's set up.</Text>

      <Text style={styles.label}>Unit Name</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Troop 42, Pack 7, Crew 1776"
        value={name}
        onChangeText={setName}
      />

      <Text style={styles.label}>Unit Color</Text>
      <Text style={styles.hint}>This color identifies your unit when you're a member of multiple groups.</Text>
      <ColorPicker selected={color} onSelect={setColor} />

      <View style={[styles.preview, { backgroundColor: color }]}>
        <Text style={styles.previewText}>{name || 'Your Unit'}</Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleCreate} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Creating…' : 'Create Unit'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, backgroundColor: '#f5f0e8', paddingTop: 60 },
  heading: { fontSize: 24, fontWeight: '700', color: '#1a1a1a', marginBottom: 8 },
  sub: { color: '#666', fontSize: 14, lineHeight: 20, marginBottom: 32 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6 },
  hint: { fontSize: 12, color: '#888', marginBottom: 12 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 24,
  },
  preview: {
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 32,
  },
  previewText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  button: {
    backgroundColor: '#2d5a27',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  back: { textAlign: 'center', color: '#2d5a27', fontSize: 14 },
});

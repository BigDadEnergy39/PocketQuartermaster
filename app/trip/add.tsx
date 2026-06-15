import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../../src/lib/supabase';
import { useUnit } from '../../src/context/UnitContext';

function fmt(d: Date) {
  return d.toISOString().split('T')[0];
}

function display(d: Date) {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AddTrip() {
  const { currentUnit } = useUnit();
  const [name, setName] = useState('');
  const [tripDate, setTripDate] = useState(new Date());
  const [returnDate, setReturnDate] = useState<Date | null>(null);
  const [headcount, setHeadcount] = useState('');
  const [notes, setNotes] = useState('');
  const [showTripPicker, setShowTripPicker] = useState(false);
  const [showReturnPicker, setShowReturnPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { Alert.alert('Name required', 'Give this trip a name.'); return; }
    if (!currentUnit) return;

    setSaving(true);
    const { data: tripId, error } = await supabase.rpc('create_trip', {
      p_unit_id: currentUnit.id,
      p_name: name.trim(),
      p_trip_date: fmt(tripDate),
      p_return_date: returnDate ? fmt(returnDate) : null,
      p_headcount: headcount.trim() ? parseInt(headcount, 10) : null,
      p_notes: notes.trim() || null,
    });
    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      router.replace(`/trip/${tripId}`);
    }
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Trip Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Summer Camp 2025"
        placeholderTextColor="#aaa"
      />

      <Text style={styles.label}>Departure Date</Text>
      <TouchableOpacity style={styles.dateBtn} onPress={() => setShowTripPicker(true)}>
        <Text style={styles.dateBtnText}>🗓 {display(tripDate)}</Text>
      </TouchableOpacity>
      {showTripPicker && (
        <DateTimePicker
          value={tripDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(_, d) => { setShowTripPicker(false); if (d) setTripDate(d); }}
        />
      )}

      <Text style={styles.label}>Return Date (optional)</Text>
      <TouchableOpacity style={styles.dateBtn} onPress={() => setShowReturnPicker(true)}>
        <Text style={styles.dateBtnText}>
          {returnDate ? `🗓 ${display(returnDate)}` : 'Tap to set return date'}
        </Text>
      </TouchableOpacity>
      {returnDate && (
        <TouchableOpacity onPress={() => setReturnDate(null)}>
          <Text style={styles.clearDate}>Clear return date</Text>
        </TouchableOpacity>
      )}
      {showReturnPicker && (
        <DateTimePicker
          value={returnDate ?? tripDate}
          mode="date"
          minimumDate={tripDate}
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(_, d) => { setShowReturnPicker(false); if (d) setReturnDate(d); }}
        />
      )}

      <Text style={styles.label}>Headcount (optional)</Text>
      <TextInput
        style={styles.input}
        value={headcount}
        onChangeText={setHeadcount}
        keyboardType="numeric"
        placeholder="How many people?"
        placeholderTextColor="#aaa"
      />

      <Text style={styles.label}>Notes (optional)</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={notes}
        onChangeText={setNotes}
        placeholder="Location, theme, special requirements…"
        placeholderTextColor="#aaa"
        multiline
        numberOfLines={3}
      />

      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: currentUnit?.accent_color ?? '#2d5a27' }, saving && styles.disabled]}
        onPress={save}
        disabled={saving}
      >
        <Text style={styles.saveBtnText}>{saving ? 'Creating…' : 'Create Trip'}</Text>
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
  dateBtn: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e0d8cc',
  },
  dateBtnText: { fontSize: 16, color: '#1a1a1a' },
  clearDate: { color: '#c0392b', fontSize: 13, marginTop: 6 },
  saveBtn: { padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 32 },
  disabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn: { padding: 16, alignItems: 'center', marginTop: 8 },
  cancelText: { color: '#888', fontSize: 15 },
});

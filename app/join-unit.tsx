import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../src/lib/supabase';

export default function JoinUnit() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleJoin() {
    if (!code.trim()) {
      Alert.alert('Please enter an invite code');
      return;
    }
    setLoading(true);

    const { data, error } = await supabase.rpc('join_unit_by_code', {
      invite_code: code.trim().toUpperCase(),
    });

    setLoading(false);

    if (error || data?.error) {
      Alert.alert('Could not join', data?.error ?? error?.message);
      return;
    }

    Alert.alert('Welcome!', `You've joined ${data.unit_name}.`, [
      { text: 'Let\'s go', onPress: () => router.replace('/(tabs)') },
    ]);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Join a Unit</Text>
      <Text style={styles.sub}>
        Ask your Quartermaster for an invite code, then enter it below.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Enter invite code"
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        autoCorrect={false}
      />

      <TouchableOpacity style={styles.button} onPress={handleJoin} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Joining…' : 'Join Unit'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#f5f0e8' },
  heading: { fontSize: 24, fontWeight: '700', color: '#1a1a1a', marginBottom: 8 },
  sub: { color: '#666', fontSize: 14, lineHeight: 20, marginBottom: 32 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 20,
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: 20,
  },
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

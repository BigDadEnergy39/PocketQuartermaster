import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { supabase } from '../../src/lib/supabase';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');

  async function handleSubmit() {
    setLoading(true);
    const { error } = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

    if (error) Alert.alert('Error', error.message);
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>⚜️ PocketQuartermaster</Text>
      <Text style={styles.subtitle}>
        {mode === 'signin' ? 'Sign in to your account' : 'Create your account'}
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading}>
        <Text style={styles.buttonText}>
          {loading ? 'Loading…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
        <Text style={styles.toggle}>
          {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#f5f0e8' },
  logo: { fontSize: 28, fontWeight: 'bold', textAlign: 'center', color: '#2d5a27', marginBottom: 8 },
  subtitle: { textAlign: 'center', color: '#666', marginBottom: 32 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#2d5a27',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  toggle: { textAlign: 'center', color: '#2d5a27' },
});

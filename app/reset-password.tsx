import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../src/lib/supabase';

// Landing page for the password-reset recovery link. The link (built by
// forgot-password.tsx via resetPasswordForEmail) carries a recovery token that
// the web Supabase client consumes on load (detectSessionInUrl), establishing a
// short-lived recovery session and emitting PASSWORD_RECOVERY. This screen waits
// for that session, lets the user pick a new password, then signs them out so
// they log in fresh with it.
export default function ResetPassword() {
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false); // a recovery session is present
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;

    // The session may already be established by the time we mount, or arrive a
    // moment later via the PASSWORD_RECOVERY event — cover both.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      if (session) setReady(true);
      setChecking(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setReady(true);
        setChecking(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit() {
    setError(null);
    // Mirror the project's minimum_password_length (config.toml → 6).
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    const { error: updErr } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updErr) {
      setError(updErr.message);
      return;
    }
    // Show the confirmation while STILL holding the recovery session. We must not
    // sign out here: signing out fires SIGNED_OUT, which drops the "recovering"
    // latch in _layout and immediately routes away — the user would never see
    // this success screen. The sign-out happens when they tap "Go to Sign In".
    setDone(true);
  }

  // Drop the temporary recovery session (so a shared/public browser isn't left
  // logged in) and hand off to the normal sign-in screen.
  async function goSignIn() {
    await supabase.auth.signOut();
    router.replace('/(auth)');
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.container}>
        <Text style={styles.logo}>⚜️ PocketQuartermaster</Text>

        {checking ? (
          <ActivityIndicator size="large" color="#2d5a27" />
        ) : done ? (
          <>
            <Text style={styles.heading}>Password updated</Text>
            <Text style={styles.sub}>
              You can now sign in with your new password.
            </Text>
            <TouchableOpacity style={styles.button} onPress={goSignIn}>
              <Text style={styles.buttonText}>Go to Sign In</Text>
            </TouchableOpacity>
          </>
        ) : ready ? (
          <>
            <Text style={styles.heading}>Choose a new password</Text>
            <TextInput
              style={styles.input}
              placeholder="New password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Confirm new password"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoCapitalize="none"
              onSubmitEditing={handleSubmit}
            />
            {error && <Text style={styles.error}>{error}</Text>}
            <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading}>
              <Text style={styles.buttonText}>{loading ? 'Saving…' : 'Set New Password'}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.heading}>Link expired or invalid</Text>
            <Text style={styles.sub}>
              This password-reset link is no longer valid. Request a new one from the sign-in
              screen.
            </Text>
            <TouchableOpacity style={styles.button} onPress={() => router.replace('/(auth)')}>
              <Text style={styles.buttonText}>Back to Sign In</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#f5f0e8' },
  logo: { fontSize: 28, fontWeight: 'bold', textAlign: 'center', color: '#2d5a27', marginBottom: 24 },
  heading: { fontSize: 22, fontWeight: '700', textAlign: 'center', color: '#1a1a1a', marginBottom: 10 },
  sub: { textAlign: 'center', color: '#666', fontSize: 14, lineHeight: 20, marginBottom: 28 },
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
  error: { color: '#c0392b', textAlign: 'center', marginBottom: 12, fontSize: 14 },
});

import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../src/lib/supabase';

// Where Supabase should send the user after they click the recovery email link.
// On web we bounce back to the SAME origin the user is on (localhost while
// developing, pocket-quartermaster.expo.app in production) so the reset page is
// always the one that's actually serving. On native there is no web origin, so
// we point at the deployed web app — mobile users complete the reset in their
// browser, then sign back into the app. This URL must be allow-listed in the
// Supabase project (supabase/config.toml locally; Auth > URL Configuration in
// the cloud dashboard).
const RESET_REDIRECT_URL =
  Platform.OS === 'web' && typeof window !== 'undefined'
    ? `${window.location.origin}/reset-password`
    : 'https://pocket-quartermaster.expo.app/reset-password';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!email.trim()) {
      setError('Enter your email.');
      return;
    }
    setLoading(true);
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: RESET_REDIRECT_URL,
    });
    setLoading(false);

    // Supabase deliberately returns success even when no account matches the
    // email, so an anonymous caller can't probe which addresses have accounts.
    // We mirror that: on anything but a genuine transport/rate-limit failure we
    // show the same neutral confirmation. (A 429 means "too many requests" — the
    // per-hour reset-email cap — and is worth surfacing so the user waits.)
    if (authError) {
      setError(
        authError.status === 429
          ? 'Too many attempts. Wait a few minutes and try again.'
          : authError.message,
      );
      return;
    }
    setSent(true);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.container}>
        <Text style={styles.logo}>⚜️ PocketQuartermaster</Text>

        {sent ? (
          <>
            <Text style={styles.heading}>Check your email</Text>
            <Text style={styles.sub}>
              If an account exists for {email.trim()}, we've sent a link to reset your
              password. Open it on any device or browser to choose a new one.
            </Text>
            <TouchableOpacity style={styles.button} onPress={() => router.replace('/(auth)')}>
              <Text style={styles.buttonText}>Back to Sign In</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.heading}>Reset your password</Text>
            <Text style={styles.sub}>
              Enter the email you sign in with and we'll send you a link to set a new
              password.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              onSubmitEditing={handleSubmit}
            />

            {error && <Text style={styles.error}>{error}</Text>}

            <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading}>
              <Text style={styles.buttonText}>{loading ? 'Sending…' : 'Send Reset Link'}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.back}>← Back to Sign In</Text>
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
  back: { textAlign: 'center', color: '#2d5a27', fontSize: 14 },
});

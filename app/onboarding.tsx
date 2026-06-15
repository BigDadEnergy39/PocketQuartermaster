import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';

export default function Onboarding() {
  return (
    <View style={styles.container}>
      <Text style={styles.logo}>⚜️ PocketQuartermaster</Text>
      <Text style={styles.heading}>Welcome, Quartermaster!</Text>
      <Text style={styles.sub}>
        You're not part of any unit yet. Create a new unit or join one with an invite code.
      </Text>

      <TouchableOpacity style={styles.primary} onPress={() => router.push('/create-unit')}>
        <Text style={styles.primaryText}>Create a Unit</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondary} onPress={() => router.push('/join-unit')}>
        <Text style={styles.secondaryText}>Join with Invite Code</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 32, backgroundColor: '#f5f0e8' },
  logo: { fontSize: 28, fontWeight: 'bold', textAlign: 'center', color: '#2d5a27', marginBottom: 24 },
  heading: { fontSize: 22, fontWeight: '700', textAlign: 'center', color: '#1a1a1a', marginBottom: 12 },
  sub: { textAlign: 'center', color: '#666', fontSize: 15, lineHeight: 22, marginBottom: 40 },
  primary: {
    backgroundColor: '#2d5a27',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 14,
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondary: {
    borderWidth: 2,
    borderColor: '#2d5a27',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryText: { color: '#2d5a27', fontSize: 16, fontWeight: '600' },
});

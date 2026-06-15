import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { supabase } from '../../src/lib/supabase';

export default function Settings() {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>Settings coming soon</Text>
      <TouchableOpacity style={styles.signOut} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f0e8', gap: 16 },
  placeholder: { color: '#999', fontSize: 16 },
  signOut: { backgroundColor: '#c0392b', padding: 12, borderRadius: 8, paddingHorizontal: 24 },
  signOutText: { color: '#fff', fontWeight: '600' },
});

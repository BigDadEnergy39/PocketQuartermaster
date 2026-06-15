import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { useUnit } from '../src/context/UnitContext';
import { useUnits } from '../src/hooks/useUnits';
import { UnitWithRole } from '../src/types';

export default function SwitchUnit() {
  const { currentUnit, setCurrentUnit } = useUnit();
  const [userId, setUserId] = useState<string | undefined>();
  const { units } = useUnits(userId);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id));
  }, []);

  function selectUnit(unit: UnitWithRole) {
    setCurrentUnit(unit);
    router.back();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Your Units</Text>

      <FlatList
        data={units}
        keyExtractor={u => u.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, currentUnit?.id === item.id && styles.active]}
            onPress={() => selectUnit(item)}
          >
            <View style={[styles.dot, { backgroundColor: item.accent_color }]} />
            <View style={styles.info}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.role}>{item.role.replace(/_/g, ' ')}</Text>
            </View>
            {currentUnit?.id === item.id && <Text style={styles.check}>✓</Text>}
          </TouchableOpacity>
        )}
        ListFooterComponent={
          <TouchableOpacity style={styles.addRow} onPress={() => router.replace('/create-unit')}>
            <Text style={styles.addText}>+ Create another unit</Text>
          </TouchableOpacity>
        }
      />

      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f0e8', padding: 24, paddingTop: 60 },
  heading: { fontSize: 22, fontWeight: '700', color: '#1a1a1a', marginBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 10,
    gap: 12,
  },
  active: { borderWidth: 2, borderColor: '#2d5a27' },
  dot: { width: 16, height: 16, borderRadius: 8 },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  role: { fontSize: 12, color: '#888', textTransform: 'capitalize', marginTop: 2 },
  check: { fontSize: 18, color: '#2d5a27', fontWeight: '700' },
  addRow: { padding: 16, alignItems: 'center' },
  addText: { color: '#2d5a27', fontSize: 15, fontWeight: '600' },
  back: { textAlign: 'center', color: '#2d5a27', fontSize: 14, marginTop: 8 },
});

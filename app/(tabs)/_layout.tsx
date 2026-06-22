import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Tabs, router } from 'expo-router';
import { useUnit } from '../../src/context/UnitContext';
import { useUnits } from '../../src/hooks/useUnits';
import { supabase } from '../../src/lib/supabase';

function UnitHeader() {
  const { currentUnit } = useUnit();
  if (!currentUnit) return null;

  return (
    <TouchableOpacity style={styles.headerUnit} onPress={() => router.push('/switch-unit')}>
      <View style={[styles.dot, { backgroundColor: currentUnit.accent_color }]} />
      <Text style={styles.unitName} numberOfLines={1}>{currentUnit.name}</Text>
      <Text style={styles.chevron}>▾</Text>
    </TouchableOpacity>
  );
}

export default function TabLayout() {
  const { currentUnit, setCurrentUnit } = useUnit();
  const [userId, setUserId] = useState<string | undefined>();
  const { units } = useUnits(userId);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id));
  }, []);

  useEffect(() => {
    if (!currentUnit && units.length > 0) {
      setCurrentUnit(units[0]);
    }
  }, [units, currentUnit]);

  const color = currentUnit?.accent_color ?? '#2d5a27';

  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: color,
      tabBarInactiveTintColor: '#999',
      tabBarStyle: { backgroundColor: '#f5f0e8', borderTopColor: '#ddd' },
      headerStyle: { backgroundColor: color },
      headerTintColor: '#fff',
      headerTitle: () => <UnitHeader />,
    }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Inventory', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📦</Text> }}
      />
      <Tabs.Screen
        name="shopping"
        options={{ title: 'Shopping', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🛒</Text> }}
      />
<Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>⚙️</Text> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerUnit: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  unitName: { color: '#fff', fontSize: 17, fontWeight: '600', maxWidth: 200 },
  chevron: { color: '#fff', fontSize: 12 },
});

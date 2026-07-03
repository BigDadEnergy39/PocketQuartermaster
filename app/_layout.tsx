import { useEffect, useRef, useState } from 'react';
import { Stack, router } from 'expo-router';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../src/lib/supabase';
import { UnitProvider, useUnit } from '../src/context/UnitContext';
import { useUnits } from '../src/hooks/useUnits';

function RootNavigator({ session }: { session: Session | null }) {
  const { units, loading } = useUnits(session?.user?.id);
  const { setCurrentUnit } = useUnit();
  const prevUserId = useRef(session?.user?.id);

  // When the signed-in user changes (sign out / switch account), drop the
  // previous account's unit immediately so it can't linger in the header while
  // the new account's units load. The (tabs) layout then picks a valid default.
  useEffect(() => {
    const uid = session?.user?.id;
    if (uid !== prevUserId.current) {
      prevUserId.current = uid;
      setCurrentUnit(null);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace('/(auth)');
    } else if (units.length === 0) {
      router.replace('/onboarding');
    } else {
      router.replace('/(tabs)');
    }
  }, [session, units, loading]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="create-unit" />
      <Stack.Screen name="join-unit" />
      <Stack.Screen name="switch-unit" />
      <Stack.Screen name="container/[id]" options={{ headerShown: true, title: 'Container' }} />
      <Stack.Screen name="container/add" options={{ headerShown: true, title: 'Add Container' }} />
      <Stack.Screen name="container/edit" options={{ headerShown: true, title: 'Edit Container' }} />
      <Stack.Screen name="container/link" options={{ headerShown: true, title: 'Link Containers' }} />
      <Stack.Screen name="container/group" options={{ headerShown: true, title: 'Linked Set' }} />
      <Stack.Screen name="item/[slot_id]" options={{ headerShown: true, title: 'Item Detail' }} />
      <Stack.Screen name="item/add" options={{ headerShown: true, title: 'Add Item' }} />
      <Stack.Screen name="item/edit" options={{ headerShown: true, title: 'Edit Item' }} />
<Stack.Screen name="audit/index" options={{ headerShown: true, title: 'Inventory Audit' }} />
      <Stack.Screen name="audit/conduct" options={{ headerShown: true, title: 'Audit', headerBackVisible: false }} />
      <Stack.Screen name="audit/summary" options={{ headerShown: true, title: 'Audit Results', headerBackVisible: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setInitialized(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!initialized) return null;

  return (
    <UnitProvider>
      <RootNavigator session={session} />
    </UnitProvider>
  );
}

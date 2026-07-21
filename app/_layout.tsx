import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Stack, router } from 'expo-router';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../src/lib/supabase';
import { UnitProvider, useUnit } from '../src/context/UnitContext';

// A password-reset link lands on the web app with `type=recovery` in the URL
// hash. Detecting it here (before any auth event fires) lets us hold the user on
// the reset screen from the very first render, so the recovery session the link
// creates is never mistaken for a normal sign-in and routed into the app.
const isRecoveryUrl =
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  window.location.hash.includes('type=recovery');

function RootNavigator({
  session,
  recovering,
}: {
  session: Session | null;
  recovering: boolean;
}) {
  // Units come from the shared UnitContext (the provider fetches them keyed on
  // userId), so a join/create that calls refetchUnits updates the very list this
  // guard reads — no stale [] bouncing the user back to /onboarding.
  const { units, unitsLoading, setCurrentUnit } = useUnit();
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
    // While recovering from a reset link, hold on the reset screen regardless of
    // session/units — the session that link created must not be treated as a
    // normal login. This check comes first, before the unitsLoading gate, so we
    // never flash the app while units load for the recovery user.
    if (recovering) {
      router.replace('/reset-password');
      return;
    }
    if (unitsLoading) return;
    if (!session) {
      router.replace('/(auth)');
    } else if (units.length === 0) {
      router.replace('/onboarding');
    } else {
      router.replace('/(tabs)');
    }
  }, [session, units, unitsLoading, recovering]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="create-unit" />
      <Stack.Screen name="join-unit" />
      <Stack.Screen name="switch-unit" />
      <Stack.Screen name="container/[id]" options={{ headerShown: true, title: 'Container' }} />
      <Stack.Screen name="container/add" options={{ headerShown: true, title: 'Add Container' }} />
      <Stack.Screen name="container/edit" options={{ headerShown: true, title: 'Edit Container' }} />
      <Stack.Screen name="container/link" options={{ headerShown: true, title: 'Link Containers' }} />
      <Stack.Screen name="container/join-group" options={{ headerShown: true, title: 'Join Linked Set' }} />
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
  const [recovering, setRecovering] = useState(isRecoveryUrl);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setInitialized(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // A recovery link both establishes a session AND fires PASSWORD_RECOVERY.
      // Latch "recovering" so RootNavigator pins the user to the reset screen;
      // clear it on sign-out (which happens right after they set a new password).
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_OUT') setRecovering(false);
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!initialized) return null;

  return (
    <UnitProvider userId={session?.user?.id}>
      <RootNavigator session={session} recovering={recovering} />
    </UnitProvider>
  );
}

import { Stack, usePathname, useRouter } from 'expo-router';
import { COLORS } from '../constants/theme';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { initTimestampCaching } from '../utils/mediaDate';
import { flushJsonCacheToDisk } from '../utils/jsonTimestampCache';
import { AppThemeProvider, useAppTheme } from '../theme/AppThemeContext';
import AnimatedSplash from '../components/AnimatedSplash';

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <RootLayoutInner />
    </AppThemeProvider>
  );
}

function RootLayoutInner() {
  const router = useRouter();
  const pathname = usePathname();
  const forcedHomeRef = useRef(false);
  const { colors } = useAppTheme();
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    // Initialize timestamp JSON cache on app startup
    void initTimestampCaching();
  }, []);

  useEffect(() => {
    // Save timestamp cache when app goes to background
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        void flushJsonCacheToDisk();
      }

      if (state === 'active' && pathname !== '/') {
        router.replace('/');
      }
    });

    return () => subscription.remove();
  }, [pathname, router]);

  useEffect(() => {
    if (forcedHomeRef.current) return;
    forcedHomeRef.current = true;

    const timer = setTimeout(() => {
      router.replace('/');
    }, 0);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
          initialRouteName="(drawer)"
        >
          <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
          <Stack.Screen 
            name="photo/[id]" 
            options={{ 
              presentation: 'transparentModal',
              animation: 'fade',
            }} 
          />
        </Stack>
        {!splashDone ? <AnimatedSplash onFinish={() => setSplashDone(true)} /> : null}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

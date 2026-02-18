import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAppStore } from './src/store/useAppStore';
import { getTheme } from './src/theme';
import { MarbleBackdrop } from './src/components/MarbleBackdrop';
import { AuthScreen } from './src/screens/AuthScreen';
import { AuthedShell } from './src/components/AuthedShell';
import { ToastBanner } from './src/components/ToastBanner';

export default function App() {
  const themeMode = useAppStore((s) => s.themeMode);
  const currentUserId = useAppStore((s) => s.currentUserId);
  const initializeAuthListener = useAppStore((s) => s.initializeAuthListener);
  const authReady = useAppStore((s) => s.authReady);
  const toast = useAppStore((s) => s.toast);
  const clearToast = useAppStore((s) => s.clearToast);
  const colors = getTheme(themeMode);

  useEffect(() => {
    console.log('[App] mount -> initializeAuthListener');
    initializeAuthListener();
  }, [initializeAuthListener]);

  useEffect(() => {
    console.log('[App] state', { authReady, currentUserId: currentUserId ?? null });
  }, [authReady, currentUserId]);

  const loading = !authReady;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
      <MarbleBackdrop colors={colors} />
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : currentUserId ? (
        <AuthedShell colors={colors} />
      ) : (
        <AuthScreen colors={colors} />
      )}
      <ToastBanner toast={toast} colors={colors} onDismiss={clearToast} />
    </SafeAreaView>
  );
}

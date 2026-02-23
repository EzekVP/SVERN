import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { styles } from '../styles';
import { ThemeColors } from '../theme';
import { useAppStore } from '../store/useAppStore';

WebBrowser.maybeCompleteAuthSession();

type Props = {
  colors: ThemeColors;
};

export function AuthScreen({ colors }: Props) {
  const signIn = useAppStore((s) => s.signIn);
  const signUp = useAppStore((s) => s.signUp);
  const signInWithGoogle = useAppStore((s) => s.signInWithGoogle);
  const firebaseEnabled = useAppStore((s) => s.firebaseEnabled);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('ava@svern.app');
  const [password, setPassword] = useState('');
  const [errorTitle, setErrorTitle] = useState('Login failed');
  const [error, setError] = useState<string | undefined>();
  const [googleBusy, setGoogleBusy] = useState(false);
  const googleAuthConfig = useMemo(
    () => ({
      clientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      scopes: ['profile', 'email'],
    }),
    []
  );
  const [request, response, promptAsync] = Google.useAuthRequest(googleAuthConfig);

  const submit = useCallback(async () => {
    const res = mode === 'signin' ? await signIn(email, password) : await signUp(name, email, password);
    if (!res.ok) {
      setErrorTitle(mode === 'signin' ? 'Login failed' : 'Sign up failed');
      setError(res.error);
    } else {
      setError(undefined);
    }
  }, [mode, signIn, signUp, name, email, password]);

  const toggleMode = useCallback(() => {
    setError(undefined);
    setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
  }, []);

  const startGoogleAuth = useCallback(async () => {
    setError(undefined);
    setGoogleBusy(true);
    await promptAsync();
  }, [promptAsync]);

  useEffect(() => {
    const syncGoogleAuth = async () => {
      if (!response) return;
      if (response.type !== 'success') {
        if (response.type !== 'dismiss' && response.type !== 'cancel') {
          setErrorTitle('Google sign-in failed');
          setError('Google sign-in was not completed.');
        }
        setGoogleBusy(false);
        return;
      }

      const idToken = response.authentication?.idToken ?? response.params?.id_token;
      if (!idToken) {
        setErrorTitle('Google sign-in failed');
        setError('Google sign-in did not return an ID token.');
        setGoogleBusy(false);
        return;
      }

      const result = await signInWithGoogle(idToken);
      if (!result.ok) {
        setErrorTitle('Google sign-in failed');
        setError(result.error);
      } else {
        setError(undefined);
      }
      setGoogleBusy(false);
    };

    void syncGoogleAuth();
  }, [response, signInWithGoogle]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => {
      setError(undefined);
    }, 900);
    return () => clearTimeout(timer);
  }, [error]);

  return (
    <View style={[styles.page, styles.centered]}>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.panel, borderColor: colors.border, width: '92%', maxWidth: 460 },
        ]}
      >
        <Text style={[styles.title, { color: colors.text, textAlign: 'center', marginBottom: 12 }]}>SVERN</Text>
        {!firebaseEnabled ? (
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            Firebase config missing, running in local demo mode.
          </Text>
        ) : null}

        {mode === 'signup' ? (
          <TextInput
            placeholder="Username"
            placeholderTextColor={colors.muted}
            value={name}
            onChangeText={setName}
            style={[
              styles.input,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
            ]}
          />
        ) : null}

        <TextInput
          placeholder="Email"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          style={[
            styles.input,
            { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
          ]}
        />
        <TextInput
          placeholder="Password"
          placeholderTextColor={colors.muted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={[
            styles.input,
            { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
          ]}
        />

        {error ? (
          <View
            style={{
              borderWidth: 1,
              borderRadius: 12,
              borderColor: colors.danger,
              backgroundColor: colors.panel,
              padding: 10,
              marginTop: 2,
              marginBottom: 2,
            }}
          >
            <Text style={{ color: colors.danger, fontWeight: '800', fontSize: 14, marginBottom: 2 }}>{errorTitle}</Text>
            <Text style={[styles.errorText, { color: colors.danger, marginTop: 0 }]}>{error}</Text>
          </View>
        ) : null}

        <Pressable style={[styles.primaryButton, { backgroundColor: colors.accent }]} onPress={submit}>
          <Text style={styles.primaryButtonText}>
            {mode === 'signin' ? 'Log in' : 'Create account'}
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.primaryButton,
            { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, marginTop: 8 },
          ]}
          disabled={!firebaseEnabled || !request || googleBusy}
          onPress={startGoogleAuth}
        >
          <Text style={[styles.primaryButtonText, { color: colors.text }]}>
            {googleBusy ? 'Connecting to Google...' : 'Continue with Google'}
          </Text>
        </Pressable>

        <Pressable onPress={toggleMode}>
          <Text style={[styles.link, { color: colors.accent }]}>
            {mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { styles } from '../styles';
import { ThemeColors } from '../theme';
import { useAppStore } from '../store/useAppStore';

type Props = {
  colors: ThemeColors;
};

export function AuthScreen({ colors }: Props) {
  const signIn = useAppStore((s) => s.signIn);
  const signUp = useAppStore((s) => s.signUp);
  const firebaseEnabled = useAppStore((s) => s.firebaseEnabled);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('ava@svern.app');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();

  const submit = async () => {
    const res =
      mode === 'signin' ? await signIn(email, password) : await signUp(name, email, password);
    if (!res.ok) setError(res.error);
    else setError(undefined);
  };

  return (
    <View style={[styles.page, styles.centered]}>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.panel, borderColor: colors.border, width: '92%', maxWidth: 460 },
        ]}
      >
        <Text style={[styles.title, { color: colors.text }]}>SVERN</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          Shared CommonBox with ownership and concerns
        </Text>
        {!firebaseEnabled ? (
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            Firebase config missing, running in local demo mode.
          </Text>
        ) : null}

        {mode === 'signup' ? (
          <TextInput
            placeholder="Name"
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

        {error ? <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text> : null}

        <Pressable style={[styles.primaryButton, { backgroundColor: colors.accent }]} onPress={submit}>
          <Text style={styles.primaryButtonText}>
            {mode === 'signin' ? 'Log in' : 'Create account'}
          </Text>
        </Pressable>

        <Pressable onPress={() => setMode((m) => (m === 'signin' ? 'signup' : 'signin'))}>
          <Text style={[styles.link, { color: colors.accent }]}>
            {mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

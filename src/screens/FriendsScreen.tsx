import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { styles } from '../styles';
import { ThemeColors } from '../theme';
import { useAppStore } from '../store/useAppStore';
import { User } from '../types/models';

type Props = {
  colors: ThemeColors;
  me: User;
};

export function FriendsScreen({ colors, me }: Props) {
  const users = useAppStore((s) => s.users);
  const addFriendByEmail = useAppStore((s) => s.addFriendByEmail);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();

  const friends = users.filter((u) => me.friendIds.includes(u.id));

  const addFriend = async () => {
    const res = await addFriendByEmail(email);
    if (!res.ok) setError(res.error);
    else {
      setEmail('');
      setError(undefined);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={[styles.card, { backgroundColor: colors.panel, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Friends</Text>

        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          placeholder="friend@email.com"
          placeholderTextColor={colors.muted}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
        />

        {error ? <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text> : null}

        <Pressable style={[styles.primaryButton, { backgroundColor: colors.accent }]} onPress={addFriend}>
          <Text style={styles.primaryButtonText}>Add Friend</Text>
        </Pressable>

        {friends.length === 0 ? <Text style={{ color: colors.muted }}>No friends yet.</Text> : null}

        {friends.map((friend) => (
          <View key={friend.id} style={[styles.itemRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>{friend.name}</Text>
            <Text style={{ color: colors.muted }}>{friend.email}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

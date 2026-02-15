import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { styles } from '../styles';
import { ThemeColors } from '../theme';
import { useAppStore } from '../store/useAppStore';
import { User } from '../types/models';

type Props = {
  colors: ThemeColors;
  me: User;
  boxId?: string;
};

export function ChatScreen({ colors, me, boxId }: Props) {
  const boxes = useAppStore((s) => s.boxes);
  const messages = useAppStore((s) => s.messages);
  const users = useAppStore((s) => s.users);
  const sendMessage = useAppStore((s) => s.sendMessage);

  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>();

  const box = boxes.find((b) => b.id === boxId);
  const boxMessages = messages.filter((m) => m.boxId === boxId);

  if (!box) {
    return (
      <View style={[styles.page, styles.centered]}>
        <Text style={{ color: colors.text }}>Select a valid box to open chat.</Text>
      </View>
    );
  }

  const submit = async () => {
    const res = await sendMessage(box.id, text);
    if (!res.ok) setError(res.error);
    else {
      setText('');
      setError(undefined);
    }
  };

  return (
    <View style={[styles.page, { paddingBottom: 8 }]}>
      <View style={[styles.card, { backgroundColor: colors.panel, borderColor: colors.border, flex: 1 }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Chat: {box.name}</Text>

        <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
          {boxMessages.length === 0 ? <Text style={{ color: colors.muted }}>No messages yet.</Text> : null}
          {boxMessages.map((msg) => {
            const sender = users.find((u) => u.id === msg.senderUserId);
            const mine = msg.senderUserId === me.id;
            return (
              <View
                key={msg.id}
                style={[
                  styles.chatBubble,
                  {
                    alignSelf: mine ? 'flex-end' : 'flex-start',
                    backgroundColor: mine ? colors.accentSoft : colors.background,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }}>{sender?.name || 'Unknown'}</Text>
                <Text style={{ color: colors.text, marginTop: 4 }}>{msg.text}</Text>
              </View>
            );
          })}
        </ScrollView>

        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Type a message"
          placeholderTextColor={colors.muted}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
        />

        {error ? <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text> : null}

        <Pressable style={[styles.primaryButton, { backgroundColor: colors.accent }]} onPress={submit}>
          <Text style={styles.primaryButtonText}>Send</Text>
        </Pressable>
      </View>
    </View>
  );
}

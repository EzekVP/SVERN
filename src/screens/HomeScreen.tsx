import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { styles } from '../styles';
import { ThemeColors } from '../theme';
import { useAppStore } from '../store/useAppStore';
import { CommonBox, User } from '../types/models';

type Props = {
  colors: ThemeColors;
  me: User;
  myBoxes: CommonBox[];
  selectedBoxId?: string;
};

export function HomeScreen({ colors, me, myBoxes, selectedBoxId }: Props) {
  const users = useAppStore((s) => s.users);
  const selectBox = useAppStore((s) => s.selectBox);
  const addItem = useAppStore((s) => s.addItem);
  const raiseConcern = useAppStore((s) => s.raiseConcern);
  const navigate = useAppStore((s) => s.navigate);

  const activeBox = myBoxes.find((b) => b.id === selectedBoxId) || myBoxes[0];
  const [itemName, setItemName] = useState('');
  const [ownerId, setOwnerId] = useState<string | undefined>(activeBox?.participantIds[0]);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    setOwnerId(activeBox?.participantIds[0]);
  }, [activeBox?.id, activeBox?.participantIds]);

  if (!activeBox) {
    return (
      <View style={[styles.page, styles.centered]}>
        <View style={[styles.card, { backgroundColor: colors.panel, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>No CommonBox yet</Text>
          <Text style={{ color: colors.muted }}>Open Menu and create your first box.</Text>
        </View>
      </View>
    );
  }

  const participants = activeBox.participantIds
    .map((idValue) => users.find((u) => u.id === idValue))
    .filter((u): u is User => Boolean(u));

  const submitItem = async () => {
    if (!ownerId) {
      setError('Select an owner first.');
      return;
    }
    const res = await addItem(activeBox.id, itemName, ownerId);
    if (!res.ok) setError(res.error);
    else {
      setItemName('');
      setError(undefined);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Your CommonBoxes</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {myBoxes.map((box) => (
          <Pressable
            key={box.id}
            onPress={() => selectBox(box.id)}
            style={[
              styles.pill,
              {
                borderColor: colors.border,
                backgroundColor: activeBox.id === box.id ? colors.accentSoft : colors.panel,
              },
            ]}
          >
            <Text style={{ color: colors.text }}>{box.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={[styles.card, { backgroundColor: colors.panel, borderColor: colors.border }]}>
        <View style={styles.rowBetween}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{activeBox.name}</Text>
          <Pressable
            onPress={() => navigate({ name: 'chat', boxId: activeBox.id })}
            style={[styles.pill, { borderColor: colors.border, backgroundColor: colors.background }]}
          >
            <Text style={{ color: colors.text }}>Open Chat Room</Text>
          </Pressable>
        </View>

        <Text style={{ color: colors.muted, marginBottom: 8 }}>Participants</Text>
        <View style={styles.wrapRow}>
          {participants.map((p) => (
            <View key={p.id} style={[styles.smallPill, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <Text style={{ color: colors.text }}>{p.name}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.cardTitle, { color: colors.text, marginTop: 16 }]}>Add Item</Text>
        <TextInput
          value={itemName}
          onChangeText={setItemName}
          placeholder="Example: Brown Bread"
          placeholderTextColor={colors.muted}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
        />

        <Text style={{ color: colors.muted }}>Add this item under owner</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 8 }}>
          {participants.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => setOwnerId(p.id)}
              style={[
                styles.pill,
                {
                  borderColor: colors.border,
                  backgroundColor: ownerId === p.id ? colors.accentSoft : colors.background,
                },
              ]}
            >
              <Text style={{ color: colors.text }}>{p.name}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {error ? <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text> : null}

        <Pressable style={[styles.primaryButton, { backgroundColor: colors.accent }]} onPress={submitItem}>
          <Text style={styles.primaryButtonText}>Add to CommonBox</Text>
        </Pressable>
      </View>

      <View style={[styles.card, { backgroundColor: colors.panel, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Items</Text>
        {activeBox.items.length === 0 ? <Text style={{ color: colors.muted }}>No items yet.</Text> : null}

        {activeBox.items.map((item) => {
          const owner = users.find((u) => u.id === item.ownerUserId);
          const addedBy = users.find((u) => u.id === item.addedByUserId);
          const isMine = item.ownerUserId === me.id;

          return (
            <View
              key={item.id}
              style={[
                styles.itemRow,
                { borderColor: colors.border, backgroundColor: item.hasConcern ? colors.accentSoft : colors.background },
              ]}
            >
              <Text style={{ color: colors.text, fontWeight: '700' }}>{item.label}</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>
                Owner: {owner?.name || 'Unknown'} | Added by: {addedBy?.name || 'Unknown'}
              </Text>

              <View style={[styles.rowBetween, { marginTop: 10 }]}>
                {isMine ? (
                  <Text style={{ color: colors.accent, fontWeight: '600' }}>Marked as yours</Text>
                ) : (
                  <Pressable onPress={() => raiseConcern(activeBox.id, item.id)}>
                    <Text style={{ color: colors.danger, fontWeight: '700' }}>Raise Concern</Text>
                  </Pressable>
                )}
                {item.hasConcern ? <Text style={{ color: colors.danger }}>Concern active</Text> : null}
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

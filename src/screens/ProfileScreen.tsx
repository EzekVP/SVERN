import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { styles } from '../styles';
import { ThemeColors } from '../theme';
import { useAppStore } from '../store/useAppStore';
import { User } from '../types/models';

type Props = {
  colors: ThemeColors;
  me: User;
};

export function ProfileScreen({ colors, me }: Props) {
  const boxes = useAppStore((s) => s.boxes);
  const deleteAccount = useAppStore((s) => s.deleteAccount);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const myBoxes = useMemo(() => boxes.filter((b) => b.participantIds.includes(me.id)), [boxes, me.id]);
  const ownedCount = myBoxes.reduce((count, b) => count + b.items.filter((i) => i.ownerUserId === me.id).length, 0);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={[styles.card, { backgroundColor: colors.panel, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>{me.name}</Text>
        <Text style={{ color: colors.muted }}>{me.email}</Text>

        <View style={[styles.metricGrid, { marginTop: 14 }]}>
          <View style={[styles.metricCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Text style={{ color: colors.muted }}>Boxes</Text>
            <Text style={[styles.metricValue, { color: colors.text }]}>{myBoxes.length}</Text>
          </View>
          <View style={[styles.metricCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Text style={{ color: colors.muted }}>Owned Items</Text>
            <Text style={[styles.metricValue, { color: colors.text }]}>{ownedCount}</Text>
          </View>
        </View>

        <View style={{ marginTop: 16 }}>
          {!confirmingDelete ? (
            <Pressable
              onPress={() => setConfirmingDelete(true)}
              style={[styles.drawerAction, { borderColor: colors.danger, marginHorizontal: 0 }]}
            >
              <Text style={{ color: colors.danger, fontWeight: '700' }}>Delete Account</Text>
            </Pressable>
          ) : (
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.danger, fontWeight: '700' }}>
                This permanently deletes your account from Auth and Firestore.
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={() => setConfirmingDelete(false)}
                  style={[styles.smallActionButton, { marginTop: 0, borderWidth: 1, borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.text, fontWeight: '700' }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={async () => {
                    const res = await deleteAccount();
                    if (!res.ok) setConfirmingDelete(false);
                  }}
                  style={[styles.smallActionButton, { marginTop: 0, backgroundColor: colors.danger }]}
                >
                  <Text style={styles.primaryButtonText}>Confirm Delete</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

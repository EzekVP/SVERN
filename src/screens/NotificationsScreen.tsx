import { Pressable, ScrollView, Text, View } from 'react-native';
import { styles } from '../styles';
import { ThemeColors } from '../theme';
import { useAppStore } from '../store/useAppStore';
import { User } from '../types/models';

type Props = {
  colors: ThemeColors;
  me: User;
};

export function NotificationsScreen({ colors, me }: Props) {
  const notifications = useAppStore((s) => s.notifications);
  const boxes = useAppStore((s) => s.boxes);
  const users = useAppStore((s) => s.users);
  const claimOwnership = useAppStore((s) => s.claimOwnership);

  const visible = notifications.filter((n) => {
    if (!n.boxId) return true;
    const box = boxes.find((b) => b.id === n.boxId);
    return box ? box.participantIds.includes(me.id) : true;
  });

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={[styles.card, { backgroundColor: colors.panel, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Alerts and Notifications</Text>

        {visible.length === 0 ? <Text style={{ color: colors.muted }}>No notifications.</Text> : null}

        {visible.map((n) => {
          const box = boxes.find((b) => b.id === n.boxId);
          const item = box?.items.find((i) => i.id === n.itemId);
          const actor = users.find((u) => u.id === n.actorUserId);
          const canClaim = Boolean(item && box && item.ownerUserId !== me.id && box.participantIds.includes(me.id));

          return (
            <View key={n.id} style={[styles.itemRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{n.message}</Text>
              <Text style={{ color: colors.muted, marginTop: 6 }}>
                By {actor?.name || 'Unknown'} on {new Date(n.createdAt).toLocaleString()}
              </Text>

              {n.type === 'ownership_concern' && canClaim && box && item ? (
                <Pressable
                  onPress={() => claimOwnership(box.id, item.id)}
                  style={[styles.smallActionButton, { backgroundColor: colors.accent }]}
                >
                  <Text style={styles.primaryButtonText}>Take Ownership</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

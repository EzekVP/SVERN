import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { styles } from '../styles';
import { ThemeColors } from '../theme';
import { useAppStore } from '../store/useAppStore';
import { Notification, User } from '../types/models';

type Props = {
  colors: ThemeColors;
  me: User;
};

const isOpenAlert = (n: Notification) =>
  !n.closedAt && (n.type === 'ownership_concern' || n.type === 'friend_request' || n.type === 'chat_mention');

export function AlertsScreen({ colors, me }: Props) {
  const notifications = useAppStore((s) => s.notifications);
  const boxes = useAppStore((s) => s.boxes);
  const users = useAppStore((s) => s.users);
  const claimOwnership = useAppStore((s) => s.claimOwnership);
  const acceptFriendRequest = useAppStore((s) => s.acceptFriendRequest);
  const navigate = useAppStore((s) => s.navigate);
  const [expanded, setExpanded] = useState({
    concerns: true,
    requests: true,
    sentRequests: true,
    mentions: true,
  });

  const { concernAlerts, friendRequests, sentFriendRequests, mentions } = useMemo(() => {
    const scoped = notifications
      .filter(isOpenAlert)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const concernAlerts = scoped.filter((n) => {
      if (n.type !== 'ownership_concern' || !n.boxId || !n.itemId) return false;
      const box = boxes.find((b) => b.id === n.boxId);
      const item = box?.items.find((i) => i.id === n.itemId);
      return Boolean(box && item && item.hasConcern && box.participantIds.includes(me.id));
    });
    const friendRequests = scoped.filter(
      (n) => n.type === 'friend_request' && n.audienceUserIds.includes(me.id) && n.actorUserId !== me.id
    );
    const sentFriendRequests = scoped.filter((n) => n.type === 'friend_request' && n.actorUserId === me.id);
    const mentions = scoped.filter((n) => n.type === 'chat_mention' && n.audienceUserIds.includes(me.id));
    return { concernAlerts, friendRequests, sentFriendRequests, mentions };
  }, [boxes, me.id, notifications]);

  const totalAlerts = concernAlerts.length + friendRequests.length + sentFriendRequests.length + mentions.length;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      {totalAlerts === 0 ? (
        <View style={[styles.card, { backgroundColor: colors.panel, borderColor: colors.border }]}>
          <Text style={{ color: colors.muted }}>No active alerts.</Text>
        </View>
      ) : null}

      <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.panel }]}>
        <Pressable
          onPress={() => setExpanded((prev) => ({ ...prev, concerns: !prev.concerns }))}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Raised Concerns</Text>
          <Text style={{ color: colors.muted, fontWeight: '700' }}>
            {concernAlerts.length} {expanded.concerns ? '\u25BC' : '\u25B6'}
          </Text>
        </Pressable>
        {expanded.concerns ? (
          <View style={{ marginTop: 10, gap: 10 }}>
            {concernAlerts.length === 0 ? <Text style={{ color: colors.muted }}>No active concern alerts.</Text> : null}
            {concernAlerts.map((n) => {
              const box = boxes.find((b) => b.id === n.boxId);
              const item = box?.items.find((i) => i.id === n.itemId);
              const actor = users.find((u) => u.id === n.actorUserId);
              const canClaim = Boolean(item && box && item.ownerUserId !== me.id && box.participantIds.includes(me.id));
              return (
                <View key={n.id} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>{n.message}</Text>
                  <Text style={{ color: colors.muted, marginTop: 6 }}>
                    By {actor?.name || 'Unknown'} on {new Date(n.createdAt).toLocaleString()}
                  </Text>
                  {n.boxId && n.itemId && canClaim ? (
                    <Pressable
                      onPress={() => claimOwnership(n.boxId!, n.itemId!)}
                      style={[styles.smallActionButton, { backgroundColor: colors.accent }]}
                    >
                      <Text style={styles.primaryButtonText}>Take Ownership</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}
      </View>

      <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.panel }]}>
        <Pressable
          onPress={() => setExpanded((prev) => ({ ...prev, requests: !prev.requests }))}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Pending Friend Requests</Text>
          <Text style={{ color: colors.muted, fontWeight: '700' }}>
            {friendRequests.length} {expanded.requests ? '\u25BC' : '\u25B6'}
          </Text>
        </Pressable>
        {expanded.requests ? (
          <View style={{ marginTop: 10, gap: 10 }}>
            {friendRequests.length === 0 ? <Text style={{ color: colors.muted }}>No pending friend requests.</Text> : null}
            {friendRequests.map((n) => {
              const actor = users.find((u) => u.id === n.actorUserId);
              return (
                <View key={n.id} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>{n.message}</Text>
                  <Text style={{ color: colors.muted, marginTop: 6 }}>
                    From {actor?.name || 'Unknown'} on {new Date(n.createdAt).toLocaleString()}
                  </Text>
                  <Pressable
                    onPress={() => acceptFriendRequest(n.id)}
                    style={[styles.smallActionButton, { backgroundColor: colors.accent }]}
                  >
                    <Text style={styles.primaryButtonText}>Accept</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>

      <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.panel }]}>
        <Pressable
          onPress={() => setExpanded((prev) => ({ ...prev, sentRequests: !prev.sentRequests }))}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Sent Requests</Text>
          <Text style={{ color: colors.muted, fontWeight: '700' }}>
            {sentFriendRequests.length} {expanded.sentRequests ? '\u25BC' : '\u25B6'}
          </Text>
        </Pressable>
        {expanded.sentRequests ? (
          <View style={{ marginTop: 10, gap: 10 }}>
            {sentFriendRequests.length === 0 ? <Text style={{ color: colors.muted }}>No sent requests.</Text> : null}
            {sentFriendRequests.map((n) => {
              const recipientId = n.audienceUserIds.find((idValue) => idValue !== me.id);
              const recipient = users.find((u) => u.id === recipientId);
              return (
                <View key={n.id} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>{n.message}</Text>
                  <Text style={{ color: colors.muted, marginTop: 6 }}>
                    To {recipient?.name || 'Unknown'} on {new Date(n.createdAt).toLocaleString()}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>

      <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.panel }]}>
        <Pressable
          onPress={() => setExpanded((prev) => ({ ...prev, mentions: !prev.mentions }))}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Mentions</Text>
          <Text style={{ color: colors.muted, fontWeight: '700' }}>
            {mentions.length} {expanded.mentions ? '\u25BC' : '\u25B6'}
          </Text>
        </Pressable>
        {expanded.mentions ? (
          <View style={{ marginTop: 10, gap: 10 }}>
            {mentions.length === 0 ? <Text style={{ color: colors.muted }}>No mention alerts.</Text> : null}
            {mentions.map((n) => {
              const actor = users.find((u) => u.id === n.actorUserId);
              return (
                <View key={n.id} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>{n.message}</Text>
                  <Text style={{ color: colors.muted, marginTop: 6 }}>
                    By {actor?.name || 'Unknown'} on {new Date(n.createdAt).toLocaleString()}
                  </Text>
                  {n.boxId ? (
                    <Pressable
                      onPress={() => navigate({ name: 'chat', boxId: n.boxId })}
                      style={[styles.smallActionButton, { backgroundColor: colors.accent }]}
                    >
                      <Text style={styles.primaryButtonText}>Open Chat</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { styles } from '../styles';
import { ThemeColors } from '../theme';
import { useAppStore } from '../store/useAppStore';
import { Notification, User } from '../types/models';

type Props = {
  colors: ThemeColors;
  me: User;
};

export function NotificationsScreen({ colors, me }: Props) {
  const notifications = useAppStore((s) => s.notifications);
  const boxes = useAppStore((s) => s.boxes);
  const users = useAppStore((s) => s.users);
  const [dayMarker, setDayMarker] = useState(() => new Date().toDateString());
  const [expanded, setExpanded] = useState({
    today: true,
    yesterday: true,
    lastWeek: true,
    older: true,
  });

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleNextRollover = () => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 100);
      const delay = Math.max(1000, nextMidnight.getTime() - now.getTime());

      timeoutId = setTimeout(() => {
        setDayMarker(new Date().toDateString());
        scheduleNextRollover();
      }, delay);
    };

    scheduleNextRollover();

    return () => clearTimeout(timeoutId);
  }, []);

  const { today, yesterday, lastWeek, older } = useMemo(() => {
    const visible = notifications
      .filter((n) => {
        if (!n.audienceUserIds.includes(me.id)) return false;
        if (!n.boxId) return true;
        const box = boxes.find((b) => b.id === n.boxId);
        return box ? box.participantIds.includes(me.id) : true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    const startOfLastWeek = new Date(startOfToday);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

    const grouped: { today: Notification[]; yesterday: Notification[]; lastWeek: Notification[]; older: Notification[] } = {
      today: [],
      yesterday: [],
      lastWeek: [],
      older: [],
    };

    visible.forEach((n) => {
      const createdAt = new Date(n.createdAt);
      if (createdAt >= startOfToday) {
        grouped.today.push(n);
      } else if (createdAt >= startOfYesterday) {
        grouped.yesterday.push(n);
      } else if (createdAt >= startOfLastWeek) {
        grouped.lastWeek.push(n);
      } else {
        grouped.older.push(n);
      }
    });

    return grouped;
  }, [boxes, dayMarker, me.id, notifications]);

  const totalVisible = today.length + yesterday.length + lastWeek.length + older.length;

  const renderNotification = (n: Notification) => {
    const actor = users.find((u) => u.id === n.actorUserId);
    const isAlertType = n.type === 'ownership_concern' || n.type === 'friend_request' || n.type === 'chat_mention';
    const typeLabel =
      n.type === 'ownership_concern'
        ? 'Concern Raised'
        : n.type === 'ownership_claimed'
          ? 'Concern Closed'
          : n.type === 'friend_request'
            ? 'Friend Request'
            : n.type === 'friend_added'
              ? 'Request Accepted'
              : n.type === 'chat_mention'
                ? 'Mention'
                : 'CommonBox Created';
    const statusLabel = isAlertType ? (n.closedAt ? 'Closed' : 'Open') : 'Completed';

    return (
      <View key={n.id} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.panel }]}>
        <Text style={{ color: colors.muted, fontWeight: '700' }}>{typeLabel}</Text>
        <Text style={{ color: colors.text, fontWeight: '700' }}>{n.message}</Text>
        <Text style={{ color: colors.muted, marginTop: 6 }}>
          By {actor?.name || 'Unknown'} on {new Date(n.createdAt).toLocaleString()}
        </Text>
        <Text style={{ color: colors.muted, marginTop: 6 }}>{statusLabel}</Text>
      </View>
    );
  };

  const renderSection = (key: 'today' | 'yesterday' | 'lastWeek' | 'older', title: string, items: Notification[]) => {
    const isExpanded = expanded[key];
    return (
      <View key={key} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.panel }]}>
        <Pressable
          onPress={() => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>{title}</Text>
          <Text style={{ color: colors.muted, fontWeight: '700' }}>
            {items.length} {isExpanded ? '\u25BC' : '\u25B6'}
          </Text>
        </Pressable>

        {isExpanded ? (
          <View style={{ marginTop: 10, gap: 10 }}>
            {items.length === 0 ? <Text style={{ color: colors.muted }}>No notifications.</Text> : items.map(renderNotification)}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      {totalVisible === 0 ? (
        <View style={[styles.card, { backgroundColor: colors.panel, borderColor: colors.border }]}>
          <Text style={{ color: colors.muted }}>No notifications.</Text>
        </View>
      ) : null}

      {renderSection('today', 'Today', today)}
      {renderSection('yesterday', 'Yesterday', yesterday)}
      {renderSection('lastWeek', 'Last week', lastWeek)}
      {renderSection('older', 'Older', older)}
    </ScrollView>
  );
}

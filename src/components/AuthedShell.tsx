import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { styles } from '../styles';
import { ThemeColors } from '../theme';
import { routeTitle } from '../lib/routes';
import { Drawer } from './Drawer';
import { HomeScreen } from '../screens/HomeScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { FriendsScreen } from '../screens/FriendsScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { ChatScreen } from '../screens/ChatScreen';

type Props = {
  colors: ThemeColors;
};

export function AuthedShell({ colors }: Props) {
  const { width } = useWindowDimensions();
  const users = useAppStore((s) => s.users);
  const boxes = useAppStore((s) => s.boxes);
  const notifications = useAppStore((s) => s.notifications);
  const currentUserId = useAppStore((s) => s.currentUserId);
  const selectedBoxId = useAppStore((s) => s.selectedBoxId);
  const route = useAppStore((s) => s.route);
  const navigate = useAppStore((s) => s.navigate);
  const markNotificationSeen = useAppStore((s) => s.markNotificationSeen);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(drawerAnim, {
      toValue: drawerOpen ? 1 : 0,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [drawerAnim, drawerOpen]);

  const me = users.find((u) => u.id === currentUserId);
  const myBoxes = boxes.filter((b) => currentUserId && b.participantIds.includes(currentUserId));

  const unseenCount = useMemo(() => {
    if (!currentUserId) return 0;
    return notifications.filter((n) => !n.seenBy.includes(currentUserId)).length;
  }, [currentUserId, notifications]);

  const drawerWidth = Math.min(Math.max(width * 0.72, 250), 360);

  useEffect(() => {
    if (route.name === 'notifications') {
      notifications.forEach((n) => markNotificationSeen(n.id));
    }
  }, [markNotificationSeen, notifications, route.name]);

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.topBar, { borderColor: colors.border, backgroundColor: colors.panel }]}>
        <Pressable onPress={() => setDrawerOpen(true)} style={[styles.iconButton, { borderColor: colors.border }]}>
          <Text style={[styles.iconButtonText, { color: colors.text }]}>Menu</Text>
        </Pressable>
        <Text style={[styles.topBarTitle, { color: colors.text }]}>{routeTitle(route.name)}</Text>
        <Pressable onPress={() => navigate({ name: 'notifications' })} style={[styles.iconButton, { borderColor: colors.border }]}>
          <Text style={[styles.iconButtonText, { color: colors.text }]}>
            Alerts {unseenCount > 0 ? `(${unseenCount})` : ''}
          </Text>
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        {route.name === 'home' && me ? <HomeScreen colors={colors} me={me} myBoxes={myBoxes} selectedBoxId={selectedBoxId} /> : null}
        {route.name === 'profile' && me ? <ProfileScreen colors={colors} me={me} /> : null}
        {route.name === 'friends' && me ? <FriendsScreen colors={colors} me={me} /> : null}
        {route.name === 'notifications' && me ? <NotificationsScreen colors={colors} me={me} /> : null}
        {route.name === 'chat' && me ? <ChatScreen colors={colors} me={me} boxId={route.boxId || selectedBoxId} /> : null}
      </View>

      <Drawer
        colors={colors}
        drawerWidth={drawerWidth}
        drawerAnim={drawerAnim}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </View>
  );
}

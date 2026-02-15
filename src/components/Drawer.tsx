import { Animated, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { styles } from '../styles';
import { ThemeColors } from '../theme';
import { useAppStore } from '../store/useAppStore';
import { useState } from 'react';
import { navigateAndClose } from '../lib/routes';

type Props = {
  colors: ThemeColors;
  drawerWidth: number;
  drawerAnim: Animated.Value;
  isOpen: boolean;
  onClose: () => void;
};

export function Drawer({ colors, drawerWidth, drawerAnim, isOpen, onClose }: Props) {
  const navigate = useAppStore((s) => s.navigate);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const themeMode = useAppStore((s) => s.themeMode);
  const logout = useAppStore((s) => s.logout);
  const addBox = useAppStore((s) => s.addBox);
  const me = useAppStore((s) => s.users.find((u) => u.id === s.currentUserId));
  const users = useAppStore((s) => s.users);

  const [newBoxName, setNewBoxName] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);

  const participantOptions = users.filter((u) => u.id !== me?.id);

  const translateX = drawerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-drawerWidth, 0],
  });

  const createBox = async () => {
    const res = await addBox(newBoxName, selectedParticipants);
    if (res.ok) {
      setNewBoxName('');
      setSelectedParticipants([]);
      setPickerOpen(false);
      onClose();
    }
  };

  return (
    <Modal transparent visible={isOpen} animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.drawerBackdrop} onPress={onClose}>
        <Animated.View
          style={[
            styles.drawerPanel,
            {
              width: drawerWidth,
              backgroundColor: colors.panel,
              borderRightColor: colors.border,
              transform: [{ translateX }],
            },
          ]}
        >
          <Pressable>
            <Text style={[styles.drawerHeader, { color: colors.text }]}>Navigation</Text>

            <DrawerLink
              label="Home"
              onPress={() => navigateAndClose(navigate, onClose, { name: 'home' })}
              colors={colors}
            />
            <DrawerLink
              label="Profile"
              onPress={() => navigateAndClose(navigate, onClose, { name: 'profile' })}
              colors={colors}
            />
            <DrawerLink
              label="Friends"
              onPress={() => navigateAndClose(navigate, onClose, { name: 'friends' })}
              colors={colors}
            />
            <DrawerLink
              label="Notifications"
              onPress={() => navigateAndClose(navigate, onClose, { name: 'notifications' })}
              colors={colors}
            />

            <View style={[styles.separator, { backgroundColor: colors.border }]} />

            <TextInput
              placeholder="Create new box"
              placeholderTextColor={colors.muted}
              value={newBoxName}
              onChangeText={setNewBoxName}
              style={[
                styles.input,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                  marginHorizontal: 16,
                },
              ]}
            />

            <Pressable
              onPress={() => setPickerOpen((x) => !x)}
              style={[styles.drawerAction, { borderColor: colors.border, backgroundColor: colors.background }]}
            >
              <Text style={{ color: colors.text }}>Participants ({selectedParticipants.length})</Text>
            </Pressable>

            {pickerOpen ? (
              <View style={{ paddingHorizontal: 16, gap: 8 }}>
                {participantOptions.map((u) => {
                  const selected = selectedParticipants.includes(u.id);
                  return (
                    <Pressable
                      key={u.id}
                      onPress={() =>
                        setSelectedParticipants((prev) =>
                          selected ? prev.filter((idValue) => idValue !== u.id) : [...prev, u.id]
                        )
                      }
                      style={[
                        styles.smallPill,
                        {
                          borderColor: colors.border,
                          backgroundColor: selected ? colors.accentSoft : colors.panel,
                        },
                      ]}
                    >
                      <Text style={{ color: colors.text }}>{u.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <Pressable style={[styles.drawerAction, { backgroundColor: colors.accent }]} onPress={createBox}>
              <Text style={styles.primaryButtonText}>Create Box</Text>
            </Pressable>

            <Pressable onPress={toggleTheme} style={[styles.drawerAction, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text }}>Theme: {themeMode === 'light' ? 'Light' : 'Dark'}</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                logout();
                onClose();
              }}
              style={[styles.drawerAction, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.danger }}>Logout</Text>
            </Pressable>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function DrawerLink({
  label,
  onPress,
  colors,
}: {
  label: string;
  onPress: () => void;
  colors: ThemeColors;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.drawerLink, { borderColor: colors.border }]}>
      <Text style={{ color: colors.text }}>{label}</Text>
    </Pressable>
  );
}

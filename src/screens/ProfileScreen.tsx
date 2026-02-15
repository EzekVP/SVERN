import { ScrollView, Text, View } from 'react-native';
import { styles } from '../styles';
import { ThemeColors } from '../theme';
import { useAppStore } from '../store/useAppStore';
import { User } from '../types/models';

type Props = {
  colors: ThemeColors;
  me: User;
};

export function ProfileScreen({ colors, me }: Props) {
  const boxes = useAppStore((s) => s.boxes.filter((b) => b.participantIds.includes(me.id)));
  const ownedCount = boxes.reduce((count, b) => count + b.items.filter((i) => i.ownerUserId === me.id).length, 0);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={[styles.card, { backgroundColor: colors.panel, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>{me.name}</Text>
        <Text style={{ color: colors.muted }}>{me.email}</Text>

        <View style={[styles.metricGrid, { marginTop: 14 }]}>
          <View style={[styles.metricCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Text style={{ color: colors.muted }}>Boxes</Text>
            <Text style={[styles.metricValue, { color: colors.text }]}>{boxes.length}</Text>
          </View>
          <View style={[styles.metricCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Text style={{ color: colors.muted }}>Owned Items</Text>
            <Text style={[styles.metricValue, { color: colors.text }]}>{ownedCount}</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

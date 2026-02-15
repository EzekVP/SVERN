import { Pressable, Text, View } from 'react-native';
import { ThemeColors } from '../theme';

type ToastTone = 'success' | 'error' | 'info';
type Toast = { id: string; message: string; tone: ToastTone };

type Props = {
  toast?: Toast;
  colors: ThemeColors;
  onDismiss: () => void;
};

export function ToastBanner({ toast, colors, onDismiss }: Props) {
  if (!toast) return null;

  const toneColor =
    toast.tone === 'success' ? '#16a34a' : toast.tone === 'error' ? colors.danger : colors.accent;

  return (
    <View style={{ position: 'absolute', left: 12, right: 12, bottom: 18 }}>
      <Pressable
        onPress={onDismiss}
        style={{
          backgroundColor: colors.panel,
          borderWidth: 1,
          borderColor: toneColor,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        <Text style={{ color: colors.text, fontWeight: '700' }}>{toast.message}</Text>
      </Pressable>
    </View>
  );
}

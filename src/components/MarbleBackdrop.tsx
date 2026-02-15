import { StyleSheet, View } from 'react-native';
import { ThemeColors } from '../theme';
import { styles } from '../styles';

type Props = {
  colors: ThemeColors;
};

export function MarbleBackdrop({ colors }: Props) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View
        style={[
          styles.marbleBlob,
          { top: -80, left: -60, backgroundColor: colors.accentSoft, width: 240, height: 240 },
        ]}
      />
      <View
        style={[
          styles.marbleBlob,
          { bottom: 80, right: -90, backgroundColor: colors.border, width: 300, height: 300 },
        ]}
      />
      <View
        style={[
          styles.marbleBlob,
          { bottom: -40, left: 40, backgroundColor: colors.panel, width: 200, height: 200, opacity: 0.35 },
        ]}
      />
    </View>
  );
}

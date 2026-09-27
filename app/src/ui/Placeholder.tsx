import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, space, type } from './tokens';

// Phase 0 빈 화면. 각 탭이 실제 화면으로 바뀌면 지운다.
export function Placeholder({ title, desc }: { title: string; desc: string }) {
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.card}>
        <Text style={type.desc}>{desc}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.gutter },
  title: { ...type.title, marginTop: space.l, marginBottom: space.m },
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: space.cardPad },
});

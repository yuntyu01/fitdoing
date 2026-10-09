import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { usePalette, useThemedStyles, type Palette } from '../../../ui/theme';
import { fonts, layout, radius, text } from '../../../ui/tokens';
import type { FriendError } from '../state';

/** 불러오는 중 (가운데 작은 원) */
export function Loading() {
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.center}>
      <ActivityIndicator color={c.sub} />
    </View>
  );
}

/** 오류 문구 키 (friends.error.*) */
export function errorKey(e: FriendError) {
  return `friends.error.${e}` as const;
}

/** 불러오기 실패: 안내 + 다시 시도 */
export function ErrorView({ error, onRetry }: { error: FriendError; onRetry?: () => void }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.center}>
      <Text style={styles.title}>{t(errorKey(error))}</Text>
      {onRetry ? (
        <Pressable style={styles.retry} onPress={onRetry} hitSlop={8} accessibilityRole="button">
          <Text style={styles.retryText}>{t('friends.retry')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** 빈 상태: 제목 + 설명 */
export function Empty({ title, body }: { title: string; body?: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.center}>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    center: { paddingVertical: 64, alignItems: 'center', gap: layout.related },
    title: { ...text.heading, color: c.text, textAlign: 'center' },
    body: { ...text.body, color: c.sub, textAlign: 'center' },
    retry: {
      marginTop: 12,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: radius.field,
      borderWidth: layout.hairline,
      borderColor: c.border,
    },
    retryText: { ...text.body, fontFamily: fonts.medium, color: c.text },
  });

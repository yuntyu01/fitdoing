import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Provider } from '../domain/auth';
import { finishLogin } from '../features/auth/afterLogin';
import { loginWithApple, loginWithGoogle, loginWithKakao } from '../features/auth/providers';
import { usePalette, useThemedStyles, type Palette } from '../ui/theme';
import { fonts, layout, radius, size, text } from '../ui/tokens';

// 카카오 버튼은 카카오 가이드대로 노란 바탕을 유지한다. 나머지는 테마의 얇은 테두리 버튼.
const KAKAO = { bg: '#FEE500', text: '#191919' };

interface ButtonProps {
  label: string;
  onPress: () => void;
  busy: boolean;
  disabled: boolean;
  brand?: { bg: string; text: string };
}

function ProviderButton({ label, onPress, busy, disabled, brand }: ButtonProps) {
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const fg = brand ? brand.text : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        brand ? { backgroundColor: brand.bg } : styles.outlined,
        disabled && !busy && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[styles.btnLabel, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

export default function LoginScreen() {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const [busy, setBusy] = useState<Provider | null>(null);
  const [failed, setFailed] = useState(false);

  const run = async (provider: Provider, getToken: () => Promise<string | null>) => {
    if (busy) return;
    setBusy(provider);
    setFailed(false);
    try {
      const token = await getToken();
      if (token) await finishLogin(provider, token); // null 은 사용자가 취소한 것이라 아무 말도 하지 않는다
    } catch (e) {
      console.warn('login failed', e);
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.top}>
          <Text style={styles.name}>{t('app.name')}</Text>
          <Text style={styles.tagline}>{t('login.tagline')}</Text>
        </View>

        <View style={styles.bottom}>
          {busy ? <Text style={styles.status}>{t('login.busy')}</Text> : null}
          {failed && !busy ? <Text style={styles.error}>{t('login.failed')}</Text> : null}
          <ProviderButton
            label={t('login.kakao')}
            onPress={() => run('kakao', loginWithKakao)}
            busy={busy === 'kakao'}
            disabled={busy !== null}
            brand={KAKAO}
          />
          <ProviderButton
            label={t('login.google')}
            onPress={() => run('google', loginWithGoogle)}
            busy={busy === 'google'}
            disabled={busy !== null}
          />
          {Platform.OS === 'ios' ? (
            <ProviderButton
              label={t('login.apple')}
              onPress={() => run('apple', loginWithApple)}
              busy={busy === 'apple'}
              disabled={busy !== null}
            />
          ) : null}
          <Text style={styles.note}>{t('login.note')}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    body: { flexGrow: 1, paddingHorizontal: layout.page, paddingBottom: 12 },
    top: { flex: 1, paddingTop: 72, paddingBottom: 48, gap: 12 },
    name: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 40, color: c.text },
    tagline: { ...text.title, color: c.text },
    bottom: { gap: 12 },
    btn: {
      minHeight: size.button,
      borderRadius: radius.button,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    outlined: { borderWidth: layout.hairline, borderColor: c.border },
    btnLabel: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 22 },
    disabled: { opacity: 0.4 },
    pressed: { opacity: 0.7 },
    status: { ...text.caption, color: c.sub, textAlign: 'center' },
    error: { ...text.caption, color: c.text, textAlign: 'center' },
    note: { ...text.caption, color: c.sub, textAlign: 'center', marginTop: 8 },
  });

import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlarmClock, MapPin, MessageCircle, MessageSquare, Phone, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { colors, fonts, radius, size, space, tabular } from '../../../ui/tokens';

/** 검정 바탕 위의 한 단계 밝은 면 (버튼·칩). 토큰에 없는 잠금 화면 전용 값. */
export const LOCK_CARD = '#2A2A2A';

/** 잠금 화면 틀: 검정 바탕, 뒤로 가기 막음, 하단 고정 영역 */
export function LockFrame({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    // 뒤로 가기로 잠금 화면을 벗어나지 못하게 한다.
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      <View style={styles.body}>{children}</View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function LockTitle({ children }: { children: string }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function LockDesc({ children }: { children: string }) {
  return <Text style={styles.desc}>{children}</Text>;
}

/** 화면에서 가장 큰 숫자. 한 화면에 하나만 쓴다. */
export function BigTimer({ value }: { value: string }) {
  return (
    <Text style={styles.timer} accessibilityRole="timer">
      {value}
    </Text>
  );
}

/** 하단 꽉 찬 56px 버튼. 검정 바탕에서 보이도록 흰색 버튼. */
export function LockButton({
  label,
  onPress,
  disabled,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: primary ? colors.lockText : LOCK_CARD },
        disabled && { opacity: 0.35 },
        pressed && !disabled && { opacity: 0.85 },
      ]}
    >
      <Text style={[styles.btnText, { color: primary ? colors.text : colors.lockText }]}>{label}</Text>
    </Pressable>
  );
}

function open(url: string) {
  Linking.openURL(url).catch(() => {});
}

type Contact = 'call' | 'sms' | 'map' | 'kakao' | 'alarm';

const ICONS: Record<Contact, LucideIcon> = { call: Phone, sms: MessageCircle, map: MapPin, kakao: MessageSquare, alarm: AlarmClock };

function openContact(kind: Contact) {
  switch (kind) {
    case 'call':
      return open('tel:');
    case 'sms':
      return open('sms:');
    case 'map':
      return open('geo:0,0');
    case 'kakao':
      return open('kakaotalk://'); // 카카오톡 앱 열기. 설치돼 있지 않으면 아무 일도 없다
    case 'alarm':
      if (Platform.OS === 'android') Linking.sendIntent('android.intent.action.SHOW_ALARMS').catch(() => {});
  }
}

/** 항상 열려 있는 앱으로 가는 버튼들 (전화·문자·지도·알람) */
export function ContactRow({ kinds }: { kinds: Contact[] }) {
  const { t } = useTranslation();
  return (
    <View style={styles.contacts}>
      {kinds.map((k) => {
        const Icon = ICONS[k];
        return (
          <Pressable
            key={k}
            accessibilityRole="button"
            onPress={() => openContact(k)}
            style={({ pressed }) => [styles.contact, pressed && { opacity: 0.7 }]}
          >
            <Icon size={22} color={colors.lockText} strokeWidth={1.6} />
            <Text style={styles.contactLabel}>{t(`lock.${k}`)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.lockBg },
  body: { flex: 1, paddingHorizontal: space.gutter, paddingTop: space.xl, gap: space.m },
  footer: { paddingHorizontal: space.gutter, paddingBottom: space.s, paddingTop: space.s, gap: space.gap },
  title: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 32, color: colors.lockText },
  desc: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.lockSub },
  timer: {
    fontFamily: fonts.bold,
    fontSize: 56,
    lineHeight: 64,
    color: colors.lockText,
    marginTop: space.l,
    ...tabular,
  },
  btn: { height: size.button, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 24 },
  contacts: { flexDirection: 'row', gap: space.gap },
  contact: {
    flex: 1,
    height: 72,
    borderRadius: radius.button,
    backgroundColor: LOCK_CARD,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  contactLabel: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: colors.lockText },
});

import { AlarmClock, MapPin, MessageCircle, MessageSquare, Phone, type LucideIcon } from 'lucide-react-native';
import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Divider } from '../../../ui/Card';
import { Screen } from '../../../ui/Screen';
import { usePalette, useThemedStyles, type Palette } from '../../../ui/theme';
import { layout, text } from '../../../ui/tokens';

/** 하드웨어 뒤로 가기를 막는다. onBack이 있으면 대신 그걸 부른다 (잠금 화면 안의 비상 해제 화면 닫기). */
export function useBlockBack(onBack?: () => void) {
  const handler = useRef(onBack);
  useEffect(() => {
    handler.current = onBack;
  });
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handler.current?.();
      return true;
    });
    return () => sub.remove();
  }, []);
}

interface FrameProps {
  /** 맨 위 작은 이름 ("끼니 잠금") */
  label: string;
  title: string;
  desc?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * 잠금 화면 틀: 앱 테마 배경, 뒤로 가기 없음(잠금은 닫을 수 없다), 스크롤 본문 + 하단 고정 영역.
 * 작은 화면에서는 본문이 스크롤돼 하단 버튼에 가리지 않는다.
 */
export function LockFrame({ label, title, desc, children, footer }: FrameProps) {
  const styles = useThemedStyles(makeStyles);
  useBlockBack();
  return (
    <Screen
      header={
        <View style={styles.header}>
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
        </View>
      }
      title={title}
      desc={desc}
      footer={footer}
    >
      {children}
    </Screen>
  );
}

/** 남은 시간 묶음. 숫자는 화면에서 가장 크게, 한 화면에 하나만. */
export function LockTimer({ caption, value, note }: { caption: string; value: string; note?: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.timerBlock}>
      <Text style={styles.caption}>{caption}</Text>
      <Text style={styles.timer} accessibilityRole="timer">
        {value}
      </Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

/** 위아래 구분선 + 두 칸 숫자 (가운데 얇은 세로선) */
export function LockStats({ items }: { items: { label: string; value: string }[] }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View>
      <Divider />
      <View style={styles.stats}>
        {items.map((it, i) => (
          <Fragment key={it.label}>
            {i > 0 ? <View style={styles.vline} /> : null}
            <View style={styles.stat}>
              <Text style={styles.caption}>{it.label}</Text>
              <Text style={styles.statValue}>{it.value}</Text>
            </View>
          </Fragment>
        ))}
      </View>
    </View>
  );
}

/** 구분선으로 나눈 "항목 · 값" 줄 (취침 시각처럼). outer면 맨 위·아래에도 선을 긋는다. */
export function LockRows({ items, outer = true }: { items: { label: string; value: string }[]; outer?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View>
      {items.map((it, i) => (
        <Fragment key={it.label}>
          {outer || i > 0 ? <Divider /> : null}
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{it.label}</Text>
            <Text style={styles.rowValue}>{it.value}</Text>
          </View>
        </Fragment>
      ))}
      {outer ? <Divider /> : null}
    </View>
  );
}

/** 주 버튼 아래 글자 버튼들. 둘 이상이면 얇은 세로선으로 나눈다. */
export function TextActions({ items }: { items: { label: string; onPress: () => void; disabled?: boolean }[] }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.actions}>
      {items.map((it, i) => (
        <Fragment key={it.label}>
          {i > 0 ? <View style={styles.vlineShort} /> : null}
          <Pressable
            accessibilityRole="button"
            disabled={it.disabled}
            onPress={it.onPress}
            hitSlop={4}
            style={({ pressed }) => [styles.action, it.disabled && styles.disabled, pressed && styles.pressed]}
          >
            <Text style={styles.actionText}>{it.label}</Text>
          </Pressable>
        </Fragment>
      ))}
    </View>
  );
}

function open(url: string) {
  Linking.openURL(url).catch(() => {});
}

type Contact = 'call' | 'sms' | 'map' | 'kakao' | 'alarm';

const ICONS: Record<Contact, LucideIcon> = {
  call: Phone,
  sms: MessageCircle,
  map: MapPin,
  kakao: MessageSquare,
  alarm: AlarmClock,
};

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

/** 잠금 중에도 열 수 있는 앱 (전화·문자·지도·알람). 주 버튼과 겨루지 않게 작은 아이콘 줄로 둔다. */
export function ContactRow({ kinds }: { kinds: Contact[] }) {
  const { t } = useTranslation();
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.contacts}>
      {kinds.map((k) => {
        const Icon = ICONS[k];
        return (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityLabel={t(`lock.${k}`)}
            onPress={() => openContact(k)}
            hitSlop={6}
            style={({ pressed }) => [styles.contact, pressed && styles.pressed]}
          >
            <Icon size={20} color={c.sub} strokeWidth={1.7} />
            <Text style={styles.contactLabel}>{t(`lock.${k}`)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    header: { height: 56, justifyContent: 'center' },
    label: { ...text.heading, color: c.text },
    timerBlock: { gap: 4 },
    caption: { ...text.caption, color: c.sub },
    timer: { ...text.timer, color: c.text, fontVariant: ['tabular-nums'] },
    note: { ...text.body, color: c.sub },
    stats: { flexDirection: 'row', paddingTop: 20 },
    stat: { flex: 1, gap: layout.related },
    vline: { width: layout.hairline, backgroundColor: c.line, marginHorizontal: 20 },
    statValue: { ...text.title, color: c.text, fontVariant: ['tabular-nums'] },
    row: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 12,
    },
    rowLabel: { ...text.label, color: c.text, flexShrink: 1 },
    rowValue: { ...text.heading, color: c.text, fontVariant: ['tabular-nums'] },
    actions: { flexDirection: 'row', alignItems: 'center' },
    action: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
    actionText: { ...text.body, color: c.sub, textAlign: 'center' },
    vlineShort: { width: layout.hairline, height: 16, backgroundColor: c.line },
    contacts: { flexDirection: 'row', justifyContent: 'center', gap: 28, paddingBottom: 4 },
    contact: { alignItems: 'center', gap: 4, minWidth: 44, paddingVertical: 4 },
    contactLabel: { ...text.small, color: c.sub },
    disabled: { opacity: 0.4 },
    pressed: { opacity: 0.6 },
  });

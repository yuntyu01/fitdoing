import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { couponBlock, type CouponType } from '../../domain/coupons';
import { BottomSheet } from '../../ui/BottomSheet';
import { Divider, SectionLabel } from '../../ui/Card';
import { FullButton } from '../../ui/FullButton';
import { ListRow } from '../../ui/ListRow';
import { usePalette, useThemedStyles, type Palette } from '../../ui/theme';
import { fonts, layout, radius, text } from '../../ui/tokens';
import { useSettingsValue } from '../settings/store';
import { useGymDoneToday, useRestCoupon } from './useCoupons';

/**
 * 쿠폰 시트: 지금 쓸 수 있는 쿠폰 고르기(라디오) · 사용 날짜(오늘) · [쿠폰 사용하기], 이번 주 사용 내역.
 * 휴식권은 헬스 상세 "오늘 쉬기"와 같은 함수(useRestCoupon)를 써서 5초 대기 뒤 확정되고 효과도 같다.
 * 치팅은 앱에 쓰는 곳이 없어서(매운맛 전용) 이유와 함께 막아 둔다.
 */
export function CouponSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  // 열 때마다 새로 시작한다 (고른 쿠폰·대기·확정 표시). 닫으면 대기 중인 사용도 취소된다.
  const [session, setSession] = useState(0);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setSession((n) => n + 1);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('coupons.title')}>
      <CouponBody key={session} />
    </BottomSheet>
  );
}

function CouponBody() {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const { height } = useWindowDimensions();
  const settings = useSettingsValue();
  const rest = useRestCoupon();
  const { status } = rest;
  const doneToday = useGymDoneToday();
  const gym = { enabled: settings.gym.enabled, doneToday };
  const blocks = { rest: couponBlock('rest', status, gym), cheat: couponBlock('cheat', status, gym) };
  const [picked, setPicked] = useState<CouponType>('rest');
  // 고른 쿠폰이 막혀 있으면(오늘 이미 인증 등) 고르지 않은 것으로 본다
  const selected = blocks[picked] === null ? picked : null;
  const waiting = rest.secondsLeft !== null;

  const now = new Date();
  const options: { type: CouponType; label: string; desc: string }[] = [
    { type: 'rest', label: t('coupons.restUse'), desc: t('coupons.restUseDesc') },
    { type: 'cheat', label: t('coupons.cheatUse'), desc: t('coupons.cheatUseDesc') },
  ];

  return (
    <View>
      {/* 사용 내역이 길어도 버튼이 화면 밖으로 밀리지 않게 내용만 스크롤한다 */}
      <ScrollView style={{ maxHeight: height * 0.55 }} keyboardShouldPersistTaps="handled">
        <View style={styles.options}>
          {options.map((o) => {
            const block = blocks[o.type];
            return (
              <CouponOption
                key={o.type}
                label={o.label}
                desc={block ? t(`coupons.block_${block}`) : o.desc}
                count={t('coupons.left', { left: status[o.type].left, total: status[o.type].total })}
                selected={selected === o.type}
                disabled={block !== null || waiting}
                onPress={() => setPicked(o.type)}
              />
            );
          })}
        </View>
        <View style={styles.divider}>
          <Divider />
        </View>
        <ListRow
          label={t('coupons.useDate')}
          value={t('coupons.today', { month: now.getMonth() + 1, day: now.getDate() })}
        />

        <View style={styles.history}>
          <SectionLabel>{t('coupons.usesTitle')}</SectionLabel>
          {status.uses.length === 0 ? (
            <Text style={styles.empty}>{t('coupons.usesEmpty')}</Text>
          ) : (
            status.uses.map((u, i) => {
              const d = new Date(u.usedAt);
              const wd = (d.getDay() + 6) % 7;
              return (
                <ListRow
                  key={`${u.usedAt}-${i}`}
                  label={t(`coupons.${u.type}`)}
                  value={t('coupons.usedOn', {
                    month: d.getMonth() + 1,
                    day: d.getDate(),
                    weekday: t(`weekdayShort.${String(wd) as '0'}`),
                  })}
                />
              );
            })
          )}
          <Text style={styles.note}>{t('coupons.resetNote')}</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {rest.confirmed ? <Text style={styles.done}>{t('coupons.restConfirmed')}</Text> : null}
        {waiting ? (
          <FullButton
            variant="secondary"
            label={t('coupons.cancelWait', { n: rest.secondsLeft })}
            onPress={rest.cancel}
          />
        ) : (
          <FullButton label={t('coupons.use')} onPress={rest.start} disabled={selected !== 'rest' || !rest.canUse} />
        )}
      </View>
    </View>
  );
}

interface OptionProps {
  label: string;
  desc: string;
  count: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}

/** 왼쪽 라디오 · 이름과 설명 · 오른쪽 남은 장수. 고른 줄은 회색 채움. 막힌 줄은 이름을 흐리게 하고 이유를 설명 자리에 둔다. */
function CouponOption({ label, desc, count, selected, disabled, onPress }: OptionProps) {
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.option, selected && styles.optionOn, pressed && styles.pressed]}
    >
      {selected ? (
        <View style={styles.dotOn}>
          <Check size={14} color={c.bg} strokeWidth={3} />
        </View>
      ) : (
        <View style={[styles.dot, disabled && styles.dim]} />
      )}
      <View style={styles.optionText}>
        <Text style={[styles.optionLabel, selected && styles.optionLabelOn, disabled && styles.dim]}>{label}</Text>
        <Text style={styles.optionDesc}>{desc}</Text>
      </View>
      <Text style={[styles.count, disabled && styles.dim]}>{count}</Text>
    </Pressable>
  );
}

const DOT = 24;

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    options: { gap: 4 },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: layout.inner,
      paddingVertical: 14,
      borderRadius: radius.field,
    },
    optionOn: { backgroundColor: c.selected },
    pressed: { opacity: 0.7 },
    dim: { opacity: 0.4 },
    optionText: { flex: 1, gap: 4 },
    optionLabel: { ...text.label, color: c.text },
    optionLabelOn: { fontFamily: fonts.semibold },
    optionDesc: { ...text.caption, color: c.sub },
    count: { ...text.body, color: c.sub, fontVariant: ['tabular-nums'] },
    dot: { width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 1.5, borderColor: c.faint },
    dotOn: {
      width: DOT,
      height: DOT,
      borderRadius: DOT / 2,
      backgroundColor: c.text,
      alignItems: 'center',
      justifyContent: 'center',
    },
    divider: { marginTop: 12 },
    history: { marginTop: 20 },
    empty: { ...text.body, color: c.sub, paddingVertical: 8 },
    note: { ...text.caption, color: c.sub, marginTop: layout.related },
    footer: { gap: 8, marginTop: 20 },
    done: { ...text.caption, color: c.sub, textAlign: 'center' },
  });

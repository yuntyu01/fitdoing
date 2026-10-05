import { Dumbbell, Utensils } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '../../ui/BottomSheet';
import { FullButton } from '../../ui/FullButton';
import { colors, fonts, radius, space, tabular, type } from '../../ui/tokens';
import { useCouponStatus } from './useCoupons';

/** 휴식 n/2 · 치팅 n/2, 이번 주 사용 내역, 월요일 초기화 안내 */
export function CouponSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const status = useCouponStatus();

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('coupons.title')}>
      <View style={styles.row}>
        <Count label={t('coupons.rest')} left={status.rest.left} total={status.rest.total} />
        <Count label={t('coupons.cheat')} left={status.cheat.left} total={status.cheat.total} />
      </View>

      <Text style={styles.section}>{t('coupons.usesTitle')}</Text>
      {status.uses.length === 0 ? (
        <Text style={styles.empty}>{t('coupons.usesEmpty')}</Text>
      ) : (
        <View style={styles.list}>
          {status.uses.map((u, i) => {
            const d = new Date(u.usedAt);
            const wd = (d.getDay() + 6) % 7;
            const Icon = u.type === 'rest' ? Dumbbell : Utensils;
            return (
              <View key={`${u.usedAt}-${i}`} style={styles.useRow}>
                <Icon size={20} color={colors.text} strokeWidth={1.8} />
                <Text style={styles.useLabel}>{t(`coupons.${u.type}`)}</Text>
                <Text style={styles.useDate}>
                  {t('coupons.usedOn', {
                    month: d.getMonth() + 1,
                    day: d.getDate(),
                    weekday: t(`weekdayShort.${String(wd) as '0'}`),
                  })}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      <Text style={styles.note}>{t('coupons.resetNote')}</Text>
      <View style={styles.btn}>
        <FullButton label={t('common.done')} onPress={onClose} />
      </View>
    </BottomSheet>
  );
}

function Count({ label, left, total }: { label: string; left: number; total: number }) {
  return (
    <View style={styles.count}>
      <Text style={styles.countLabel}>{label}</Text>
      <Text style={styles.countValue}>
        {left}
        <Text style={styles.countTotal}> / {total}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.gap },
  count: { flex: 1, backgroundColor: colors.bg, borderRadius: radius.tile, padding: space.m, gap: space.xs },
  countLabel: { ...type.desc },
  countValue: { ...type.number },
  countTotal: { fontFamily: fonts.regular, fontSize: 17, color: colors.sub, ...tabular },
  section: { fontFamily: fonts.medium, fontSize: 15, color: colors.sub, marginTop: space.l, marginBottom: space.s },
  empty: { ...type.desc, color: colors.faint },
  list: { gap: space.s },
  useRow: { flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: 36 },
  useLabel: { fontFamily: fonts.medium, fontSize: 17, color: colors.text, flex: 1 },
  useDate: { ...type.desc, ...tabular },
  note: { ...type.caption, marginTop: space.l },
  btn: { marginTop: space.m },
});

import { Dumbbell, Lock, Moon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, Text, View } from 'react-native';

import { formatNumber, roundGram, roundKcal } from '../../domain/format';
import type { DayDetail } from '../../domain/records';
import { parseDateKey } from '../../domain/time';
import type { Targets } from '../../domain/targets';
import { Card } from '../../ui/Card';
import { colors, fonts, radius, space, tabular, type } from '../../ui/tokens';

export function DayCard({ detail, targets }: { detail: DayDetail; targets: Targets }) {
  const { t } = useTranslation();
  const d = parseDateKey(detail.date);
  const wd = String((d.getDay() + 6) % 7) as '0';
  const { totals } = detail;

  return (
    <Card>
      <Text style={type.heading}>
        {t('date.full', { month: d.getMonth() + 1, day: d.getDate(), weekday: t(`weekdayLong.${wd}`) })}
      </Text>

      {detail.empty ? (
        <Text style={[type.desc, styles.empty]}>{t('records.dayEmpty')}</Text>
      ) : (
        <>
          <View style={styles.kcalRow}>
            <Text style={type.desc}>{t('home.kcalLabel')}</Text>
            <Text style={styles.kcal}>
              <Text style={styles.kcalNum}>{formatNumber(roundKcal(totals.kcal))}</Text> / {formatNumber(targets.kcal)}{' '}
              {t('common.kcal')}
            </Text>
          </View>
          <View style={styles.macros}>
            <Macro label={t('home.carbs')} v={totals.carbs} target={targets.carbs} />
            <Macro label={t('home.protein')} v={totals.protein} target={targets.protein} />
            <Macro label={t('home.fat')} v={totals.fat} target={targets.fat} />
          </View>

          <View style={styles.thumbs}>
            {detail.meals.map((m) => (
              <View key={m.index} style={styles.thumbCol}>
                <View style={styles.thumb}>
                  {m.photoUri ? <Image source={{ uri: m.photoUri }} style={styles.img} /> : null}
                </View>
                <Text style={styles.thumbLabel}>{t('common.meal', { n: m.index })}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <View style={styles.flags}>
        <Flag icon={<Dumbbell size={18} color={detail.gym ? colors.text : colors.faint} strokeWidth={1.8} />} on={detail.gym} label={detail.gym ? t('records.gymDone') : t('records.gymNone')} />
        <Flag icon={<Lock size={18} color={detail.locked ? colors.text : colors.faint} strokeWidth={1.8} />} on={detail.locked} label={detail.locked ? t('records.lockedYes') : t('records.lockedNo')} />
        {detail.sleep ? <Flag icon={<Moon size={18} color={colors.text} strokeWidth={1.8} />} on label={t('records.sleepDone')} /> : null}
      </View>
    </Card>
  );
}

function Macro({ label, v, target }: { label: string; v: number; target: number }) {
  const { t } = useTranslation();
  return (
    <View style={styles.macro}>
      <Text style={type.caption}>{label}</Text>
      <Text style={styles.macroVal}>
        {roundGram(v)}
        <Text style={styles.macroTarget}>
          {' '}
          / {target}
          {t('common.gram')}
        </Text>
      </Text>
    </View>
  );
}

function Flag({ icon, on, label }: { icon: React.ReactNode; on: boolean; label: string }) {
  return (
    <View style={styles.flag}>
      {icon}
      <Text style={[styles.flagText, !on && { color: colors.faint }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { marginTop: space.s },
  kcalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: space.m },
  kcal: { fontFamily: fonts.regular, fontSize: 15, color: colors.sub, ...tabular },
  kcalNum: { fontFamily: fonts.bold, fontSize: 22, color: colors.text, ...tabular },
  macros: { flexDirection: 'row', marginTop: space.m, gap: space.gap },
  macro: { flex: 1, gap: 2 },
  macroVal: { fontFamily: fonts.bold, fontSize: 17, color: colors.text, ...tabular },
  macroTarget: { fontFamily: fonts.regular, fontSize: 13, color: colors.sub },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: space.l },
  thumbCol: { alignItems: 'center', gap: 4, width: 56 },
  thumb: { width: 56, height: 56, borderRadius: radius.tile - 4, backgroundColor: colors.bg, overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
  thumbLabel: { ...type.caption, fontSize: 12 },
  flags: { gap: space.s, marginTop: space.l },
  flag: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  flagText: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
});

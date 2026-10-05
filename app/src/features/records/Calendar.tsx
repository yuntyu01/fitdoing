import { ChevronLeft, ChevronRight, Dumbbell, Moon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dayState, type DayFacts, type YearMonth } from '../../domain/calendar';
import { colors, fonts, radius, space, tabular } from '../../ui/tokens';

interface Props {
  ym: YearMonth;
  weeks: (string | null)[][];
  facts: Map<string, DayFacts>;
  today: string;
  selected: string | null;
  onSelect: (date: string) => void;
  onShift: (delta: number) => void;
}

const FULL_BG = colors.accent;
const PARTIAL_BG = '#D5D9DE';

export function Calendar({ ym, weeks, facts, today, selected, onSelect, onShift }: Props) {
  const { t } = useTranslation();
  return (
    <View>
      <View style={styles.head}>
        <Pressable onPress={() => onShift(-1)} hitSlop={12} accessibilityLabel={t('records.prevMonth')}>
          <ChevronLeft size={24} color={colors.text} strokeWidth={1.8} />
        </Pressable>
        <Text style={styles.month}>{t('records.monthTitle', { year: ym.year, month: ym.month + 1 })}</Text>
        <Pressable onPress={() => onShift(1)} hitSlop={12} accessibilityLabel={t('records.nextMonth')}>
          <ChevronRight size={24} color={colors.text} strokeWidth={1.8} />
        </Pressable>
      </View>
      <View style={styles.week}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <Text key={i} style={styles.wd}>
            {t(`weekdayShort.${String(i) as '0'}`)}
          </Text>
        ))}
      </View>
      {weeks.map((w, wi) => (
        <View key={wi} style={styles.week}>
          {w.map((date, ci) => {
            if (!date) return <View key={ci} style={styles.cell} />;
            const f = facts.get(date);
            const st = f ? dayState(f) : 'none';
            const isToday = date === today;
            const isSel = date === selected;
            const full = st === 'full';
            return (
              <Pressable key={ci} style={styles.cell} onPress={() => onSelect(date)}>
                <View style={[styles.box, isToday && styles.today, isSel && styles.sel]}>
                  <View
                    style={[
                      styles.circle,
                      st === 'full' && { backgroundColor: FULL_BG },
                      st === 'partial' && { backgroundColor: PARTIAL_BG },
                    ]}
                  >
                    <Text style={[styles.day, full && { color: colors.onAccent }]}>{Number(date.slice(8))}</Text>
                  </View>
                  <View style={styles.marks}>
                    {f?.locked ? <View style={styles.dot} /> : null}
                    {f?.gym ? <Dumbbell size={11} color={colors.text} strokeWidth={2} /> : null}
                    {f?.sleep ? <Moon size={11} color={colors.sub} strokeWidth={2} /> : null}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.m },
  month: { fontFamily: fonts.bold, fontSize: 18, color: colors.text, ...tabular },
  week: { flexDirection: 'row' },
  wd: { flex: 1, textAlign: 'center', fontFamily: fonts.regular, fontSize: 13, color: colors.sub, paddingBottom: space.s },
  cell: { flex: 1, aspectRatio: 0.78, padding: 1 },
  box: { flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 3, borderWidth: 1.5, borderColor: 'transparent' },
  today: { borderColor: colors.line },
  sel: { borderColor: colors.accent },
  circle: { width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  day: { fontFamily: fonts.medium, fontSize: 15, color: colors.text, ...tabular },
  marks: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, height: 12 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.text },
});

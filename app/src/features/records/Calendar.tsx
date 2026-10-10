import { Check, ChevronDown, ChevronLeft, ChevronRight, Circle, Dumbbell, Lock } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dayState, type DayFacts, type YearMonth } from '../../domain/calendar';
import { usePalette, useThemedStyles, type Palette } from '../../ui/theme';
import { fonts, layout, radius, text } from '../../ui/tokens';

interface Props {
  ym: YearMonth;
  weeks: (string | null)[][];
  facts: Map<string, DayFacts>;
  today: string;
  selected: string | null;
  onSelect: (date: string) => void;
  onShift: (delta: number) => void;
  /** 달 제목을 누르면 (연·월 고르기) */
  onPickMonth?: () => void;
  note?: string; // 달 제목 아래 한 줄 (이 달 요약)
}

const MARK = 10; // 숫자 아래 작은 표시 크기

/**
 * 상자 없는 달력. 오늘은 얇은 테두리, 고른 날(오늘이 아니면)은 회색 채움.
 * 숫자 아래에 끼니(모두 ✓ / 일부 ○), 잠김, 헬스를 작게 — 한 칸에 셋까지만.
 */
export function Calendar({ ym, weeks, facts, today, selected, onSelect, onShift, onPickMonth, note }: Props) {
  const { t } = useTranslation();
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  return (
    <View>
      <View style={styles.head}>
        <Pressable
          onPress={onPickMonth}
          disabled={!onPickMonth}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityHint={t('records.pickMonth')}
          style={({ pressed }) => [styles.monthBtn, pressed && styles.pressed]}
        >
          <Text style={styles.month}>{t('records.monthTitle', { year: ym.year, month: ym.month + 1 })}</Text>
          {onPickMonth ? <ChevronDown size={18} color={c.sub} strokeWidth={1.8} /> : null}
        </Pressable>
        <View style={styles.nav}>
          <Pressable onPress={() => onShift(-1)} hitSlop={12} accessibilityLabel={t('records.prevMonth')}>
            <ChevronLeft size={22} color={c.text} strokeWidth={1.8} />
          </Pressable>
          <Pressable onPress={() => onShift(1)} hitSlop={12} accessibilityLabel={t('records.nextMonth')}>
            <ChevronRight size={22} color={c.text} strokeWidth={1.8} />
          </Pressable>
        </View>
      </View>
      {note ? <Text style={styles.note}>{note}</Text> : null}

      <View style={[styles.week, styles.weekHead]}>
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
            const isSel = date === selected && !isToday; // 오늘은 테두리만으로 충분하다
            return (
              <Pressable
                key={ci}
                style={styles.cell}
                onPress={() => onSelect(date)}
                accessibilityRole="button"
                accessibilityState={{ selected: date === selected }}
                accessibilityLabel={date}
              >
                <View style={[styles.box, isToday && styles.today, isSel && styles.sel]}>
                  <Text style={[styles.day, (isToday || isSel) && styles.dayOn]}>{Number(date.slice(8))}</Text>
                </View>
                <View style={styles.marks}>
                  {st === 'full' ? <Check size={MARK + 1} color={c.text} strokeWidth={2.5} /> : null}
                  {st === 'partial' ? <Circle size={MARK - 2} color={c.sub} strokeWidth={2.5} /> : null}
                  {f?.locked ? <Lock size={MARK} color={c.sub} strokeWidth={2.2} /> : null}
                  {f?.gym ? <Dumbbell size={MARK} color={c.sub} strokeWidth={2.2} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** 달력 아래 한 줄 범례. 달력이 쓰는 표시만 적는다. */
export function CalendarLegend() {
  const { t } = useTranslation();
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const item = (icon: ReactNode, label: string) => (
    <View style={styles.key}>
      {icon}
      <Text style={styles.keyText}>{label}</Text>
    </View>
  );
  return (
    <View style={styles.legend}>
      {item(<Check size={MARK + 1} color={c.sub} strokeWidth={2.5} />, t('records.legendFull'))}
      {item(<Circle size={MARK - 2} color={c.sub} strokeWidth={2.5} />, t('records.legendPartial'))}
      {item(<Lock size={MARK} color={c.sub} strokeWidth={2.2} />, t('records.legendLocked'))}
      {item(<Dumbbell size={MARK} color={c.sub} strokeWidth={2.2} />, t('records.legendGym'))}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    pressed: { opacity: 0.6 },
    monthBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: layout.related },
    month: { ...text.heading, color: c.text, fontVariant: ['tabular-nums'] },
    nav: { flexDirection: 'row', alignItems: 'center', gap: 20 },
    note: { ...text.caption, color: c.sub, marginTop: 4, fontVariant: ['tabular-nums'] },
    week: { flexDirection: 'row' },
    weekHead: { marginTop: 20, marginBottom: 6 },
    wd: { ...text.caption, flex: 1, textAlign: 'center', color: c.sub },
    cell: { flex: 1, alignItems: 'center', paddingVertical: 4, gap: 2 },
    box: {
      width: 36,
      height: 36,
      borderRadius: radius.day,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: layout.hairline,
      borderColor: 'transparent',
    },
    today: { borderColor: c.focus },
    sel: { backgroundColor: c.selected },
    day: { ...text.body, color: c.text, fontVariant: ['tabular-nums'] },
    dayOn: { fontFamily: fonts.semibold },
    marks: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, height: 12 },
    legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4, marginTop: 12 },
    key: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    keyText: { ...text.small, color: c.sub },
  });

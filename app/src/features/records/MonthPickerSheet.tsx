import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { YearMonth } from '../../domain/calendar';
import { BottomSheet } from '../../ui/BottomSheet';
import { usePalette, useThemedStyles, type Palette } from '../../ui/theme';
import { fonts, radius, text } from '../../ui/tokens';

/** 달력 제목("2026년 9월")을 누르면 여는 시트: 연도를 넘기고 달을 고르면 그 달로 간다. 앞으로의 달은 고를 수 없다. */
export function MonthPickerSheet({
  visible,
  value,
  latest,
  onClose,
  onPick,
}: {
  visible: boolean;
  value: YearMonth;
  latest: YearMonth; // 이번 달
  onClose: () => void;
  onPick: (ym: YearMonth) => void;
}) {
  const { t } = useTranslation();
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const [year, setYear] = useState(value.year);
  const [seen, setSeen] = useState<boolean>(false);
  // 열릴 때마다 지금 보고 있는 해에서 시작한다
  if (visible !== seen) {
    setSeen(visible);
    if (visible) setYear(value.year);
  }
  const after = (m: number) => year > latest.year || (year === latest.year && m > latest.month);

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('records.pickMonth')}>
      <View style={styles.yearRow}>
        <Pressable onPress={() => setYear((y) => y - 1)} hitSlop={12} accessibilityLabel={t('records.prevYear')}>
          <ChevronLeft size={22} color={c.text} strokeWidth={1.8} />
        </Pressable>
        <Text style={styles.year}>{t('records.yearTitle', { year })}</Text>
        <Pressable
          onPress={() => setYear((y) => y + 1)}
          disabled={year >= latest.year}
          hitSlop={12}
          accessibilityLabel={t('records.nextYear')}
          style={year >= latest.year && styles.off}
        >
          <ChevronRight size={22} color={c.text} strokeWidth={1.8} />
        </Pressable>
      </View>
      <View style={styles.grid}>
        {Array.from({ length: 12 }, (_, m) => {
          const on = year === value.year && m === value.month;
          const off = after(m);
          return (
            <Pressable
              key={m}
              disabled={off}
              accessibilityRole="button"
              accessibilityState={{ selected: on, disabled: off }}
              onPress={() => onPick({ year, month: m })}
              style={({ pressed }) => [styles.cell, on && styles.cellOn, off && styles.off, pressed && styles.pressed]}
            >
              <Text style={[styles.cellText, on && styles.cellTextOn]}>
                {t('records.monthShort', { month: m + 1 })}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    year: { ...text.heading, color: c.text },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    cell: {
      width: '31%',
      flexGrow: 1,
      height: 48,
      borderRadius: radius.field,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cellOn: { backgroundColor: c.selected, borderColor: c.selected },
    cellText: { ...text.body, color: c.text },
    cellTextOn: { fontFamily: fonts.semibold },
    off: { opacity: 0.35 },
    pressed: { opacity: 0.7 },
  });

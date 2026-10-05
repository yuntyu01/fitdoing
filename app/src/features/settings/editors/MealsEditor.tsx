import { Clock } from 'lucide-react-native';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { resizeMeals, type MealSlot } from '../../../domain/meals';
import { Card, Divider } from '../../../ui/Card';
import { Segmented } from '../../../ui/Segmented';
import { TimeSheet } from '../../../ui/TimeSheet';
import { colors, fonts, space } from '../../../ui/tokens';

const COUNTS = [3, 4, 5, 6];

/** 끼니 수(3~6)와 끼니별 마감 시각 */
export function MealsEditor({ value, onChange }: { value: MealSlot[]; onChange: (v: MealSlot[]) => void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<number | null>(null);
  const current = value.find((m) => m.index === editing);

  return (
    <View style={{ gap: space.l }}>
      <Segmented
        options={COUNTS.map((n) => ({ value: n, label: String(n) }))}
        value={value.length}
        onChange={(n) => onChange(resizeMeals(value, n))}
      />
      <Card style={styles.list}>
        {value.map((m, i) => (
          <Fragment key={m.index}>
            {i > 0 ? <Divider /> : null}
            <Pressable style={styles.row} onPress={() => setEditing(m.index)}>
              <Text style={styles.meal}>{t('common.meal', { n: m.index })}</Text>
              <Text style={styles.time}>{t('common.until', { time: m.deadline })}</Text>
              <Clock size={24} color={colors.sub} strokeWidth={1.6} />
            </Pressable>
          </Fragment>
        ))}
      </Card>
      <TimeSheet
        visible={editing !== null}
        title={editing ? t('common.meal', { n: editing }) : undefined}
        value={current?.deadline ?? '12:00'}
        onClose={() => setEditing(null)}
        onConfirm={(deadline) => {
          onChange(value.map((m) => (m.index === editing ? { ...m, deadline } : m)));
          setEditing(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: 0 },
  row: { height: 77, flexDirection: 'row', alignItems: 'center' },
  meal: { width: 56, fontFamily: fonts.bold, fontSize: 20, color: colors.text },
  time: { flex: 1, textAlign: 'center', fontFamily: fonts.regular, fontSize: 20, color: colors.sub, fontVariant: ['tabular-nums'] },
});

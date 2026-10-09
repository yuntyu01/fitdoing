import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { resizeMeals, type MealSlot } from '../../../domain/meals';
import { ListRow } from '../../../ui/ListRow';
import { Segmented } from '../../../ui/Segmented';
import { TimeSheet } from '../../../ui/TimeSheet';
import { Toggle } from '../../../ui/Toggle';
import { layout } from '../../../ui/tokens';
import { FormSection, Rows } from './Form';

const COUNTS = [3, 4, 5, 6];

interface Props {
  value: MealSlot[];
  onChange: (v: MealSlot[]) => void;
  /** 마감 전 알림 켜기. 넘기면 마감 시간 아래에 스위치 줄을 둔다. */
  notifications?: boolean;
  onNotificationsChange?: (on: boolean) => void;
}

/** 끼니 수(3~6)와 끼니별 마감 시각 (+ 마감 전 알림 켜기) */
export function MealsEditor({ value, onChange, notifications, onNotificationsChange }: Props) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<number | null>(null);
  const current = value.find((m) => m.index === editing);

  return (
    <View style={{ gap: layout.block }}>
      <FormSection title={t('edit.mealCount')}>
        <Segmented
          options={COUNTS.map((n) => ({ value: n, label: t('edit.mealCountValue', { n }) }))}
          value={value.length}
          onChange={(n) => onChange(resizeMeals(value, n))}
        />
      </FormSection>
      <FormSection title={t('edit.deadlines')}>
        <Rows>
          {value.map((m) => (
            <ListRow
              key={m.index}
              label={t('common.meal', { n: m.index })}
              value={m.deadline}
              onPress={() => setEditing(m.index)}
            />
          ))}
        </Rows>
        {notifications !== undefined && onNotificationsChange ? (
          <ListRow
            label={t('edit.notifyBefore')}
            right={<Toggle value={notifications} onChange={onNotificationsChange} />}
          />
        ) : null}
      </FormSection>
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

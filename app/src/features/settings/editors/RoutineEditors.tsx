import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Settings } from '../../../db/schema';
import { clampWeeklyTarget, weeklyTargetForDays } from '../../../domain/stats';
import { DayChips } from '../../../ui/DayChips';
import { ListRow } from '../../../ui/ListRow';
import { TimeSheet } from '../../../ui/TimeSheet';
import { Toggle } from '../../../ui/Toggle';
import { FormSection, Rows, Stepper } from './Form';
import { GymPlaceSheet } from './GymPlaceSheet';

type Gym = Settings['gym'];
type Sleep = Settings['sleep'];

interface EditorProps<T> {
  value: T;
  onChange: (v: T) => void;
  /** 켜기 스위치 옆 소제목. 설정 화면은 상단 제목과 겹치지 않게 다른 말을 넘긴다. */
  title?: string;
}

/** 헬스: 켜기, 주간 목표(고른 요일 수 이하), 요일, 인증 마감(도착 시간), 헬스장 */
export function GymEditor({ value, onChange, title }: EditorProps<Gym>) {
  const { t } = useTranslation();
  const [timeOpen, setTimeOpen] = useState(false);
  const [placeOpen, setPlaceOpen] = useState(false);
  // 예전 값이 요일 수보다 크면 잘라서 보여 준다. 저장하는 화면도 같은 함수로 잘라서 저장한다.
  const target = clampWeeklyTarget(value.weeklyTarget, value.days.length);

  return (
    <FormSection
      title={title ?? t('gym.title')}
      right={<Toggle value={value.enabled} onChange={(enabled) => onChange({ ...value, enabled })} />}
    >
      {value.enabled ? (
        <>
          <ListRow
            label={t('edit.weeklyTarget')}
            right={
              <Stepper
                value={target}
                min={1}
                max={Math.max(1, value.days.length)}
                label={t('edit.weeklyTargetValue', { n: target })}
                onChange={(weeklyTarget) => onChange({ ...value, weeklyTarget })}
              />
            }
          />
          <DayChips
            value={value.days}
            onChange={(days) =>
              onChange({
                ...value,
                days,
                weeklyTarget: weeklyTargetForDays(target, value.days.length, days.length),
              })
            }
          />
          <Rows>
            <ListRow label={t('gym.arriveBy')} value={value.arriveBy} onPress={() => setTimeOpen(true)} />
            <ListRow
              label={t('gym.place')}
              value={value.name || t('gym.placeEmpty')}
              sub={value.address || undefined}
              onPress={() => setPlaceOpen(true)}
            />
          </Rows>
        </>
      ) : null}
      <TimeSheet
        visible={timeOpen}
        title={t('gym.arriveBy')}
        value={value.arriveBy}
        onClose={() => setTimeOpen(false)}
        onConfirm={(arriveBy) => {
          onChange({ ...value, arriveBy });
          setTimeOpen(false);
        }}
      />
      <GymPlaceSheet
        visible={placeOpen}
        value={value}
        onClose={() => setPlaceOpen(false)}
        onConfirm={(place) => {
          onChange({ ...value, ...place });
          setPlaceOpen(false);
        }}
      />
    </FormSection>
  );
}

/** 취침: 켜기, 취침·기상 시각 */
export function SleepEditor({ value, onChange, title }: EditorProps<Sleep>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<'bedTime' | 'wakeTime' | null>(null);

  return (
    <FormSection
      title={title ?? t('edit.sleepTitle')}
      right={<Toggle value={value.enabled} onChange={(enabled) => onChange({ ...value, enabled })} />}
    >
      {value.enabled ? (
        <Rows>
          <ListRow label={t('edit.bedTime')} value={value.bedTime} onPress={() => setOpen('bedTime')} />
          <ListRow label={t('edit.wakeTime')} value={value.wakeTime} onPress={() => setOpen('wakeTime')} />
        </Rows>
      ) : null}
      <TimeSheet
        visible={open !== null}
        title={open ? t(`edit.${open}`) : undefined}
        value={open ? value[open] : '00:00'}
        onClose={() => setOpen(null)}
        onConfirm={(v) => {
          if (open) onChange({ ...value, [open]: v });
          setOpen(null);
        }}
      />
    </FormSection>
  );
}

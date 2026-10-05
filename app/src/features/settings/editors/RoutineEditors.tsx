import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { Settings } from '../../../db/schema';
import { Card, Divider } from '../../../ui/Card';
import { DayChips } from '../../../ui/DayChips';
import { ListRow } from '../../../ui/ListRow';
import { TimeSheet } from '../../../ui/TimeSheet';
import { Toggle } from '../../../ui/Toggle';
import { colors, fonts, space } from '../../../ui/tokens';
import { GymPlaceSheet } from './GymPlaceSheet';

type Gym = Settings['gym'];
type Sleep = Settings['sleep'];

function CardTitle({ title, on, onToggle }: { title: string; on: boolean; onToggle: (v: boolean) => void }) {
  return (
    <View style={styles.titleRow}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Toggle value={on} onChange={onToggle} />
    </View>
  );
}

/** 헬스: 켜기, 요일, 도착 시간, 헬스장 */
export function GymEditor({ value, onChange }: { value: Gym; onChange: (v: Gym) => void }) {
  const { t } = useTranslation();
  const [timeOpen, setTimeOpen] = useState(false);
  const [placeOpen, setPlaceOpen] = useState(false);

  return (
    <Card style={styles.card}>
      <CardTitle title={t('gym.title')} on={value.enabled} onToggle={(enabled) => onChange({ ...value, enabled })} />
      {value.enabled ? (
        <>
          <View style={styles.chips}>
            <DayChips value={value.days} onChange={(days) => onChange({ ...value, days })} />
          </View>
          <Divider />
          <ListRow label={t('gym.arriveBy')} value={value.arriveBy} onPress={() => setTimeOpen(true)} />
          <Divider />
          <ListRow
            label={t('gym.place')}
            value={value.name || t('gym.placeEmpty')}
            sub={value.address || undefined}
            onPress={() => setPlaceOpen(true)}
          />
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
    </Card>
  );
}

/** 취침: 켜기, 취침·기상 시각 */
export function SleepEditor({ value, onChange }: { value: Sleep; onChange: (v: Sleep) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<'bedTime' | 'wakeTime' | null>(null);

  return (
    <Card style={styles.card}>
      <CardTitle
        title={t('sleep.title')}
        on={value.enabled}
        onToggle={(enabled) => onChange({ ...value, enabled })}
      />
      {value.enabled ? (
        <>
          <ListRow label={t('sleep.bedTime')} value={value.bedTime} onPress={() => setOpen('bedTime')} />
          <Divider />
          <ListRow label={t('sleep.wakeTime')} value={value.wakeTime} onPress={() => setOpen('wakeTime')} />
        </>
      ) : null}
      <TimeSheet
        visible={open !== null}
        title={open ? t(`sleep.${open}`) : undefined}
        value={open ? value[open] : '00:00'}
        onClose={() => setOpen(null)}
        onConfirm={(v) => {
          if (open) onChange({ ...value, [open]: v });
          setOpen(null);
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: space.m },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.s },
  cardTitle: { fontFamily: fonts.bold, fontSize: 22, color: colors.text },
  chips: { paddingVertical: space.m },
});

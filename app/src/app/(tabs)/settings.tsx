import { router, type Href } from 'expo-router';
import { Fragment, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatNumber } from '../../domain/format';
import { useSyncStatus } from '../../features/api/store';
import { CouponSheet } from '../../features/coupons/CouponSheet';
import { useSettings, useSettingsValue } from '../../features/settings/store';
import { Card, Divider } from '../../ui/Card';
import { ListRow } from '../../ui/ListRow';
import { Toggle } from '../../ui/Toggle';
import { colors, fonts, space, type } from '../../ui/tokens';

const formatDateTime = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

type Wd = '0' | '1' | '2' | '3' | '4' | '5' | '6';

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Card style={styles.card}>
        {children.map((c, i) => (
          <Fragment key={i}>
            {i > 0 ? <Divider /> : null}
            {c}
          </Fragment>
        ))}
      </Card>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

export default function SettingsScreen() {
  const { t } = useTranslation();
  const s = useSettingsValue();
  const update = useSettings((st) => st.update);
  const [couponOpen, setCouponOpen] = useState(false);
  const syncPending = useSyncStatus((st) => st.pending);
  const lastSyncAt = useSyncStatus((st) => st.lastSyncAt);
  const syncValue =
    syncPending > 0
      ? t('sync.pending', { n: syncPending })
      : lastSyncAt
        ? t('sync.last', { time: formatDateTime(lastSyncAt) })
        : t('sync.never');
  const go = (href: Href) => () => router.push(href);

  const modeLabel = { mild: t('settings.modeMild'), normal: t('settings.modeNormal'), spicy: t('settings.modeSpicy') }[
    s.mode
  ];
  const gymDays = s.gym.days.map((d) => t(`weekdayShort.${String(d) as Wd}`)).join(' ');

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>{t('settings.title')}</Text>

        <Section title={t('settings.sectionRecord')}>
          {[
            <ListRow key="mode" label={t('settings.mode')} value={modeLabel} onPress={go('/edit/mode')} />,
            <ListRow
              key="meals"
              label={t('settings.meals')}
              value={t('settings.mealsValue', { n: s.meals.length })}
              sub={s.meals.map((m) => m.deadline).join(' · ')}
              onPress={go('/edit/meals')}
            />,
            <ListRow
              key="targets"
              label={t('settings.targets')}
              value={`${formatNumber(s.targets.kcal)} ${t('common.kcal')}`}
              onPress={go('/edit/targets')}
            />,
          ]}
        </Section>

        <Section title={t('settings.sectionHabit')}>
          {[
            <ListRow
              key="gym"
              label={t('settings.gym')}
              value={s.gym.enabled ? `${gymDays} · ${s.gym.arriveBy}` : t('common.off')}
              sub={s.gym.enabled ? s.gym.name : undefined}
              onPress={go('/edit/gym')}
            />,
            <ListRow
              key="sleep"
              label={t('settings.sleep')}
              value={s.sleep.enabled ? `${s.sleep.bedTime} → ${s.sleep.wakeTime}` : t('common.off')}
              onPress={go('/edit/sleep')}
            />,
          ]}
        </Section>

        <Section title={t('settings.sectionProfile')}>
          {[
            <ListRow
              key="profile"
              label={t('settings.profile')}
              value={`${t(`goal.${s.goal}`)} · ${s.heightCm}cm · ${s.weightKg}kg`}
              onPress={go('/edit/profile')}
            />,
          ]}
        </Section>

        {/* 잠금 관련 값은 잠금 기능(Phase 3~4)과 함께 편집을 연다. 지금은 값만 보여준다. */}
        <Section title={t('settings.sectionLock')} note={t('settings.lockSoon')}>
          {[
            <ListRow key="lock" disabled label={t('settings.lockMinutes')} value={t('common.hours', { h: s.lockMinutes / 60 })} />,
            <ListRow
              key="emergency"
              disabled
              label={t('settings.emergency')}
              value={t('settings.emergencyValue', { n: s.emergencyPerWeek })}
            />,
            <ListRow
              key="coupons"
              onPress={() => setCouponOpen(true)}
              label={t('settings.coupons')}
              value={t('settings.couponsValue', { rest: s.coupons.rest, cheat: s.coupons.cheat })}
            />,
            <ListRow key="apps" disabled label={t('settings.allowedApps')} value={t('settings.allowedAppsValue')} />,
          ]}
        </Section>

        <Section title={t('settings.sectionPrivacy')} note={`${t('settings.photoAnalysisNote')}\n${t('settings.photoBackupDesc')}`}>
          {[
            <ListRow
              key="backup"
              label={t('settings.photoBackup')}
              right={<Toggle value={s.photoBackup} onChange={(photoBackup) => update({ photoBackup })} />}
            />,
            <ListRow key="sync" disabled label={t('sync.title')} value={syncValue} />,
          ]}
        </Section>
      </ScrollView>
      <CouponSheet visible={couponOpen} onClose={() => setCouponOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: space.gutter, paddingBottom: space.xl },
  title: { ...type.title, marginTop: space.l, marginBottom: space.s },
  section: { marginTop: space.l, gap: space.s },
  sectionTitle: { fontFamily: fonts.medium, fontSize: 15, color: colors.sub, marginLeft: space.xs },
  card: { paddingVertical: space.xs },
  note: { ...type.caption, marginHorizontal: space.xs },
});

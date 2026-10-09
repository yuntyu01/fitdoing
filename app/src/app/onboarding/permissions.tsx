import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatNumber } from '../../domain/format';
import { defaultTargets } from '../../domain/targets';
import { requestNotificationPermission } from '../../features/notifications/schedule';
import { useOnboardingDraft } from '../../features/onboarding/draft';
import { FormSection, Rows } from '../../features/settings/editors/Form';
import { askToEnableNotifications } from '../../features/settings/notifications';
import { useSettings } from '../../features/settings/store';
import { FullButton } from '../../ui/FullButton';
import { StepHeader } from '../../ui/Headers';
import { ListRow } from '../../ui/ListRow';
import { Screen } from '../../ui/Screen';
import { usePalette, useThemedStyles, type Palette } from '../../ui/theme';
import { fonts, layout, text } from '../../ui/tokens';

/** 고른 계획 한 줄: 왼쪽 항목(보조색), 오른쪽 값 */
function SummaryRow({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

export default function PermissionsStep() {
  const { t } = useTranslation();
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const draft = useOnboardingDraft((s) => s.settings);
  const profile = useOnboardingDraft((s) => s.profile);
  const finalize = useOnboardingDraft((s) => s.finalize);
  const set = useOnboardingDraft((s) => s.set);
  const save = useSettings((s) => s.save);
  const [busy, setBusy] = useState(false);
  const [notifOn, setNotifOn] = useState(false);

  // 이미 허용했으면 "허용됨"으로 보여준다 (웹 등 지원하지 않는 곳에서는 그냥 "설정")
  useEffect(() => {
    Notifications.getPermissionsAsync()
      .then((p) => setNotifOn(p.granted))
      .catch(() => {});
  }, []);

  // 2단계에서 마감 알림을 껐으면 이 줄에서 다시 켤 수 있다. 켤 때 권한을 묻는다.
  const askNotif = async () => {
    const ok = draft.notifications
      ? await requestNotificationPermission().catch(() => false)
      : await askToEnableNotifications();
    setNotifOn(ok);
    if (ok && !draft.notifications) set({ notifications: true });
  };

  const start = async () => {
    setBusy(true);
    // 거절해도 시작은 된다. 알림 없이 홈 카운트다운만 보게 된다. 알림을 껐으면 묻지 않는다.
    if (draft.notifications) await requestNotificationPermission().catch(() => false);
    save(finalize());
    // 설정이 생기면 루트 레이아웃의 guard가 탭 화면으로 보낸다.
    router.replace('/');
  };

  const { gym, sleep } = draft;
  const kcal = defaultTargets(profile.goal, Number(profile.weight)).kcal;
  const modeLabel = { mild: t('settings.modeMild'), normal: t('settings.modeNormal'), spicy: t('settings.modeSpicy') }[
    draft.mode
  ];

  return (
    <Screen
      header={<StepHeader step={4} total={4} onBack={() => router.back()} />}
      title={t('onboarding.permTitle')}
      footer={<FullButton label={t('onboarding.permStart')} onPress={start} disabled={busy} />}
    >
      <View>
        <SummaryRow label={t('onboarding.summaryGoal')} value={t(`goal.${profile.goal}`)} />
        <SummaryRow label={t('onboarding.summaryMeals')} value={t('settings.mealsPerDay', { n: draft.meals.length })} />
        <SummaryRow
          label={t('onboarding.summaryGym')}
          value={gym.enabled ? t('settings.gymValue', { n: gym.weeklyTarget, time: gym.arriveBy }) : t('common.off')}
        />
        <SummaryRow
          label={t('onboarding.summarySleep')}
          value={sleep.enabled ? `${sleep.bedTime} · ${sleep.wakeTime}` : t('common.off')}
        />
        <SummaryRow label={t('onboarding.summaryMode')} value={modeLabel} />
        <SummaryRow label={t('onboarding.summaryTargets')} value={`${formatNumber(kcal)} ${t('common.kcal')}`} />
      </View>

      <FormSection title={t('onboarding.permSection')}>
        <Rows>
          <ListRow
            label={t('onboarding.permNotif')}
            desc={t('onboarding.permNotifDesc')}
            value={
              !draft.notifications ? t('common.off') : notifOn ? t('onboarding.permGranted') : t('onboarding.permSet')
            }
            onPress={draft.notifications && notifOn ? undefined : askNotif}
          />
          {/* 나머지 권한은 처음 쓰는 순간에 묻는다 */}
          <ListRow
            label={t('onboarding.permCamera')}
            desc={t('onboarding.permCameraDesc')}
            value={t('onboarding.permLater')}
          />
          <ListRow
            label={t('onboarding.permLocation')}
            desc={t('onboarding.permLocationDesc')}
            value={t('onboarding.permLater')}
          />
          <ListRow
            label={t('onboarding.permUsage')}
            desc={t('onboarding.permUsageDesc')}
            value={t('onboarding.permLater')}
          />
        </Rows>
        <Pressable
          accessibilityRole="link"
          hitSlop={8}
          onPress={() => router.dismissTo('/onboarding')}
          style={({ pressed }) => [styles.editLink, pressed && styles.pressed]}
        >
          <Text style={styles.editText}>{t('onboarding.editPlan')}</Text>
          <ChevronRight size={16} color={c.sub} strokeWidth={1.8} />
        </Pressable>
      </FormSection>
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 16,
      paddingVertical: 10,
    },
    summaryLabel: { ...text.label, color: c.sub },
    summaryValue: {
      ...text.label,
      fontFamily: fonts.medium,
      color: c.text,
      flexShrink: 1,
      textAlign: 'right',
      fontVariant: ['tabular-nums'],
    },
    editLink: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'center',
      gap: 2,
      marginTop: layout.related,
      paddingVertical: 8,
    },
    editText: { ...text.body, color: c.sub, textDecorationLine: 'underline' },
    pressed: { opacity: 0.6 },
  });

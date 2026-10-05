import { router } from 'expo-router';
import { Bell, Camera, Lock, MapPin, type LucideIcon } from 'lucide-react-native';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { requestNotificationPermission } from '../../features/notifications/schedule';
import { useOnboardingDraft } from '../../features/onboarding/draft';
import { useSettings } from '../../features/settings/store';
import { Card, Divider } from '../../ui/Card';
import { FullButton } from '../../ui/FullButton';
import { SubHeader } from '../../ui/Headers';
import { Screen } from '../../ui/Screen';
import { colors, fonts, space, type } from '../../ui/tokens';

type Item = { icon: LucideIcon; name: string; desc: string; now: boolean };

export default function PermissionsStep() {
  const { t } = useTranslation();
  const finalize = useOnboardingDraft((s) => s.finalize);
  const save = useSettings((s) => s.save);
  const [busy, setBusy] = useState(false);

  const items: Item[] = [
    { icon: Bell, name: t('onboarding.permNotif'), desc: t('onboarding.permNotifDesc'), now: true },
    { icon: Camera, name: t('onboarding.permCamera'), desc: t('onboarding.permCameraDesc'), now: false },
    { icon: MapPin, name: t('onboarding.permLocation'), desc: t('onboarding.permLocationDesc'), now: false },
    { icon: Lock, name: t('onboarding.permUsage'), desc: t('onboarding.permUsageDesc'), now: false },
  ];

  const start = async () => {
    setBusy(true);
    // 거절해도 시작은 된다. 알림 없이 홈 카운트다운만 보게 된다.
    await requestNotificationPermission();
    save(finalize());
    // 설정이 생기면 루트 레이아웃의 guard가 탭 화면으로 보낸다.
    router.replace('/');
  };

  return (
    <Screen
      header={<SubHeader title={t('app.name')} onBack={() => router.back()} />}
      title={t('onboarding.permTitle')}
      desc={t('onboarding.permDesc')}
      footer={<FullButton label={t('onboarding.permStart')} onPress={start} disabled={busy} />}
    >
      <Card style={{ paddingVertical: space.s }}>
        {items.map((it, i) => (
          <Fragment key={it.name}>
            {i > 0 ? <Divider /> : null}
            <View style={styles.row}>
              <it.icon size={22} color={it.now ? colors.text : colors.faint} strokeWidth={1.8} />
              <View style={styles.text}>
                <Text style={styles.name}>{it.name}</Text>
                <Text style={type.caption}>{it.desc}</Text>
              </View>
              <Text style={[styles.when, it.now && styles.whenNow]}>
                {it.now ? t('onboarding.permNow') : t('onboarding.permLater')}
              </Text>
            </View>
          </Fragment>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m },
  text: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.medium, fontSize: 17, color: colors.text },
  when: { fontFamily: fonts.medium, fontSize: 14, color: colors.faint },
  whenNow: { color: colors.text },
});

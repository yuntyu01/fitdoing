import { router, type Href } from 'expo-router';
import { ChevronRight, UserRound } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatNumber } from '../../domain/format';
import { SERVER_CONFIGURED } from '../../features/api/client';
import { useSyncStatus } from '../../features/api/store';
import { deleteAccountAndData, logout } from '../../features/auth/account';
import { AUTH_DISABLED } from '../../features/auth/session';
import { CouponSheet } from '../../features/coupons/CouponSheet';
import { useCouponStatus } from '../../features/coupons/useCoupons';
import { askToEnableNotifications } from '../../features/settings/notifications';
import { useSettings, useSettingsValue } from '../../features/settings/store';
import { ThemeSheet } from '../../features/settings/ThemeSheet';
import { SectionLabel } from '../../ui/Card';
import { useTabBarSpace } from '../../ui/FloatingTabBar';
import { ListRow } from '../../ui/ListRow';
import { usePalette, useThemedStyles, type Palette } from '../../ui/theme';
import { Toggle } from '../../ui/Toggle';
import { fonts, layout, text } from '../../ui/tokens';

const formatDateTime = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** 섹션 이름 + 박스 없는 행들 (+ 아래 작은 안내) */
function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View>
      <SectionLabel>{title}</SectionLabel>
      {children}
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

/** 맨 위 프로필 줄: 동그라미(닉네임 첫 글자, 없으면 사람 아이콘) · 닉네임 · "내 프로필" · 화살표 */
function ProfileRow({ nickname, onPress }: { nickname: string; onPress: () => void }) {
  const { t } = useTranslation();
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const initial = Array.from(nickname.trim())[0]?.toUpperCase();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.profile, pressed && styles.pressed]}
    >
      <View style={styles.avatar}>
        {initial ? (
          <Text style={styles.avatarText}>{initial}</Text>
        ) : (
          <UserRound size={26} color={c.sub} strokeWidth={1.8} />
        )}
      </View>
      <View style={styles.profileText}>
        <Text style={[styles.profileName, !nickname && styles.profileEmpty]}>
          {nickname || t('settings.nicknameEmpty')}
        </Text>
        <Text style={styles.profileSub}>{t('settings.myProfile')}</Text>
      </View>
      <ChevronRight size={20} color={c.sub} strokeWidth={1.8} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const tabSpace = useTabBarSpace(); // 떠 있는 탭바에 마지막 내용이 가리지 않게
  const s = useSettingsValue();
  const update = useSettings((st) => st.update);
  const coupons = useCouponStatus();
  const [couponOpen, setCouponOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const syncPending = useSyncStatus((st) => st.pending);
  const lastSyncAt = useSyncStatus((st) => st.lastSyncAt);
  const syncValue =
    syncPending > 0
      ? t('sync.pending', { n: syncPending })
      : lastSyncAt
        ? t('sync.last', { time: formatDateTime(lastSyncAt) })
        : t('sync.never');
  const go = (href: Href) => () => router.push(href);
  const openSupport = () => {
    void Linking.openURL('https://midi-broccoli-56c.notion.site/FitDoing-3f4502846708812981c9db286d1eef63')
      .catch(() => Alert.alert('FitDoing', 'yuntyu01@gmail.com'));
  };
  const openPrivacy = () => {
    void Linking.openURL('https://midi-broccoli-56c.notion.site/3f450284670881b880e6fd67ba899903')
      .catch(() => Alert.alert('FitDoing', 'yuntyu01@gmail.com'));
  };

  const confirmLogout = () =>
    Alert.alert(t('settings.logoutTitle'), t('settings.logoutBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.logout'), onPress: () => void logout() },
    ]);
  // 서버의 계정·백업이 지워지고 되돌릴 수 없으니, 그 사실을 본문에 적고 한 번 더 묻는다.
  const confirmDelete = () =>
    Alert.alert(t('settings.deleteTitle'), t('settings.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.deleteConfirm'),
        style: 'destructive',
        onPress: () =>
          deleteAccountAndData().catch((e) => {
            console.warn('delete account failed', e);
            Alert.alert(t('settings.deleteFailed'));
          }),
      },
    ]);

  const modeLabel = { mild: t('settings.modeMild'), normal: t('settings.modeNormal'), spicy: t('settings.modeSpicy') }[
    s.mode
  ];
  const couponsLeft = coupons.rest.left + coupons.cheat.left;

  // 켤 때 알림 권한이 없으면 묻는다. 허용하지 않으면 꺼진 채로 둔다.
  const toggleNotifications = async (on: boolean) => {
    if (on && !(await askToEnableNotifications())) return;
    update({ notifications: on });
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: tabSpace + layout.block }]}>
        <View>
          <Text style={styles.title}>{t('settings.title')}</Text>
          <ProfileRow nickname={s.nickname} onPress={go('/edit/profile')} />
        </View>

        <Section title={t('settings.sectionPlan')}>
          <ListRow label={t('settings.profile')} value={t(`goal.${s.goal}`)} onPress={go('/edit/profile')} />
          <ListRow
            label={t('settings.meals')}
            value={t('settings.mealsPerDay', { n: s.meals.length })}
            onPress={go('/edit/meals')}
          />
          <ListRow
            label={t('settings.gym')}
            value={
              s.gym.enabled ? t('settings.gymValue', { n: s.gym.weeklyTarget, time: s.gym.arriveBy }) : t('common.off')
            }
            onPress={go('/edit/gym')}
          />
          <ListRow
            label={t('settings.sleep')}
            value={s.sleep.enabled ? `${s.sleep.bedTime} · ${s.sleep.wakeTime}` : t('common.off')}
            onPress={go('/edit/sleep')}
          />
          <ListRow label={t('settings.mode')} value={modeLabel} onPress={go('/edit/mode')} />
          <ListRow
            label={t('settings.targets')}
            value={`${formatNumber(s.targets.kcal)} ${t('common.kcal')}`}
            onPress={go('/edit/nutrition')}
          />
          <ListRow
            label={t('settings.foodStyle')}
            value={t(`foodStyle.pattern.${s.foodStyle.pattern}`)}
            onPress={go('/edit/food-style')}
          />
        </Section>

        <Section title={t('settings.sectionLock')}>
          <ListRow label={t('lockSetup.title')} onPress={go('/edit/lock' as Href)} />
          <ListRow onPress={go('/edit/lock' as Href)} label={t('settings.lockMinutes')} value={t('common.hours', { h: s.lockMinutes / 60 })} />
          <ListRow
            onPress={go('/edit/lock' as Href)}
            label={t('settings.emergency')}
            value={t('settings.emergencyValue', { n: s.emergencyPerWeek })}
          />
          <ListRow onPress={go('/edit/lock' as Href)} label={t('settings.allowedApps')} value={t('settings.allowedAppsValue')} />
        </Section>

        <Section
          title={t('settings.sectionApp')}
          note={SERVER_CONFIGURED ? `${t('settings.photoAnalysisNote')}\n${t('settings.photoBackupDesc')}` : t('settings.localPhotoNote')}
        >
          <ListRow
            label={t('settings.coupons')}
            value={t('settings.couponsLeft', { n: couponsLeft })}
            onPress={() => setCouponOpen(true)}
          />
          <ListRow label={t('settings.friendsManage')} onPress={go('/friends-manage' as Href)} />
          <ListRow label={t('share.title')} onPress={go('/share-page' as Href)} />
          <ListRow
            label={t('settings.shareFriends')}
            desc={t('settings.shareFriendsDesc')}
            right={<Toggle value={s.shareFriends} onChange={(shareFriends) => update({ shareFriends })} />}
          />
          <ListRow
            label={t('settings.themeMode')}
            value={t(`settings.theme_${s.themeMode}`)}
            onPress={() => setThemeOpen(true)}
          />
          <ListRow
            label={t('settings.notifications')}
            desc={t('settings.notificationsDesc')}
            right={<Toggle value={s.notifications} onChange={(on) => void toggleNotifications(on)} />}
          />
          <ListRow
            label={t('settings.photoBackup')}
            right={<Toggle value={s.photoBackup} onChange={(photoBackup) => update({ photoBackup })} />}
          />
          <ListRow disabled label={t('sync.title')} value={SERVER_CONFIGURED ? syncValue : t('settings.serverUnavailable')} />
        </Section>

        <Section title={t('settings.support')} note={SERVER_CONFIGURED ? undefined : t('settings.localBuildNote')}>
          <ListRow label={t('settings.support')} value="yuntyu01@gmail.com" onPress={openSupport} />
          <ListRow label={t('settings.privacyPolicy')} onPress={openPrivacy} />
        </Section>

        {/* 로그인 없는 빌드(비공개 테스트)에는 로그아웃할 계정이 없다: 누르면 로그인 화면에 갇힌다 */}
        {AUTH_DISABLED ? null : (
          <Section title={t('settings.sectionAccount')}>
            <ListRow label={t('settings.logout')} onPress={confirmLogout} />
            <ListRow label={t('settings.deleteAccount')} onPress={confirmDelete} />
          </Section>
        )}
      </ScrollView>
      <CouponSheet visible={couponOpen} onClose={() => setCouponOpen(false)} />
      <ThemeSheet
        visible={themeOpen}
        value={s.themeMode}
        onClose={() => setThemeOpen(false)}
        onSave={(themeMode) => {
          update({ themeMode });
          setThemeOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

const AVATAR = 56;

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    body: { paddingHorizontal: layout.page, gap: layout.block },
    title: { ...text.title, color: c.text, marginTop: 20 },
    note: { ...text.caption, color: c.sub, marginTop: 4 },
    pressed: { opacity: 0.6 },
    profile: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 20, paddingVertical: 8 },
    avatar: {
      width: AVATAR,
      height: AVATAR,
      borderRadius: AVATAR / 2,
      backgroundColor: c.card,
      borderWidth: layout.hairline,
      borderColor: c.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { ...text.heading, fontSize: 22, lineHeight: 28, color: c.text },
    profileText: { flex: 1, gap: 2 },
    profileName: { ...text.heading, color: c.text },
    profileEmpty: { fontFamily: fonts.regular, color: c.sub },
    profileSub: { ...text.caption, color: c.sub },
  });

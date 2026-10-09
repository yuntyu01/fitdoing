import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Linking, Share, StyleSheet, Text, View } from 'react-native';

import { disableShare, enableShare, fetchShare, rotateShare, type ShareStatus } from '../features/api/client';
import { Divider } from '../ui/Card';
import { FullButton } from '../ui/FullButton';
import { SubHeader } from '../ui/Headers';
import { ListRow } from '../ui/ListRow';
import { Screen } from '../ui/Screen';
import { usePalette, useThemedStyles, type Palette } from '../ui/theme';
import { Toggle } from '../ui/Toggle';
import { layout, radius, text } from '../ui/tokens';

/**
 * 공유 페이지: 로그인 없이 링크로 보는 "내 식단" 웹 페이지를 켜고 끈다.
 * 친구에게 공유한 끼니만 최근 14일치 보인다(서버 internal/share). 주소는 무작위라 새로 만들면 옛 링크는 막힌다.
 */
export default function SharePageScreen() {
  const { t } = useTranslation();
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const [status, setStatus] = useState<ShareStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const fetchStatus = useCallback(
    () =>
      fetchShare()
        .then((st) => {
          setStatus(st);
          setFailed(false);
        })
        .catch((e) => {
          console.warn('share status failed', e);
          setFailed(true);
        }),
    [],
  );
  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);
  const retry = () => {
    setFailed(false);
    void fetchStatus();
  };

  const run = async (fn: () => Promise<ShareStatus>) => {
    setBusy(true);
    try {
      setStatus(await fn());
    } catch (e) {
      console.warn('share change failed', e);
      Alert.alert(t('share.failed'));
    } finally {
      setBusy(false);
    }
  };

  const confirmRotate = () =>
    Alert.alert(t('share.rotateTitle'), t('share.rotateBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('share.rotate'), style: 'destructive', onPress: () => void run(rotateShare) },
    ]);

  const url = status?.enabled ? status.url : '';

  return (
    <Screen header={<SubHeader title={t('share.title')} onBack={() => router.back()} />} gap={layout.block}>
      <Text style={styles.desc}>{t('share.desc')}</Text>

      {status === null && !failed ? (
        <ActivityIndicator color={c.sub} />
      ) : failed ? (
        <View style={styles.block}>
          <Text style={styles.desc}>{t('share.loadFailed')}</Text>
          <FullButton variant="secondary" label={t('share.retry')} onPress={retry} />
        </View>
      ) : (
        <>
          <View>
            <ListRow
              label={t('share.toggle')}
              desc={t('share.toggleDesc')}
              disabled={busy}
              right={
                <Toggle value={status?.enabled === true} onChange={(on) => void run(on ? enableShare : disableShare)} />
              }
            />
            <Divider />
          </View>

          {url ? (
            <View style={styles.block}>
              <Text style={styles.label}>{t('share.address')}</Text>
              <View style={styles.urlBox}>
                <Text style={styles.url} selectable>
                  {url}
                </Text>
              </View>
              <FullButton label={t('share.send')} onPress={() => void Share.share({ message: url, url })} />
              <FullButton variant="secondary" label={t('share.open')} onPress={() => void Linking.openURL(url)} />
              <FullButton variant="text" label={t('share.rotate')} onPress={confirmRotate} disabled={busy} />
            </View>
          ) : null}

          <Text style={styles.note}>{t('share.note')}</Text>
        </>
      )}
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    desc: { ...text.body, color: c.sub },
    block: { gap: layout.related + 4 },
    label: { ...text.caption, color: c.sub },
    urlBox: {
      borderWidth: layout.hairline,
      borderColor: c.border,
      backgroundColor: c.card,
      borderRadius: radius.field,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    url: { ...text.bodyMedium, color: c.text },
    note: { ...text.caption, color: c.sub },
  });

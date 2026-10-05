import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cleanBarcode, pickMealIndex } from '../../domain/logging';
import { releaseGymLock } from '../../features/lock/actions';
import { useSettingsValue } from '../../features/settings/store';
import { useNow, useToday } from '../../features/today/useToday';
import { FullButton } from '../../ui/FullButton';
import { Screen } from '../../ui/Screen';
import { colors, fonts, space, type } from '../../ui/tokens';

type Mode = 'photo' | 'barcode';

const PLATE = 288;

/** 앱 카메라만 쓴다 (갤러리에서 고르는 길은 없다). 사진 모드와 바코드 모드. */
export default function CaptureScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const settings = useSettingsValue();
  const { purpose } = useLocalSearchParams<{ purpose?: string }>();
  const now = useNow();
  const today = useToday(settings, now);
  const mealIndex = pickMealIndex(today.meals);

  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>('photo');
  const [error, setError] = useState(false);
  const camera = useRef<CameraView>(null);
  const busy = useRef(false);

  if (!permission) return <View style={styles.black} />;

  if (!permission.granted) {
    const blocked = !permission.canAskAgain;
    return (
      <Screen
        header={
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('capture.close')} style={styles.plainClose}>
            <X size={24} color={colors.text} strokeWidth={1.8} />
          </Pressable>
        }
        title={t('capture.permTitle')}
        desc={blocked ? t('capture.permDenied') : t('capture.permDesc')}
        footer={
          <FullButton
            label={blocked ? t('capture.openSettings') : t('capture.permAllow')}
            onPress={() => (blocked ? Linking.openSettings() : requestPermission())}
          />
        }
      >
        {null}
      </Screen>
    );
  }

  const goReview = (params: Record<string, string>) => {
    router.replace({ pathname: '/capture/review', params: { ...params, meal: mealIndex ? String(mealIndex) : '' } });
  };

  const shoot = async () => {
    if (busy.current || !camera.current) return;
    busy.current = true;
    setError(false);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const pic = await camera.current.takePictureAsync({ quality: 0.9, skipProcessing: false });
      if (purpose === 'gym') {
        // 헬스 사진 인증: 끼니 기록이 아니므로 리뷰 없이 도착 인증만 남기고 잠금을 푼다.
        releaseGymLock('photo');
        router.back();
        return;
      }
      goReview({ photoUri: pic.uri, w: String(pic.width), h: String(pic.height) });
    } catch (e) {
      console.warn('takePicture failed', e);
      setError(true);
      busy.current = false;
    }
  };

  const onScan = (r: BarcodeScanningResult) => {
    const code = cleanBarcode(r.data);
    if (busy.current || !code) return;
    busy.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    goReview({ barcode: code });
  };

  return (
    <View style={styles.black}>
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing="back"
        mode="picture"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }}
        onBarcodeScanned={mode === 'barcode' ? onScan : undefined}
      />

      <View style={[styles.guideWrap, { paddingTop: insets.top }]} pointerEvents="none">
        <View style={mode === 'photo' ? styles.plate : styles.barcodeBox} />
        <Text style={styles.guideText}>{mode === 'photo' ? t('capture.plateGuide') : t('capture.barcodeGuide')}</Text>
        {error ? <Text style={styles.error}>{t('capture.failed')}</Text> : null}
      </View>

      <View style={[styles.top, { paddingTop: insets.top + space.s }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('capture.close')} style={styles.close}>
          <X size={22} color={colors.onAccent} strokeWidth={1.8} />
        </Pressable>
        {mealIndex ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{t('capture.mealBadge', { n: mealIndex })}</Text>
          </View>
        ) : null}
        <View style={styles.close} />
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + space.l }]}>
        <View style={styles.modes}>
          {(['photo', 'barcode'] as const).map((m) => (
            <Pressable key={m} onPress={() => setMode(m)} accessibilityRole="radio" accessibilityState={{ selected: mode === m }} style={[styles.mode, mode === m && styles.modeOn]}>
              <Text style={[styles.modeText, mode === m && styles.modeTextOn]}>{t(m === 'photo' ? 'capture.modePhoto' : 'capture.modeBarcode')}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.shutterSlot}>
          {mode === 'photo' ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('capture.shutter')} onPress={shoot} style={({ pressed }) => [styles.shutterRing, pressed && { opacity: 0.8 }]}>
              <View style={styles.shutter} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000' },
  plainClose: { height: 44, justifyContent: 'center', marginTop: space.s, alignSelf: 'flex-start' },
  guideWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: space.m },
  plate: { width: PLATE, height: PLATE, borderRadius: PLATE / 2, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)' },
  barcodeBox: { width: 300, height: 160, borderRadius: 20, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)' },
  guideText: { ...type.desc, color: 'rgba(255,255,255,0.9)', textAlign: 'center' },
  error: { ...type.desc, color: colors.onAccent, fontFamily: fonts.semibold },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: space.gutter, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  badge: { height: 36, paddingHorizontal: space.m, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center' },
  badgeText: { fontFamily: fonts.medium, fontSize: 15, color: colors.onAccent },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: space.l, backgroundColor: 'rgba(0,0,0,0.35)', paddingTop: space.m },
  modes: { flexDirection: 'row', gap: space.s },
  mode: { height: 36, paddingHorizontal: space.m, borderRadius: 18, justifyContent: 'center' },
  modeOn: { backgroundColor: 'rgba(255,255,255,0.22)' },
  modeText: { fontFamily: fonts.medium, fontSize: 15, color: 'rgba(255,255,255,0.7)' },
  modeTextOn: { color: colors.onAccent, fontFamily: fonts.semibold },
  shutterSlot: { height: 76, justifyContent: 'center' },
  shutterRing: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: colors.onAccent, alignItems: 'center', justifyContent: 'center' },
  shutter: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.onAccent },
});

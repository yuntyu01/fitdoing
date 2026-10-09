import { CameraView, useCameraPermissions, type BarcodeScanningResult, type CameraType } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { SwitchCamera, X, Zap, ZapOff } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cleanBarcode, pickMealIndex } from '../../domain/logging';
import { releaseGymLock } from '../../features/lock/actions';
import { useSettingsValue } from '../../features/settings/store';
import { useNow, useToday } from '../../features/today/useToday';
import { FullButton } from '../../ui/FullButton';
import { CenterHeader } from '../../ui/Headers';
import { Screen } from '../../ui/Screen';
import { palettes, usePalette, useThemedStyles, type Palette } from '../../ui/theme';
import { fonts, layout, text } from '../../ui/tokens';

type Mode = 'photo' | 'barcode';

// 미리보기 위 글자·안내선은 사진 위에 얹히므로 라이트 모드에서도 어두운 팔레트로 그린다.
const overlay = palettes.dark;
const SHUTTER = 76;
const SIDE = 48;

/** 앱 카메라만 쓴다 (갤러리에서 고르는 길은 없다). 사진 모드와 바코드 모드. */
export default function CaptureScreen() {
  const { t } = useTranslation();
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const settings = useSettingsValue();
  const { purpose } = useLocalSearchParams<{ purpose?: string }>();
  const now = useNow();
  const today = useToday(settings, now);
  const mealIndex = pickMealIndex(today.meals);
  const gym = purpose === 'gym';

  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>('photo');
  const [error, setError] = useState(false);
  const [flash, setFlash] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [preview, setPreview] = useState<{ w: number; h: number } | null>(null);
  const camera = useRef<CameraView>(null);
  const busy = useRef(false);

  if (!permission) return <View style={styles.root} />;

  if (!permission.granted) {
    const blocked = !permission.canAskAgain;
    return (
      <Screen
        header={<CenterHeader close title="" onBack={() => router.back()} />}
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
      if (gym) {
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

  const onPreviewLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setPreview({ w: width, h: height });
  };

  const barcode = mode === 'barcode';
  // 바코드는 뒷면 카메라로만 읽는다. 사진을 찍지 않으니 플래시 대신 손전등을 켠다.
  const cameraFacing: CameraType = barcode ? 'back' : facing;
  const canFlash = cameraFacing === 'back';
  // 원은 미리보기 안에 여백을 두고 들어가는 가장 큰 크기 (위 안내 문구 자리를 뺀다)
  const plate = preview ? Math.max(160, Math.min(preview.w - 32, preview.h - 120)) : 0;
  const title = gym ? t('capture.gymTitle') : mealIndex ? t('capture.titleMeal', { n: mealIndex }) : t('capture.title');
  const hint = gym ? t('capture.gymGuide') : barcode ? t('capture.barcodeGuide') : t('capture.plateGuide');

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.top}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('capture.close')}
          style={styles.topSide}
        >
          <X size={26} color={c.text} strokeWidth={1.8} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={[styles.topSide, styles.topRight]}>
          {canFlash ? (
            <Pressable
              onPress={() => setFlash((f) => !f)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={flash ? t('capture.flashOff') : t('capture.flashOn')}
              accessibilityState={{ selected: flash }}
            >
              {flash ? (
                <Zap size={24} color={c.text} fill={c.text} strokeWidth={1.8} />
              ) : (
                <ZapOff size={24} color={c.sub} strokeWidth={1.8} />
              )}
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.preview} onLayout={onPreviewLayout}>
        <CameraView
          ref={camera}
          style={StyleSheet.absoluteFill}
          facing={cameraFacing}
          mode="picture"
          flash={flash && !barcode ? 'on' : 'off'}
          enableTorch={flash && barcode}
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }}
          onBarcodeScanned={barcode ? onScan : undefined}
        />
        <View style={styles.guideWrap} pointerEvents="none">
          {plate > 0 && !gym ? (
            barcode ? (
              <View style={[styles.barcodeBox, { width: Math.min(300, plate), height: Math.min(160, plate / 1.8) }]} />
            ) : (
              <View style={[styles.plate, { width: plate, height: plate, borderRadius: plate / 2 }]} />
            )
          ) : null}
        </View>
        <View style={styles.hintWrap} pointerEvents="none">
          <View style={styles.hint}>
            <Text style={styles.hintText}>{hint}</Text>
          </View>
        </View>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + layout.page }]}>
        {error ? <Text style={styles.error}>{t('capture.failed')}</Text> : null}
        {/* 헬스 인증 사진에는 바코드가 쓸모없고, 읽으면 끼니 기록으로 넘어가 버리므로 고를 수 없게 한다. */}
        {gym ? null : (
          <View style={styles.modes}>
            {(['photo', 'barcode'] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                accessibilityRole="radio"
                accessibilityState={{ selected: mode === m }}
                style={[styles.mode, mode === m && styles.modeOn]}
              >
                <Text style={[styles.modeText, mode === m && styles.modeTextOn]}>
                  {t(m === 'photo' ? 'capture.modePhoto' : 'capture.modeBarcode')}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        <View style={styles.controls}>
          <View style={styles.side} />
          <View style={styles.shutterSlot}>
            {barcode ? null : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('capture.shutter')}
                onPress={shoot}
                style={({ pressed }) => [styles.shutterRing, pressed && styles.pressed]}
              >
                <View style={styles.shutter} />
              </Pressable>
            )}
          </View>
          <View style={styles.side}>
            {barcode ? null : (
              <Pressable
                onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('capture.flip')}
                style={({ pressed }) => [styles.flip, pressed && styles.pressed]}
              >
                <SwitchCamera size={22} color={c.text} strokeWidth={1.8} />
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    top: {
      height: 56,
      paddingHorizontal: layout.page,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    topSide: { width: 64 },
    topRight: { alignItems: 'flex-end' },
    title: { ...text.heading, fontFamily: fonts.bold, color: c.text, flexShrink: 1, textAlign: 'center' },
    preview: { flex: 1, backgroundColor: overlay.bg, overflow: 'hidden' },
    guideWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingTop: 40 },
    plate: { borderWidth: 1.5, borderColor: overlay.text, opacity: 0.85 },
    barcodeBox: { borderRadius: 16, borderWidth: 1.5, borderColor: overlay.text, opacity: 0.85 },
    hintWrap: { position: 'absolute', top: 16, left: layout.page, right: layout.page, alignItems: 'center' },
    hint: { backgroundColor: overlay.scrim, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
    hintText: { ...text.caption, color: overlay.text, textAlign: 'center' },
    bottom: { paddingTop: 20, paddingHorizontal: layout.page, alignItems: 'center', gap: 20 },
    error: { ...text.caption, color: c.text, textAlign: 'center' },
    modes: { flexDirection: 'row', gap: 8 },
    mode: { height: 36, paddingHorizontal: 20, borderRadius: 18, justifyContent: 'center' },
    modeOn: { backgroundColor: c.selected },
    modeText: { ...text.bodyMedium, fontFamily: fonts.regular, color: c.sub },
    modeTextOn: { color: c.text, fontFamily: fonts.semibold },
    controls: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    side: { width: 64, alignItems: 'center' },
    shutterSlot: { height: SHUTTER, justifyContent: 'center' },
    shutterRing: {
      width: SHUTTER,
      height: SHUTTER,
      borderRadius: SHUTTER / 2,
      borderWidth: 4,
      borderColor: c.text,
      alignItems: 'center',
      justifyContent: 'center',
    },
    shutter: { width: SHUTTER - 18, height: SHUTTER - 18, borderRadius: (SHUTTER - 18) / 2, backgroundColor: c.text },
    flip: {
      width: SIDE,
      height: SIDE,
      borderRadius: SIDE / 2,
      borderWidth: layout.hairline,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { opacity: 0.8 },
  });

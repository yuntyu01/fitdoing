import { LinearGradient } from 'expo-linear-gradient';
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ACCENTS, contrast, hexToRgb, hsvToRgb, isHex, rgbToHex, rgbToHsv } from '../../ui/color';
import { Slider } from '../../ui/Slider';
import { usePalette, useThemedStyles, type Palette } from '../../ui/theme';
import { fonts } from '../../ui/tokens';

const HUE_STEPS = 72; // 끄는 동안 색이 5도씩 바뀐다 (값마다 화면을 다시 그리지 않게)
const STEPS = 20;

/** 테마색 동그라미들 + 무지개(직접 고르기). 고른 색은 바로 적용한다. */
export function AccentSwatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const { t } = useTranslation();
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const [custom, setCustom] = useState(false);
  const isCustom = !ACCENTS.includes(value);
  // 다크 카드는 비치는 색이라 대비는 불투명한 카드색 기준으로 본다
  const surface = c.scheme === 'dark' ? '#1B1C20' : '#FFFFFF';
  return (
    <View>
      <View style={styles.grid}>
        {ACCENTS.map((color) => {
          const on = value === color;
          const faint = contrast(color, surface) < 1.3; // 카드와 거의 같은 색도 보이게 옅은 테두리
          return (
            <Pressable
              key={color}
              accessibilityRole="radio"
              accessibilityLabel={color}
              accessibilityState={{ selected: on }}
              onPress={() => onChange(color)}
              style={[
                styles.dot,
                { backgroundColor: color, borderColor: on ? c.text : faint ? c.border : 'transparent' },
              ]}
            >
              {on ? (
                <Check
                  size={18}
                  strokeWidth={2.4}
                  color={rgbToHsv(hexToRgb(color))[2] > 0.75 ? '#111111' : '#FFFFFF'}
                />
              ) : null}
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings.customColor')}
          onPress={() => setCustom(!custom)}
          style={[styles.dot, styles.rainbow, { borderColor: isCustom ? c.text : 'transparent' }]}
        >
          <LinearGradient
            colors={['#FF5F6D', '#FFC371', '#5FD38D', '#4FA3FF', '#B79CFF', '#FF5F6D']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {isCustom ? <View style={[styles.customInner, { backgroundColor: value }]} /> : null}
        </Pressable>
      </View>
      {custom ? <CustomColor value={value} onChange={onChange} /> : null}
    </View>
  );
}

/** 직접 고르기: 색상 슬라이더 + 밝기 슬라이더 + HEX 입력 */
function CustomColor({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const { t } = useTranslation();
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const [h, s, v] = rgbToHsv(hexToRgb(value));
  const [hex, setHex] = useState(value);
  const set = (color: string) => {
    setHex(color);
    onChange(color);
  };
  return (
    <View style={styles.custom}>
      <View style={styles.hueBar}>
        <LinearGradient
          colors={['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <Slider
        label={t('settings.customColor')}
        value={h / 360}
        onChange={(x) =>
          set(rgbToHex(hsvToRgb((Math.round(x * HUE_STEPS) / HUE_STEPS) * 359, Math.max(s, 0.35), Math.max(v, 0.5))))
        }
      />
      <Slider
        label={t('settings.customColor')}
        value={v}
        onChange={(x) => set(rgbToHex(hsvToRgb(h, Math.max(s, 0.2), Math.max(0.15, Math.round(x * STEPS) / STEPS))))}
      />
      <TextInput
        value={hex}
        onChangeText={(x) => {
          setHex(x);
          const next = x.startsWith('#') ? x : `#${x}`;
          if (isHex(next)) onChange(next.toUpperCase());
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={7}
        accessibilityLabel="HEX"
        placeholderTextColor={c.faint}
        cursorColor={c.bar}
        style={styles.hex}
      />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    dot: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    rainbow: { overflow: 'hidden' },
    customInner: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#FFFFFF' },
    custom: { marginTop: 14 },
    hueBar: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 2 },
    hex: {
      width: 140,
      marginTop: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      fontFamily: fonts.regular,
      fontSize: 15,
      color: c.text,
      backgroundColor: c.track,
    },
  });

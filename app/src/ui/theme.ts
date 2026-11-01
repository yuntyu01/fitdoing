import { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { create } from 'zustand';

import {
  contrast,
  DEFAULT_ACCENT,
  DEFAULT_GRADIENT,
  ensureContrast,
  hexToRgb,
  hsvToRgb,
  luminance,
  mix,
  rgbToHex,
  rgbToHsv,
  withAlpha,
} from './color';

// 앱 전체의 테마 색. 노션처럼 배경과 카드의 작은 명도 차이로 나누고, 그림자는 쓰지 않는다. 그라데이션은 유리 화면(아래 glassPalettes)만 쓴다.
// 모든 화면이 usePalette()/useThemedStyles()로 이 색을 쓴다(일부 화면만 밝거나 어둡게 바뀌지 않게).
export interface Palette {
  scheme: 'light' | 'dark';
  bg: string; // 전체 배경
  card: string; // 카드 배경
  text: string; // 기본 글자·주요 숫자
  sub: string; // 보조 설명·목표 수치
  faint: string; // 예정·놓친 끼니처럼 한 단계 더 흐린 글자
  border: string; // 일반 테두리 (촬영 버튼)
  line: string; // 옅은 구분선
  focus: string; // 오늘 날짜 테두리
  selected: string; // 지금 기록할 끼니 카드 배경 (테두리 없이 채움)
  bar: string; // 진행 막대, 이번 주 막대, 지금 끼니, 촬영 버튼
  onBar: string; // bar 위 글자·아이콘
  track: string; // 막대 바탕
  barLast: string; // 지난주 막대
  primary: string; // 주요 버튼 바탕 (다크에서는 밝은 버튼)
  onPrimary: string; // 주요 버튼 글자
  toggleOn: string; // 켠 스위치 바탕
  thumb: string; // 스위치 동그라미
  scrim: string; // 바텀시트 뒤 어둡게
}

export const palettes: Record<'light' | 'dark', Palette> = {
  dark: {
    scheme: 'dark',
    bg: '#191919',
    card: '#202020',
    text: '#F0EFED',
    sub: '#ADA9A3',
    faint: '#6E6C68',
    border: '#383836',
    line: '#2C2C2B',
    focus: '#ADA9A3',
    selected: '#3A3A3A',
    bar: '#D4D4D4',
    onBar: '#191919',
    track: '#363636',
    barLast: '#5A5957',
    primary: '#F0EFED',
    onPrimary: '#191919',
    toggleOn: '#6B6A67',
    thumb: '#F0EFED',
    scrim: 'rgba(0,0,0,0.6)',
  },
  light: {
    scheme: 'light',
    bg: '#F4F4F2',
    card: '#FFFFFF',
    text: '#2F2E2B',
    sub: '#787774',
    faint: '#B4B2AD',
    border: '#DEDDDA',
    line: '#EDECEA',
    focus: '#2F2E2B',
    selected: '#E4E3DF',
    bar: '#3F3E3B',
    onBar: '#F4F4F2',
    track: '#E8E7E4',
    barLast: '#CFCDC8',
    primary: '#2F2E2B',
    onPrimary: '#FFFFFF',
    toggleOn: '#2F2E2B',
    thumb: '#FFFFFF',
    scrim: 'rgba(0,0,0,0.35)',
  },
};

/** 유리 디자인에만 있는 값: 바탕 그라데이션과 보이는 테마색 (탭바는 유리 영역 밖이라 여기서 읽는다) */
export interface GlassTokens {
  gradient: [string, string, string]; // 위 → 중간 → 바탕색
  stops: [number, number, number]; // 세 색의 위치 (화면 높이 비율)
  accent: string;
}

/** 이보다 채도가 낮은 테마색은 무채색으로 본다 (그라데이션·카드를 물들이지 않고 회색) */
const NEUTRAL_S = 0.2;

/**
 * 유리 디자인(홈·탭바·꾸미기): 위에서 아래로 어두워지는 바탕 위에 살짝 비치는 카드. 계산은 modo 앱(ui/theme.ts)과 같다.
 * - 테마색의 색상(hue)으로 위쪽 그라데이션을 만들고, 다크 카드에도 14% 섞는다. 무채색은 회색 그라데이션.
 * - 다크 카드는 불투명도 80%라 바탕이 비치고, 라이트 카드는 불투명한 흰색이다.
 * - 진행 막대·지금 끼니·촬영 버튼과 탭바의 고른 탭이 테마색을 쓴다. 바탕에 묻히는 색(라이트의 흰색, 다크의 검정)은 반대쪽 무채색으로 바꾼다.
 * 숫자가 많은 화면이라 보조 글자만 modo 보다 조금 진하다.
 */
export function makeGlass(
  scheme: 'light' | 'dark',
  raw: string,
  intensity: number,
): { palette: Palette; tokens: GlassTokens } {
  const dark = scheme === 'dark';
  const bg = dark ? '#000000' : '#F7F9FC';
  const surface = dark ? '#1B1C20' : '#FFFFFF';
  const [h, s] = rgbToHsv(hexToRgb(raw));
  const neutral = s < NEUTRAL_S;
  const accent =
    neutral && contrast(raw, surface) < 2 ? (dark ? '#F2F3F5' : '#1B1C20') : ensureContrast(raw, surface, 2);
  const onBar = luminance(accent) > 0.45 ? '#0B0C0E' : '#FFFFFF'; // 파랑처럼 중간 밝기는 흰색, 아주 밝은 색만 검정

  let top: string;
  if (neutral) {
    // 밝은 무채색일수록 은빛으로. 라이트의 흰색은 거의 검정으로 보이므로 보이는 색을 기준으로 한다.
    const l = Math.sqrt(luminance(dark ? raw : accent));
    top = dark
      ? mix(bg, mix('#2E3034', '#8C8F96', l), intensity * 0.75)
      : mix(bg, mix('#C3C6CC', '#E6E8EB', l), intensity * 0.7);
  } else if (dark) {
    top = mix(bg, rgbToHex(hsvToRgb(h, Math.max(0.7, Math.min(0.92, s + 0.45)), 0.29)), intensity * 0.7);
  } else {
    top = mix(bg, rgbToHex(hsvToRgb(h, 0.32, 1)), intensity * 0.33);
  }

  const card = dark && !neutral ? mix(surface, rgbToHex(hsvToRgb(h, 0.72, 0.28)), 0.14) : surface;
  const palette: Palette = dark
    ? {
        ...palettes.dark,
        bg,
        card: withAlpha(card, 0.8),
        text: '#FFFFFF',
        sub: '#A6A8AE',
        faint: '#74777E',
        border: '#5A5E66',
        line: 'rgba(255,255,255,0.08)',
        focus: '#A6A8AE',
        selected: '#45464A',
        bar: accent,
        onBar,
        track: 'rgba(255,255,255,0.14)',
        barLast: '#5A5E66',
        primary: accent,
        onPrimary: onBar,
      }
    : {
        ...palettes.light,
        bg,
        card,
        text: '#15171A',
        sub: '#6E737B',
        faint: '#A9AEB6',
        border: '#B9BEC6',
        line: '#EEF1F5',
        focus: '#6E737B',
        selected: '#EEF2F8',
        bar: accent,
        onBar,
        track: '#E9ECF1',
        barLast: '#B9BEC6',
        primary: accent,
        onPrimary: onBar,
      };
  return {
    palette,
    tokens: {
      gradient: [top, mix(top, bg, dark ? 0.55 : 0.45), bg],
      stops: dark ? [0, 0.32, 0.68] : [0, 0.18, 0.42],
      accent,
    },
  };
}

// 같은 값이면 같은 객체를 돌려준다 (useThemedStyles 가 색이 바뀔 때만 다시 만들도록)
let cached: { key: string; value: ReturnType<typeof makeGlass> } | null = null;
function glassTheme(scheme: 'light' | 'dark', accent: string, gradient: number) {
  const key = `${scheme}|${accent}|${gradient}`;
  if (cached?.key !== key) cached = { key, value: makeGlass(scheme, accent, gradient) };
  return cached.value;
}

/** true 인 영역 안에서는 usePalette()/useThemedStyles()가 유리 색을 돌려준다 (ui/glass.tsx 의 GlassScope) */
export const GlassContext = createContext(false);

/** 설정의 화면 모드(system이면 폰 설정을 따른다)와 테마색·그라데이션 세기. 설정 스토어가 읽고 바꿀 때 맞춰 준다. */
export const useThemeMode = create<{ mode: 'system' | 'light' | 'dark'; accent: string; gradient: number }>(() => ({
  mode: 'system',
  accent: DEFAULT_ACCENT,
  gradient: DEFAULT_GRADIENT,
}));

/** 화면 모드(시스템/밝게/어둡게)에 맞는 색 */
export function usePalette(): Palette {
  const scheme = useScheme();
  const glass = useContext(GlassContext);
  // 유리가 아닌 화면은 테마색이 바뀌어도(슬라이더를 끄는 동안에도) 다시 그리지 않는다
  const accent = useThemeMode((s) => (glass ? s.accent : ''));
  const gradient = useThemeMode((s) => (glass ? s.gradient : 0));
  return glass ? glassTheme(scheme, accent, gradient).palette : palettes[scheme];
}

/** 유리 디자인의 그라데이션과 테마색 */
export function useGlassTokens(): GlassTokens {
  const scheme = useScheme();
  const accent = useThemeMode((s) => s.accent);
  const gradient = useThemeMode((s) => s.gradient);
  return glassTheme(scheme, accent, gradient).tokens;
}

function useScheme(): 'light' | 'dark' {
  const system = useColorScheme();
  const mode = useThemeMode((s) => s.mode);
  return (mode === 'system' ? system : mode) === 'dark' ? 'dark' : 'light';
}

/** 색에 따라 바뀌는 StyleSheet. 테마가 바뀔 때만 다시 만든다. */
export function useThemedStyles<T>(factory: (c: Palette) => T): T {
  const c = usePalette();
  return useMemo(() => factory(c), [c, factory]);
}

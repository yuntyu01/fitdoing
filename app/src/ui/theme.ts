import { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { create } from 'zustand';

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
  bar: string; // 진행 막대, 이번 주 막대
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
    track: '#E8E7E4',
    barLast: '#CFCDC8',
    primary: '#2F2E2B',
    onPrimary: '#FFFFFF',
    toggleOn: '#2F2E2B',
    thumb: '#FFFFFF',
    scrim: 'rgba(0,0,0,0.35)',
  },
};

/**
 * 유리 디자인(홈·탭바): 위에서 아래로 어두워지는 바탕 위에 살짝 비치는 카드. modo 앱의 무채색 테마 값(ui/theme.ts)을 그대로 쓴다.
 * 다크 카드는 불투명도 80%라 바탕 그라데이션이 비치고, 라이트 카드는 불투명한 흰색이다. 글자 대비를 위해 보조 글자만 modo 보다 조금 진하다.
 */
export const glassPalettes: Record<'light' | 'dark', Palette> = {
  dark: {
    ...palettes.dark,
    bg: '#000000',
    card: 'rgba(27,28,32,0.8)',
    text: '#FFFFFF',
    sub: '#A6A8AE',
    faint: '#74777E',
    border: '#5A5E66',
    line: 'rgba(255,255,255,0.08)',
    focus: '#A6A8AE',
    selected: '#45464A',
    bar: '#F2F3F5',
    track: 'rgba(255,255,255,0.14)',
    barLast: '#5A5E66',
    primary: '#F2F3F5',
    onPrimary: '#000000',
  },
  light: {
    ...palettes.light,
    bg: '#F7F9FC',
    card: '#FFFFFF',
    text: '#15171A',
    sub: '#6E737B',
    faint: '#A9AEB6',
    border: '#B9BEC6',
    line: '#EEF1F5',
    focus: '#6E737B',
    selected: '#EEF2F8',
    bar: '#1B1C20',
    track: '#E9ECF1',
    barLast: '#B9BEC6',
    primary: '#1B1C20',
    onPrimary: '#FFFFFF',
  },
};

/** 유리 디자인에만 있는 값: 바탕 그라데이션과 떠 있는 탭바 */
export interface GlassTokens {
  gradient: [string, string, string]; // 위 → 중간 → 바탕색
  stops: [number, number, number]; // 세 색의 위치 (화면 높이 비율)
  nav: string; // 탭바 바탕 (흐림 위에 navAlpha 로 얹는다)
  navAlpha: number;
  navPill: string; // 고른 탭 뒤 알약
  navIcon: string;
  navIconOn: string;
}

const glassTokens: Record<'light' | 'dark', GlassTokens> = {
  dark: {
    gradient: ['#494B4F', '#212224', '#000000'],
    stops: [0, 0.32, 0.68],
    nav: '#17181C',
    navAlpha: 0.55,
    navPill: '#434447',
    navIcon: '#A3AAB8',
    navIconOn: '#F2F3F5',
  },
  light: {
    gradient: ['#E0E3E7', '#EAEDF0', '#F7F9FC'],
    stops: [0, 0.18, 0.42],
    nav: '#EDF3F8',
    navAlpha: 0.9,
    navPill: '#CBD1D5',
    navIcon: '#656A76',
    navIconOn: '#1B1C20',
  },
};

/** true 인 영역 안에서는 usePalette()/useThemedStyles()가 유리 색을 돌려준다 (ui/glass.tsx 의 GlassScope) */
export const GlassContext = createContext(false);

/** 설정의 화면 모드. system이면 폰 설정을 따른다. 설정 스토어가 읽고 바꿀 때 맞춰 준다. */
export const useThemeMode = create<{ mode: 'system' | 'light' | 'dark' }>(() => ({ mode: 'system' }));

/** 화면 모드(시스템/밝게/어둡게)에 맞는 색 */
export function usePalette(): Palette {
  const scheme = useScheme();
  const glass = useContext(GlassContext);
  return (glass ? glassPalettes : palettes)[scheme];
}

/** 유리 디자인의 그라데이션·탭바 값 */
export function useGlassTokens(): GlassTokens {
  return glassTokens[useScheme()];
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

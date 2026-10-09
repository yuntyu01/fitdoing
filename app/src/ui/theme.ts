import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { create } from 'zustand';

// 앱 전체의 테마 색. 노션처럼 배경과 카드의 작은 명도 차이로 나누고, 그라데이션·그림자는 쓰지 않는다.
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

/** 설정의 화면 모드. system이면 폰 설정을 따른다. 설정 스토어가 읽고 바꿀 때 맞춰 준다. */
export const useThemeMode = create<{ mode: 'system' | 'light' | 'dark' }>(() => ({ mode: 'system' }));

/** 화면 모드(시스템/밝게/어둡게)에 맞는 색 */
export function usePalette(): Palette {
  const system = useColorScheme();
  const mode = useThemeMode((s) => s.mode);
  const scheme = mode === 'system' ? system : mode;
  return scheme === 'dark' ? palettes.dark : palettes.light;
}

/** 색에 따라 바뀌는 StyleSheet. 테마가 바뀔 때만 다시 만든다. */
export function useThemedStyles<T>(factory: (c: Palette) => T): T {
  const c = usePalette();
  return useMemo(() => factory(c), [c, factory]);
}

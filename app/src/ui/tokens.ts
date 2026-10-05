// 디자인 토큰. 시안(docs/design/)이 기준이고, 강조색은 검정 하나만 쓴다.
export const colors = {
  bg: '#F2F4F6',
  card: '#FFFFFF',
  text: '#191F28',
  sub: '#6B7684',
  faint: '#B0B8C1', // 빈 끼니의 목표 값, 비활성 글자
  line: '#E5E8EB',
  track: '#E5E8EB', // 진행 막대 바탕
  accent: '#1B1C1F', // 현재 타일, 막대, 주요 버튼
  onAccent: '#FFFFFF',
  lockBg: '#151515', // 잠금 화면 전용
  lockText: '#FFFFFF',
  lockSub: '#8B95A1',
} as const;

export const radius = {
  tile: 14,
  card: 24,
  button: 16,
  pill: 999,
} as const;

export const space = {
  gutter: 16, // 화면 좌우 여백
  edge: 8, // 홈처럼 카드를 화면 끝 가까이 붙이는 여백
  indent: 8, // 제목·설명·헤더를 카드보다 안으로 들이는 양
  cardPad: 20,
  gap: 12,
  xs: 4,
  s: 8,
  m: 16,
  l: 24,
  xl: 32,
} as const;

export const size = {
  button: 56,
  tabBar: 64,
  fab: 52,
} as const;

export const fonts = {
  regular: 'Pretendard-Regular',
  medium: 'Pretendard-Medium',
  semibold: 'Pretendard-SemiBold',
  bold: 'Pretendard-Bold',
} as const;

// 숫자는 같은 서체에 tabular 숫자를 켠다.
export const tabular = { fontVariant: ['tabular-nums' as const] };

export const type = {
  title: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 36, color: colors.text },
  heading: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 28, color: colors.text },
  body: { fontFamily: fonts.medium, fontSize: 17, lineHeight: 24, color: colors.text },
  desc: { fontFamily: fonts.regular, fontSize: 19, lineHeight: 26, color: colors.sub },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.sub },
  // 온보딩의 안내 문구·카드 본문
  note: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.sub },
  button: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24, color: colors.onAccent },
  // 화면에서 가장 큰 숫자는 남은 시간 하나. 칼로리는 그보다 작게.
  timer: { fontFamily: fonts.bold, fontSize: 40, lineHeight: 48, ...tabular },
  number: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 34, ...tabular },
} as const;

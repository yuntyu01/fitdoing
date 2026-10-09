// 디자인 토큰. 색은 theme.ts(다크·라이트)에 있고, 여기는 크기·간격·글자만 둔다.
export const radius = {
  tile: 14,
  card: 16, // 일반 카드 (합계처럼 중요한 묶음에만)
  field: 12, // 입력칸·선택 버튼·요일 칩
  button: 16,
  pill: 999,
  // 홈(노션풍 시안) 실측
  block: 10, // 큰 카드
  blockTile: 6, // 끼니·헬스 카드
  day: 10, // 요일 줄 오늘 상자
} as const;

export const size = {
  button: 56,
  tabBar: 64,
  fab: 56,
} as const;

// 홈(노션풍) 간격. 시안(390pt 폭) 실측값, 모바일 논리 픽셀.
export const layout = {
  screen: 14, // 큰 카드 좌우
  header: 22, // 날짜 제목 좌우
  strip: 16, // 요일 줄·안내 문구 좌우
  section: 16, // 큰 카드 사이
  cardPad: 16, // 큰 카드 안
  titleGap: 16, // 제목과 본문 사이
  labelGap: 8, // 서로 관련된 라벨과 값 사이
  tile: 76, // 끼니·헬스 카드 한 변 (정사각형, 세 줄인 헬스 카드가 들어가는 크기)
  tileGap: 5, // 끼니·헬스 카드 사이
  feedbackPad: 20, // 주간 피드백 아래
  fabGap: 16, // 촬영 버튼과 하단 탭 사이
  hairline: 1, // 구분선·테두리 두께
  // 홈 외 화면 공통 (2026-10-09 시안)
  page: 24, // 화면 좌우
  block: 28, // 큰 영역 사이
  inner: 16, // 카드 안
  related: 8, // 관련된 글자 사이
} as const;

// 글자 위계 (색은 테마에서). 제목·핵심 숫자만 굵게, 항목명·시간·단위는 가볍게.
export const text = {
  title: { fontFamily: 'Pretendard-Bold', fontSize: 24, lineHeight: 32 }, // 화면 제목
  heading: { fontFamily: 'Pretendard-SemiBold', fontSize: 18, lineHeight: 24 }, // 소제목
  body: { fontFamily: 'Pretendard-Regular', fontSize: 15, lineHeight: 22 },
  bodyMedium: { fontFamily: 'Pretendard-Medium', fontSize: 15, lineHeight: 22 },
  label: { fontFamily: 'Pretendard-Regular', fontSize: 16, lineHeight: 22 }, // 목록 항목명
  caption: { fontFamily: 'Pretendard-Regular', fontSize: 13, lineHeight: 18 }, // 보조 정보
  small: { fontFamily: 'Pretendard-Regular', fontSize: 12, lineHeight: 16 },
  number: { fontFamily: 'Pretendard-Bold', fontSize: 28, lineHeight: 34, fontVariant: ['tabular-nums' as const] },
  timer: { fontFamily: 'Pretendard-Bold', fontSize: 52, lineHeight: 60, fontVariant: ['tabular-nums' as const] },
} as const;

export const fonts = {
  regular: 'Pretendard-Regular',
  medium: 'Pretendard-Medium',
  semibold: 'Pretendard-SemiBold',
  bold: 'Pretendard-Bold',
} as const;


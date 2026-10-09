// 친구 기능 데이터 모양. 서버 /api/friends/* 응답 JSON과 같다 (server/internal/friends).
// 화면은 이 타입만 알고, 실제 값은 data.ts(네이티브: 서버 API)나 data.web.ts(웹 스크린샷: 예시)에서 받는다.

/** 친구 한 명 (목록·머리글용). 이름은 친구가 정한 닉네임, 없으면 서버가 "친구"로 채운다. */
export interface FriendSummary {
  id: string;
  name: string;
  since: string; // 친구가 된 시각 (ISO 8601)
}

/** 한 끼 영양 (먹은 만큼 계산이 끝난 값, 서버가 계산해서 준다) */
export interface Nutrition {
  kcal: number;
  carbs: number;
  protein: number;
  fat: number;
}

/**
 * 게시물 하나 = 친구가 공유한 한 끼, 또는 친구의 헬스 인증 하루.
 * id는 'meal:<친구>:<날짜>:<끼니>' / 'gym:<친구>:<날짜>' 꼴이고, 응원·댓글·사진 요청에 그대로 쓴다.
 */
export interface FriendPost {
  id: string;
  friendId: string;
  name: string;
  kind: 'meal' | 'gym';
  date: string; // 'YYYY-MM-DD' (친구 기준 날짜)
  mealIndex: number | null; // n끼, 헬스는 null
  loggedAt: string; // ISO 8601. 끼니는 기록 시각, 헬스는 인증 시각
  items: string[]; // 음식 이름 (헬스는 빈 배열)
  nutrition: Nutrition | null; // 헬스는 null
  hasPhoto: boolean; // 친구가 사진 백업을 켜서 올린 사진이 있는지
  cheers: number; // 응원 수 (내 응원 포함)
  cheered: boolean; // 내가 응원했는지
  comments: number;
}

/** 피드 한 쪽. nextCursor를 다음 요청의 before로 넘긴다. 마지막 쪽이면 null. */
export interface FeedPage {
  posts: FriendPost[];
  nextCursor: string | null;
}

/** 아직 기록이 없는 끼니 (친구 설정의 마감 시각) */
export interface PlannedMeal {
  mealIndex: number;
  deadline: string; // 'HH:mm'
}

/** 친구의 하루 (/friend?id=&date=). 공유한 기록만 온다. */
export interface FriendDay {
  friend: FriendSummary;
  date: string;
  entries: FriendPost[]; // 시간 순
  planned: PlannedMeal[];
  summary: {
    logged: number; // 공유한 끼니 수
    meals: number; // 친구의 하루 끼니 수
    gymDone: boolean;
    gymPlanned: boolean; // 오늘이 친구의 헬스 요일인지 (헬스 공유를 켰을 때만)
  };
}

/** 댓글 하나 */
export interface FriendComment {
  id: string;
  postId: string;
  authorId: string;
  name: string;
  body: string;
  createdAt: string;
  mine: boolean; // 내가 쓴 댓글 (지울 수 있다)
}

/** 응원 누른 뒤 서버 값 */
export interface CheerState {
  postId: string;
  cheers: number;
  cheered: boolean;
}

/** 친구의 하루 시간 흐름 한 줄: 공유한 게시물 또는 아직 안 찍은 끼니 */
export type TimelineItem =
  { kind: 'post'; time: string; post: FriendPost } | { kind: 'planned'; time: string; mealIndex: number };

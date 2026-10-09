// 웹 스크린샷 전용 예시 데이터 (data.web.ts만 쓴다). 서버와 연결되지 않은 가짜 친구·기록이다.
// 네이티브 앱은 서버 API(data.ts)를 쓰므로 이 값이 폰에 나오는 일은 없다.
import { dateKey } from '../../domain/time';
import type { FriendComment, FriendDay, FriendPost, FriendSummary, Nutrition } from './types';

const MINUTE = 60 * 1000;

const since = '2026-09-01T00:00:00.000Z';
const minsu: FriendSummary = { id: 'sample-minsu', name: '민수', since };
const seojun: FriendSummary = { id: 'sample-seojun', name: '서준', since };
const jiwoo: FriendSummary = { id: 'sample-jiwoo', name: '지우', since };

export const sampleFriends: FriendSummary[] = [minsu, seojun, jiwoo];
export const sampleCode = 'K7MP4XQ2';

/** 오늘 hh:mm의 ISO 시각 */
function at(now: Date, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function meal(
  f: FriendSummary,
  now: Date,
  mealIndex: number,
  time: string,
  items: string[],
  nutrition: Nutrition,
  social: { cheers: number; cheered: boolean; comments: number },
): FriendPost {
  const date = dateKey(now);
  return {
    id: `meal:${f.id}:${date}:${mealIndex}`,
    friendId: f.id,
    name: f.name,
    kind: 'meal',
    date,
    mealIndex,
    loggedAt: at(now, time),
    items,
    nutrition,
    hasPhoto: false,
    ...social,
  };
}

function gym(
  f: FriendSummary,
  now: Date,
  time: string,
  social: { cheers: number; cheered: boolean; comments: number },
) {
  const date = dateKey(now);
  return {
    id: `gym:${f.id}:${date}`,
    friendId: f.id,
    name: f.name,
    kind: 'gym' as const,
    date,
    mealIndex: null,
    loggedAt: at(now, time),
    items: [],
    nutrition: null,
    hasPhoto: false,
    ...social,
  };
}

function posts(now: Date) {
  return {
    minsu: [
      meal(minsu, now, 1, '08:10', ['오트밀', '요거트'], { kcal: 380, carbs: 35, protein: 24, fat: 16 }, z(2, 0)),
      meal(minsu, now, 2, '12:18', ['닭가슴살 덮밥'], { kcal: 520, carbs: 60, protein: 30, fat: 18 }, z(3, 1)),
      meal(minsu, now, 3, '16:05', ['요거트', '바나나'], { kcal: 260, carbs: 28, protein: 19, fat: 8 }, z(1, 0)),
      gym(minsu, now, '17:40', z(4, 2)),
    ],
    seojun: [
      meal(seojun, now, 1, '11:20', ['소고기 비빔밥'], { kcal: 610, carbs: 78, protein: 32, fat: 17 }, z(1, 0)),
      gym(seojun, now, '17:40', z(5, 0)),
    ],
    jiwoo: [
      meal(
        jiwoo,
        now,
        1,
        '07:40',
        ['통밀 토스트', '삶은 달걀'],
        { kcal: 340, carbs: 32, protein: 20, fat: 12 },
        z(0, 0),
      ),
      meal(jiwoo, now, 2, '12:30', ['연어 포케'], { kcal: 560, carbs: 58, protein: 34, fat: 20 }, z(1, 2, true)),
    ],
  };
}

function z(cheers: number, comments: number, cheered = false) {
  return { cheers, comments, cheered };
}

/** 피드 예시: 오늘 올라온 게시물, 최근 것부터 (지금 시각보다 앞선 것만) */
export function sampleFeed(now: Date): FriendPost[] {
  const p = posts(now);
  return [...p.minsu, ...p.seojun, ...p.jiwoo]
    .filter((x) => new Date(x.loggedAt).getTime() <= now.getTime() - MINUTE)
    .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
}

/** 친구의 하루 예시. 없는 id면 null. */
export function sampleDay(id: string, now: Date): FriendDay | null {
  const p = posts(now);
  const date = dateKey(now);
  const make = (friend: FriendSummary, entries: FriendPost[], meals: number, gymPlanned: boolean): FriendDay => {
    const logged = entries.filter((e) => e.kind === 'meal');
    const planned = [];
    for (let i = logged.length + 1; i <= meals; i++) planned.push({ mealIndex: i, deadline: `${12 + i * 2}:00` });
    return {
      friend,
      date,
      entries,
      planned,
      summary: { logged: logged.length, meals, gymDone: entries.some((e) => e.kind === 'gym'), gymPlanned },
    };
  };
  switch (id) {
    case minsu.id:
      return make(minsu, p.minsu, 4, true);
    case seojun.id:
      return make(seojun, p.seojun, 2, true);
    case jiwoo.id:
      return make(jiwoo, p.jiwoo, 3, false);
    default:
      return null;
  }
}

/** 댓글 예시 */
export function sampleComments(postId: string, now: Date): FriendComment[] {
  const ago = (min: number) => new Date(now.getTime() - min * MINUTE).toISOString();
  return [
    {
      id: 'c1',
      postId,
      authorId: jiwoo.id,
      name: jiwoo.name,
      body: '맛있겠다! 레시피 알려줘',
      createdAt: ago(40),
      mine: false,
    },
    { id: 'c2', postId, authorId: 'me', name: '나', body: '오늘도 잘 챙겨 먹네', createdAt: ago(12), mine: true },
  ];
}

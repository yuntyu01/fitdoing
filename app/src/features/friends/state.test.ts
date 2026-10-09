import { clockText } from './format';
import { buildTimeline, clearPatches, patchPost, usePostPatches } from './state';
import type { FriendDay, FriendPost } from './types';

const post = (id: string, kind: 'meal' | 'gym', loggedAt: string, mealIndex: number | null): FriendPost => ({
  id,
  friendId: 'f',
  name: '민수',
  kind,
  date: '2026-09-28',
  mealIndex,
  loggedAt,
  items: [],
  nutrition: null,
  hasPhoto: false,
  cheers: 0,
  cheered: false,
  comments: 0,
});

// 폰 시간대와 상관없이 같은 결과가 나오게, 기대 시각도 clockText로 만든다
const local = (h: number, m: number) => new Date(2026, 8, 28, h, m).toISOString();

describe('buildTimeline', () => {
  it('공유한 기록(내 폰 시각)과 아직 안 찍은 끼니(마감)를 시간 순으로 섞는다', () => {
    const day: FriendDay = {
      friend: { id: 'f', name: '민수', since: '' },
      date: '2026-09-28',
      entries: [post('m1', 'meal', local(8, 10), 1), post('g', 'gym', local(17, 40), null)],
      planned: [
        { mealIndex: 2, deadline: '14:00' },
        { mealIndex: 4, deadline: '19:00' },
      ],
      summary: { logged: 1, meals: 4, gymDone: true, gymPlanned: true },
    };
    const items = buildTimeline(day);
    expect(items.map((i) => (i.kind === 'post' ? i.post.id : `planned-${i.mealIndex}`))).toEqual([
      'm1',
      'planned-2',
      'g',
      'planned-4',
    ]);
    expect(items[0].time).toBe('08:10');
    expect(clockText(local(17, 40))).toBe('17:40');
    expect(clockText('nope')).toBe('');
  });
});

describe('post patches', () => {
  it('응원·댓글 수를 먼저 반영하고, 서버에서 새로 받으면 지운다', () => {
    patchPost('p', { cheers: 1, cheered: true });
    patchPost('p', { comments: 2 });
    expect(usePostPatches.getState().patches.p).toEqual({ cheers: 1, cheered: true, comments: 2 });
    clearPatches(['p']);
    expect(usePostPatches.getState().patches.p).toBeUndefined();
  });
});

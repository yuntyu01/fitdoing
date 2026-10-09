// 네이티브(data.ts)와 웹 예시(data.web.ts)가 함께 쓰는 친구 상태: 응원·댓글 수 덮어쓰기, 하루 시간 흐름 만들기.
import { create } from 'zustand';

import { clockText } from './format';
import type { FriendDay, FriendPost, TimelineItem } from './types';

/** 서버에서 다시 받기 전까지 화면에 먼저 반영하는 값 (응원 누름, 댓글 쓰기·지우기) */
export interface PostPatch {
  cheers?: number;
  cheered?: boolean;
  comments?: number;
}

// 피드·친구의 하루·댓글 화면이 같은 게시물을 보여 주므로, 바뀐 값을 한곳에 둬서 어디서 바꿔도 같이 바뀌게 한다.
export const usePostPatches = create<{ patches: Record<string, PostPatch> }>(() => ({ patches: {} }));

export function patchPost(id: string, patch: PostPatch) {
  usePostPatches.setState((s) => ({ patches: { ...s.patches, [id]: { ...s.patches[id], ...patch } } }));
}

/** 서버에서 새로 받은 게시물은 서버 값이 맞으니 덮어쓰기를 지운다. */
export function clearPatches(ids: string[]) {
  usePostPatches.setState((s) => {
    if (!ids.some((id) => id in s.patches)) return s;
    const patches = { ...s.patches };
    for (const id of ids) delete patches[id];
    return { patches };
  });
}

/** 덮어쓰기를 반영한 게시물 값 */
export function usePatched(post: FriendPost): FriendPost {
  const patch = usePostPatches((s) => s.patches[post.id]);
  return patch ? { ...post, ...patch } : post;
}

/** 친구의 하루 시간 흐름: 공유한 기록(내 폰 시각으로 바꾼 기록 시각) + 아직 안 찍은 끼니(마감 시각)를 시간 순으로 */
export function buildTimeline(day: FriendDay): TimelineItem[] {
  const items: TimelineItem[] = [
    ...day.entries.map((post) => ({ kind: 'post' as const, time: clockText(post.loggedAt), post })),
    ...day.planned.map((p) => ({ kind: 'planned' as const, time: p.deadline, mealIndex: p.mealIndex })),
  ];
  return items.sort((a, b) => a.time.localeCompare(b.time)); // 'HH:mm'이라 글자 비교 = 시간 비교
}

// 친구를 맺거나 끊으면 올린다. 피드(탭이라 계속 떠 있다)가 보고 다시 불러온다.
export const useFriendsVersion = create<{ v: number }>(() => ({ v: 0 }));
export const bumpFriends = () => useFriendsVersion.setState((s) => ({ v: s.v + 1 }));

/** 화면이 구분하는 오류 종류 */
export type FriendError = 'offline' | 'notFound' | 'codeNotFound' | 'self' | 'invalid' | 'server';

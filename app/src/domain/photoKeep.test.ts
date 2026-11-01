import { photosToPurge } from './photoKeep';

const rows = [
  { date: '2026-06-01', photoUri: 'a.jpg' },
  { date: '2026-08-27', photoUri: 'b.jpg' },
  { date: '2026-08-28', photoUri: 'c.jpg' },
  { date: '2026-05-01', photoUri: null },
];
const now = new Date(2026, 8, 27, 9, 0);

describe('photosToPurge', () => {
  it('계속 보관이면 아무것도 지우지 않는다', () => {
    expect(photosToPurge(rows, null, now)).toEqual([]);
  });

  it('보관 기간이 지난 날의 사진만 고른다', () => {
    // 9월 27일의 30일 전은 8월 28일: 그날부터는 남긴다
    expect(photosToPurge(rows, 30, now).map((r) => r.photoUri)).toEqual(['a.jpg', 'b.jpg']);
  });

  it('사진이 없는 끼니는 건드리지 않는다', () => {
    expect(photosToPurge(rows, 30, now).some((r) => r.photoUri === null)).toBe(false);
  });
});

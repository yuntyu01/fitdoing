import { deadlinesFor, mealStatuses, resizeMeals, scheduleDay, type MealSlot } from './meals';
import { dateKey } from './time';

const four: MealSlot[] = [
  { index: 1, deadline: '08:00' },
  { index: 2, deadline: '14:00' },
  { index: 3, deadline: '17:00' },
  { index: 4, deadline: '19:00' },
];

const day = new Date(2026, 8, 26); // 9월 26일

describe('deadlinesFor', () => {
  it('그날 시각으로 펼친다', () => {
    const d = deadlinesFor(day, four);
    expect(d.map((x) => x.at.getHours())).toEqual([8, 14, 17, 19]);
    expect(d.every((x) => x.date === '2026-09-26')).toBe(true);
  });

  it('자정을 넘긴 끼니는 다음 날 시각이지만 날짜 키는 그대로', () => {
    const d = deadlinesFor(day, [...four, { index: 5, deadline: '00:30' }]);
    expect(dateKey(d[4].at)).toBe('2026-09-27');
    expect(d[4].date).toBe('2026-09-26');
  });

  it('index 순서로 정렬한다', () => {
    const d = deadlinesFor(day, [four[2], four[0], four[1]]);
    expect(d.map((x) => x.index)).toEqual([1, 2, 3]);
  });
});

describe('mealStatuses', () => {
  const d = deadlinesFor(day, four);

  it('마감 전 첫 미기록만 current', () => {
    const now = new Date(2026, 8, 26, 18, 40);
    const s = mealStatuses(d, new Set([1, 2, 3]), now);
    expect(s.map((x) => x.state)).toEqual(['logged', 'logged', 'logged', 'current']);
  });

  it('마감 지난 미기록은 missed, 이후 끼니는 current/upcoming', () => {
    const now = new Date(2026, 8, 26, 9, 0);
    const s = mealStatuses(d, new Set(), now);
    expect(s.map((x) => x.state)).toEqual(['missed', 'current', 'upcoming', 'upcoming']);
  });

  it('마감 시각 정각은 이미 지난 것으로 본다', () => {
    const now = new Date(2026, 8, 26, 8, 0);
    expect(mealStatuses(d, new Set(), now)[0].state).toBe('missed');
  });

  it('다 지나면 current 없음', () => {
    const now = new Date(2026, 8, 26, 22, 0);
    expect(mealStatuses(d, new Set([4]), now).some((x) => x.state === 'current')).toBe(false);
  });
});

describe('scheduleDay', () => {
  const late = [...four, { index: 5, deadline: '00:30' }];

  it('자정 넘긴 끼니 마감 전이면 어제 일정', () => {
    expect(dateKey(scheduleDay(late, new Date(2026, 8, 27, 0, 10)))).toBe('2026-09-26');
  });

  it('그 끼니 마감이 지나면 오늘 일정', () => {
    expect(dateKey(scheduleDay(late, new Date(2026, 8, 27, 0, 40)))).toBe('2026-09-27');
  });

  it('자정을 안 넘기는 일정은 항상 오늘', () => {
    expect(dateKey(scheduleDay(four, new Date(2026, 8, 27, 0, 10)))).toBe('2026-09-27');
  });
});

describe('resizeMeals', () => {
  it('같은 수면 기존 마감 유지', () => {
    const changed = four.map((m) => (m.index === 2 ? { ...m, deadline: '13:00' } : m));
    expect(resizeMeals(changed, 4)[1].deadline).toBe('13:00');
  });

  it('수가 바뀌면 기본값으로', () => {
    const r = resizeMeals(four, 3);
    expect(r).toHaveLength(3);
    expect(r.map((m) => m.index)).toEqual([1, 2, 3]);
  });
});

import { dateKey, fromMinutes, splitDuration, toMinutes, weekKey, weekdayMon0 } from './time';

describe('시각 변환', () => {
  it('HH:mm <-> 분', () => {
    expect(toMinutes('19:30')).toBe(1170);
    expect(fromMinutes(1170)).toBe('19:30');
    expect(fromMinutes(1440 + 30)).toBe('00:30');
    expect(fromMinutes(-30)).toBe('23:30');
  });
});

describe('주 계산', () => {
  it('월요일이 0', () => {
    expect(weekdayMon0(new Date(2026, 8, 21))).toBe(0); // 월
    expect(weekdayMon0(new Date(2026, 8, 27))).toBe(6); // 일
  });

  it('weekKey는 그 주 월요일', () => {
    expect(weekKey(new Date(2026, 8, 27, 23, 59))).toBe('2026-09-21');
    expect(weekKey(new Date(2026, 8, 28, 0, 0))).toBe('2026-09-28');
  });

  it('dateKey는 로컬 날짜', () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('splitDuration', () => {
  it('올림해서 시·분', () => {
    expect(splitDuration(80)).toEqual({ h: 1, m: 20 });
    expect(splitDuration(19.2)).toEqual({ h: 0, m: 20 });
    expect(splitDuration(-5)).toEqual({ h: 0, m: 0 });
  });
});

import { applyPortion, baseName, cleanBarcode, photoFileName, pickMealIndex, resizeTarget, sanitizeAi, toMealBackup } from './logging';

const m = (index: number, state: 'logged' | 'current' | 'upcoming' | 'missed') => ({ index, state });

describe('pickMealIndex', () => {
  it('현재 끼니를 고른다', () => {
    expect(pickMealIndex([m(1, 'logged'), m(2, 'current'), m(3, 'upcoming')])).toBe(2);
  });
  it('현재가 없으면 못 찍은 끼니 중 가장 최근', () => {
    expect(pickMealIndex([m(1, 'missed'), m(2, 'logged'), m(3, 'missed')])).toBe(3);
  });
  it('모두 기록했으면 마지막 끼니', () => {
    expect(pickMealIndex([m(1, 'logged'), m(2, 'logged')])).toBe(2);
  });
  it('끼니가 없으면 null', () => {
    expect(pickMealIndex([])).toBeNull();
  });
});

describe('applyPortion', () => {
  it('먹은 비율을 곱한다', () => {
    expect(applyPortion({ kcal: 800, carbs: 100, protein: 40, fat: 20 }, 0.25)).toEqual({ kcal: 200, carbs: 25, protein: 10, fat: 5 });
  });
});

describe('sanitizeAi', () => {
  it('빈 이름을 버리고 숫자를 정수·0 이상으로 맞춘다', () => {
    const r = sanitizeAi({ items: [{ name: ' 밥 ', amount: ' 1공기 ' }, { name: ' ', amount: '' }], kcal: 300.6, carbs: -1, protein: NaN, fat: 4.4, confidence: 2 });
    expect(r).toEqual({ items: [{ name: '밥', amount: '1공기' }], kcal: 301, carbs: 0, protein: 0, fat: 4, confidence: 1 });
  });
});

describe('resizeTarget', () => {
  it('가로가 길면 width만 줄인다', () => expect(resizeTarget(4000, 3000)).toEqual({ width: 1024 }));
  it('세로가 길면 height만 줄인다', () => expect(resizeTarget(3000, 4000)).toEqual({ height: 1024 }));
  it('이미 작으면 null', () => expect(resizeTarget(800, 600)).toBeNull());
});

describe('사진 경로', () => {
  it('파일 이름', () => expect(photoFileName('2026-09-26', 3, 1700000000000)).toBe('2026-09-26_3_1700000000000.jpg'));
  it('baseName', () => expect(baseName('file:///data/a/b.jpg')).toBe('b.jpg'));
});

describe('cleanBarcode', () => {
  it('특수문자를 지운다', () => expect(cleanBarcode(' 880-123 ')).toBe('880123'));
  it('빈 값은 null', () => expect(cleanBarcode('--')).toBeNull());
});

describe('toMealBackup', () => {
  it('서버 본문으로 바꾼다', () => {
    const b = toMealBackup({ date: '2026-09-26', index: 2, deadline: '14:00', barcode: null, ai: { items: [], kcal: 10.2, carbs: 1, protein: 1, fat: 1, confidence: 0.5 }, portion: 0.5, sharedMeal: true, loggedAt: 0 });
    expect(b.loggedAt).toBe('1970-01-01T00:00:00.000Z');
    expect(b.ai.kcal).toBe(10);
    expect(b.cheat).toBe(false);
  });
});

import { approxKcal, roundGram, roundKcal } from './format';

describe('roundKcal', () => {
  it('10 단위로 반올림한다', () => {
    expect(roundKcal(1164)).toBe(1160);
    expect(roundKcal(1165)).toBe(1170);
  });

  it('음수·NaN·Infinity는 0', () => {
    expect(roundKcal(-5)).toBe(0);
    expect(roundKcal(NaN)).toBe(0);
    expect(roundKcal(Infinity)).toBe(0);
  });
});

describe('roundGram', () => {
  it('정수로 반올림한다', () => {
    expect(roundGram(72.5)).toBe(73);
    expect(roundGram(0.4)).toBe(0);
  });
});

describe('approxKcal', () => {
  it('"약"과 천 단위 구분 기호를 붙인다', () => {
    expect(approxKcal(1158, '약')).toBe('약 1,160');
    expect(approxKcal(1158, 'about')).toBe('about 1,160');
    expect(approxKcal(12345, '약')).toBe('약 12,350');
  });
});

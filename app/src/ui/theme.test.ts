import { ACCENTS, contrast, DEFAULT_ACCENT, DEFAULT_GRADIENT, hexToRgb, rgbToHsv } from './color';
import { makeGlass } from './theme';

describe('makeGlass', () => {
  it('기본 무채색은 modo 흰색 테마에서 잰 색과 같다', () => {
    const { palette, tokens } = makeGlass('dark', DEFAULT_ACCENT, DEFAULT_GRADIENT);
    expect(tokens.gradient).toEqual(['#494B4F', '#212224', '#000000']);
    expect(palette.card).toBe('rgba(27,28,32,0.8)'); // 불투명도 80%
  });

  it('테마색의 색상으로 위쪽 그라데이션과 다크 카드를 물들인다', () => {
    const { palette, tokens } = makeGlass('dark', '#85ADE2', DEFAULT_GRADIENT);
    const [hue] = rgbToHsv(hexToRgb(tokens.gradient[0]));
    expect(hue).toBeGreaterThan(200);
    expect(hue).toBeLessThan(230);
    expect(palette.card).not.toBe('rgba(27,28,32,0.8)');
    expect(palette.bar).toBe('#85ADE2');
  });

  it('그라데이션을 0으로 내리면 바탕색과 같아진다', () => {
    expect(makeGlass('dark', '#85ADE2', 0).tokens.gradient[0]).toBe('#000000');
    expect(makeGlass('light', '#85ADE2', 0).tokens.gradient[0]).toBe('#F7F9FC');
  });

  it('바탕에 묻히는 색은 반대쪽 무채색으로 바꾼다', () => {
    expect(makeGlass('dark', '#111111', DEFAULT_GRADIENT).palette.bar).toBe('#F2F3F5');
    expect(makeGlass('light', '#FFFFFF', DEFAULT_GRADIENT).palette.bar).toBe('#1B1C20');
  });

  it('테마색 위 글자는 중간 밝기면 흰색, 아주 밝은 색만 검정', () => {
    expect(makeGlass('dark', '#85ADE2', DEFAULT_GRADIENT).palette.onBar).toBe('#FFFFFF');
    expect(makeGlass('light', '#85ADE2', DEFAULT_GRADIENT).palette.onBar).toBe('#FFFFFF');
    expect(makeGlass('dark', '#F5C451', DEFAULT_GRADIENT).palette.onBar).toBe('#0B0C0E');
    expect(makeGlass('dark', DEFAULT_ACCENT, DEFAULT_GRADIENT).palette.onBar).toBe('#0B0C0E');
    expect(makeGlass('light', DEFAULT_ACCENT, DEFAULT_GRADIENT).palette.onBar).toBe('#FFFFFF');
  });

  it.each(['dark', 'light'] as const)('%s: 모든 테마색에서 막대가 카드와 구분된다', (scheme) => {
    const surface = scheme === 'dark' ? '#1B1C20' : '#FFFFFF';
    for (const accent of ACCENTS) {
      expect(contrast(makeGlass(scheme, accent, DEFAULT_GRADIENT).palette.bar, surface)).toBeGreaterThanOrEqual(1.95);
    }
  });
});

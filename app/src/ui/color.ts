// 색 계산 (순수 함수). 테마색으로 유리 디자인의 그라데이션·카드·탭바 색을 만들 때 쓴다.
export type RGB = [number, number, number];

/** 고를 수 있는 테마색. 순서는 고정하고, 새 색은 맨 뒤에만 붙인다(사용자가 기억한 자리 유지). */
export const ACCENTS = [
  '#85ADE2',
  '#FF7F6B',
  '#5FD38D',
  '#F5C451',
  '#B79CFF',
  '#FF8EC6',
  '#4FD1C5',
  '#FFA45B',
  '#FF6B6B',
  '#FFFFFF',
  '#A7B0BE',
  '#111111',
  '#4B4F58',
];
export const DEFAULT_ACCENT = '#FFFFFF'; // 무채색: 다크는 흰색, 라이트는 거의 검정으로 보인다
export const DEFAULT_GRADIENT = 0.7;

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0) as RGB;
}

export function rgbToHex([r, g, b]: RGB) {
  const part = (x: number) =>
    Math.round(Math.max(0, Math.min(255, x)))
      .toString(16)
      .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

export function rgbToHsv([r, g, b]: RGB): [number, number, number] {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const d = max - Math.min(R, G, B);
  let h = 0;
  if (d) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

export function hsvToRgb(h: number, s: number, v: number): RGB {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export function mix(a: string, b: string, t: number) {
  const [x, y] = [hexToRgb(a), hexToRgb(b)];
  return rgbToHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as RGB);
}

export function withAlpha(hex: string, alpha: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function isHex(s: string) {
  return /^#[0-9a-fA-F]{6}$/.test(s);
}

/** WCAG 상대 휘도 */
export function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** 바탕 위에서 보이도록(대비 min 이상) 색을 흰색/검은색 쪽으로 조금씩 옮긴다. */
export function ensureContrast(color: string, bg: string, min = 3) {
  const toward = luminance(bg) < 0.5 ? '#FFFFFF' : '#000000';
  let c = color;
  for (let i = 1; i <= 20 && contrast(c, bg) < min; i++) c = mix(color, toward, i * 0.05);
  return c;
}

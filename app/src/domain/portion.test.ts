import type { AiResult, FoodItem } from '../db/schema';
import {
  canPortionPerFood,
  clearFoodPortions,
  eatenFood,
  eatenFoodInMeal,
  foodFactor,
  hasFoodNumbers,
  itemPortion,
  mealToSave,
  photoSync,
  sumEatenFoods,
  usesFoodPortions,
  withFoodPortions,
} from './portion';

const rice: FoodItem = { name: '현미밥', amount: '200g', kcal: 300, carbs: 64, protein: 6, fat: 2 };
const chicken: FoodItem = { name: '닭가슴살', amount: '100g', kcal: 200, carbs: 0, protein: 40, fat: 4 };
const manual: FoodItem = { name: '김치', amount: '조금', kcal: null, carbs: null, protein: null, fat: null };
const ai = (items: FoodItem[], kcal = 500): AiResult => ({
  items,
  kcal,
  carbs: 64,
  protein: 46,
  fat: 6,
  confidence: 0.8,
});

describe('음식 하나', () => {
  it('portion이 없으면 1', () => {
    expect(itemPortion({})).toBe(1);
    expect(itemPortion({ portion: null })).toBe(1);
    expect(itemPortion({ portion: 0.75 })).toBe(0.75);
  });
  it('숫자가 모두 있어야 음식별 계산', () => {
    expect(hasFoodNumbers(rice)).toBe(true);
    expect(hasFoodNumbers(manual)).toBe(false);
    expect(hasFoodNumbers({ ...rice, fat: null })).toBe(false);
    expect(canPortionPerFood([rice, chicken])).toBe(true);
    expect(canPortionPerFood([rice, manual])).toBe(false);
    expect(canPortionPerFood([])).toBe(false);
  });
  it('먹은 만큼 = 음식 숫자 × 먹은 비율', () => {
    expect(eatenFood({ ...rice, portion: 0.75 })).toEqual({ kcal: 225, carbs: 48, protein: 4.5, fat: 1.5 });
    expect(eatenFood(chicken)).toEqual({ kcal: 200, carbs: 0, protein: 40, fat: 4 });
  });
});

describe('끼니 합계', () => {
  it('먹은 음식 합을 정수로 반올림', () => {
    expect(sumEatenFoods([{ ...rice, portion: 0.75 }, chicken])).toEqual({ kcal: 425, carbs: 48, protein: 45, fat: 6 });
  });
  it('모든 음식에 숫자가 있으면 합계를 다시 낸다', () => {
    const r = withFoodPortions(
      ai(
        [
          { ...rice, portion: 0.75 },
          { ...chicken, portion: 2 },
        ],
        999,
      ),
    );
    expect(r).toMatchObject({ kcal: 625, carbs: 48, protein: 85, fat: 10, confidence: 0.8 });
    expect(r.items[0].portion).toBe(0.75);
  });
  it('숫자 없는 음식이 있으면 그대로', () => {
    const a = ai([{ ...rice, portion: 0.5 }, manual], 999);
    expect(withFoodPortions(a)).toBe(a);
  });
  it('clearFoodPortions는 비율만 지운다', () => {
    expect(clearFoodPortions(ai([{ ...rice, portion: 0.5 }])).items[0]).toEqual({ ...rice, portion: null });
  });
});

describe('mealToSave', () => {
  it('음식별 모드: 합계는 음식 합, 끼니 먹은 양은 1', () => {
    const r = mealToSave(ai([{ ...rice, portion: 0.75 }, chicken]), 0.5, false);
    expect(r.perFood).toBe(true);
    expect(r.portion).toBe(1);
    expect(r.ai.kcal).toBe(425);
    expect(r.ai.items[0].portion).toBe(0.75);
  });
  it('숫자 없는 음식이 있으면 끼니 먹은 양과 원래 합계', () => {
    const r = mealToSave(ai([{ ...rice, portion: 0.75 }, manual], 320), 0.5, false);
    expect(r).toMatchObject({ perFood: false, portion: 0.5 });
    expect(r.ai.kcal).toBe(320);
    expect(r.ai.items[0].portion).toBeNull();
  });
  it('합계를 직접 고쳤으면 그 값 그대로 (음식별 숫자는 참고)', () => {
    const r = mealToSave(ai([{ ...rice, portion: 0.75 }, chicken], 700), 1, true);
    expect(r).toMatchObject({ perFood: false, portion: 1 });
    expect(r.ai.kcal).toBe(700);
  });
});

describe('usesFoodPortions (저장된 기록 다시 열기)', () => {
  it('합계가 음식 합과 같고 끼니 먹은 양이 1이면 음식별 기록', () => {
    const saved = mealToSave(ai([{ ...rice, portion: 0.75 }, chicken]), 1, false).ai;
    expect(usesFoodPortions(saved, 1)).toBe(true);
  });
  it('예전 기록(끼니 먹은 양 ≠ 1)은 아니다', () => {
    expect(usesFoodPortions(ai([rice, chicken]), 0.5)).toBe(false);
  });
  it('합계가 음식 합과 다르면(직접 고침·AI 합계) 아니다', () => {
    expect(usesFoodPortions(ai([rice, chicken], 520), 1)).toBe(false);
  });
  it('숫자 없는 음식이 있으면 아니다', () => {
    expect(usesFoodPortions(ai([rice, manual], 300), 1)).toBe(false);
  });
});

describe('음식 줄 표시', () => {
  it('새 기록: 음식별 비율 × 나눠 먹음', () => {
    expect(foodFactor({ portion: 0.75 }, 1, true)).toBe(0.375);
    expect(eatenFoodInMeal({ ...rice, portion: 0.5 }, 1)).toEqual({ kcal: 150, carbs: 32, protein: 3, fat: 1 });
  });
  it('예전 기록: 끼니 먹은 양만 (음식별 비율 없음)', () => {
    expect(foodFactor({}, 0.5)).toBe(0.5);
    expect(eatenFoodInMeal(chicken, 2, true)).toEqual({ kcal: 200, carbs: 0, protein: 40, fat: 4 });
  });
});

describe('photoSync', () => {
  const base = { uri: 'a.jpg', prevUri: null, prevShared: false, shareFriends: false, photoBackup: false };
  it('공유도 백업도 아니면 올리지 않는다', () => expect(photoSync(base)).toBe('none'));
  it('공유하면 올린다', () => expect(photoSync({ ...base, shareFriends: true })).toBe('upload'));
  it('사진 백업을 켰으면 올린다', () => expect(photoSync({ ...base, photoBackup: true })).toBe('upload'));
  it('공유했던 끼니를 공유 없이 다시 기록하면 서버 사진을 지운다', () =>
    expect(photoSync({ ...base, uri: 'b.jpg', prevUri: 'a.jpg', prevShared: true })).toBe('delete'));
  it('공유 끼니를 사진 없이 다시 기록하면 지운다', () =>
    expect(photoSync({ ...base, uri: null, prevUri: 'a.jpg', prevShared: true, shareFriends: true })).toBe('delete'));
  it('사진이 그대로고 이미 서버에 있으면 다시 올리지 않는다(수정)', () =>
    expect(photoSync({ ...base, prevUri: 'a.jpg', prevShared: true, shareFriends: true })).toBe('none'));
  it('수정에서 공유를 새로 켜면 올린다', () =>
    expect(photoSync({ ...base, prevUri: 'a.jpg', shareFriends: true })).toBe('upload'));
  it('사진을 바꿨으면 다시 올린다', () =>
    expect(photoSync({ ...base, uri: 'b.jpg', prevUri: 'a.jpg', photoBackup: true })).toBe('upload'));
});

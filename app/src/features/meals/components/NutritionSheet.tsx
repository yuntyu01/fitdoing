import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { AiResult } from '../../../db/schema';
import { BottomSheet } from '../../../ui/BottomSheet';
import { FullButton } from '../../../ui/FullButton';
import { NumberField } from '../../../ui/NumberField';
import { space, type } from '../../../ui/tokens';

type Keys = 'kcal' | 'carbs' | 'protein' | 'fat';

/** 칼로리·탄단지를 직접 고친다 (인식이 틀렸거나 실패했을 때). 한 접시 전체 기준. */
export function NutritionSheet({ visible, value, onClose, onSave }: { visible: boolean; value: AiResult; onClose: () => void; onSave: (v: Record<Keys, number>) => void }) {
  const { t } = useTranslation();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('review.nutritionTitle')}>
      <NutritionForm value={value} onSave={onSave} />
    </BottomSheet>
  );
}

// 시트가 열릴 때마다 새로 만들어져서 입력 상태가 현재 값으로 시작한다.
function NutritionForm({ value, onSave }: { value: AiResult; onSave: (v: Record<Keys, number>) => void }) {
  const { t } = useTranslation();
  const s = (n: number) => (n > 0 ? String(Math.round(n)) : '');
  const [f, setF] = useState<Record<Keys, string>>({ kcal: s(value.kcal), carbs: s(value.carbs), protein: s(value.protein), fat: s(value.fat) });
  const num = (k: Keys) => Number(f[k]) || 0;
  const set = (k: Keys) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <>
      <View style={styles.body}>
        <Text style={type.desc}>{t('review.nutritionDesc')}</Text>
        <NumberField label={t('review.kcalLabel')} value={f.kcal} onChange={set('kcal')} unit={t('common.kcal')} />
        <View style={styles.row}>
          <View style={styles.col}>
            <NumberField label={t('home.carbs')} value={f.carbs} onChange={set('carbs')} unit={t('common.gram')} />
          </View>
          <View style={styles.col}>
            <NumberField label={t('home.protein')} value={f.protein} onChange={set('protein')} unit={t('common.gram')} />
          </View>
          <View style={styles.col}>
            <NumberField label={t('home.fat')} value={f.fat} onChange={set('fat')} unit={t('common.gram')} />
          </View>
        </View>
        <FullButton label={t('common.save')} onPress={() => onSave({ kcal: num('kcal'), carbs: num('carbs'), protein: num('protein'), fat: num('fat') })} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.m },
  row: { flexDirection: 'row', gap: space.s },
  col: { flex: 1 },
});


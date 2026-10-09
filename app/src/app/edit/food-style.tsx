import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ALLERGY_LEN, ALLERGY_MAX, cleanAllergies, type FoodPattern, type FoodStyle } from '../../domain/nutrition';
import { FormNote, FormSection, RadioRow, Rows, TextField } from '../../features/settings/editors/Form';
import { useSettings, useSettingsValue } from '../../features/settings/store';
import { FullButton } from '../../ui/FullButton';
import { SubHeader } from '../../ui/Headers';
import { ListRow } from '../../ui/ListRow';
import { Screen } from '../../ui/Screen';
import { usePalette, useThemedStyles, type Palette } from '../../ui/theme';
import { fonts, text } from '../../ui/tokens';
import { Toggle } from '../../ui/Toggle';

// 음식 선택 방식: 영양 목표(탄단지 계산)와 따로 저장하는 선호. 특정 탄단지 비율을 강제하지 않고,
// 아직 음식 추천·성분 판별에 쓰지 않는다. 알레르기는 선호와 다른 값으로 따로 둔다.

const BASIC: FoodPattern[] = ['general', 'vegetarian', 'vegan', 'mediterranean'];

export default function EditFoodStyle() {
  const { t } = useTranslation();
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const s = useSettingsValue();
  const update = useSettings((st) => st.update);
  const [style, setStyle] = useState<FoodStyle>(s.foodStyle);
  const [allergies, setAllergies] = useState(s.allergies.join(', '));
  const [more, setMore] = useState(s.foodStyle.pattern === 'carnivore');

  const pick = (pattern: FoodPattern) =>
    setStyle(
      pattern === 'vegan'
        ? { pattern, eggs: false, dairy: false }
        : {
            ...style,
            pattern,
            eggs: style.pattern === 'vegan' ? true : style.eggs,
            dairy: style.pattern === 'vegan' ? true : style.dairy,
          },
    );

  const row = (p: FoodPattern) => (
    <RadioRow
      key={p}
      label={t(`foodStyle.pattern.${p}`)}
      desc={t(`foodStyle.desc.${p}`)}
      selected={style.pattern === p}
      onPress={() => pick(p)}
    />
  );

  return (
    <Screen
      header={<SubHeader title={t('settings.foodStyle')} onBack={() => router.back()} />}
      desc={t('foodStyle.screenDesc')}
      footer={
        <FullButton
          label={t('edit.save')}
          onPress={() => {
            update({ foodStyle: style, allergies: cleanAllergies(allergies.split(',')) });
            router.back();
          }}
        />
      }
    >
      <FormSection title={t('foodStyle.title')}>
        <View style={styles.list}>{BASIC.map(row)}</View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: more }}
          onPress={() => setMore((v) => !v)}
          style={styles.foldHead}
        >
          <Text style={styles.foldTitle}>{t('foodStyle.more')}</Text>
          {more ? <ChevronUp size={18} color={c.sub} /> : <ChevronDown size={18} color={c.sub} />}
        </Pressable>
        {more ? <View style={styles.list}>{row('carnivore')}</View> : null}
      </FormSection>

      {style.pattern === 'vegetarian' ? (
        <FormSection title={t('foodStyle.allowTitle')}>
          <Rows>
            <ListRow
              label={t('foodStyle.eggs')}
              right={<Toggle value={style.eggs} onChange={(eggs) => setStyle({ ...style, eggs })} />}
            />
            <ListRow
              label={t('foodStyle.dairy')}
              right={<Toggle value={style.dairy} onChange={(dairy) => setStyle({ ...style, dairy })} />}
            />
          </Rows>
        </FormSection>
      ) : null}

      <FormSection title={t('foodStyle.allergyTitle')}>
        <TextField
          value={allergies}
          onChange={setAllergies}
          placeholder={t('foodStyle.allergyPlaceholder')}
          maxLength={ALLERGY_MAX * (ALLERGY_LEN + 2)}
          accessibilityLabel={t('foodStyle.allergyTitle')}
        />
        <FormNote>{t('foodStyle.allergyNote')}</FormNote>
      </FormSection>
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    list: { gap: 4 },
    foldHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
    foldTitle: { ...text.label, fontFamily: fonts.medium, color: c.sub },
  });

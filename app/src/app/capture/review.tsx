import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Plus } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AiResult } from '../../db/schema';
import { formatNumber, roundGram, roundKcal } from '../../domain/format';
import { applyPortion, cleanBarcode, EMPTY_AI, PORTIONS, pickMealIndex, type Portion } from '../../domain/logging';
import { analyzeMeal } from '../../features/api/client';
import { ItemSheet, type FoodItem } from '../../features/meals/components/ItemSheet';
import { MealChips } from '../../features/meals/components/MealChips';
import { NutritionSheet } from '../../features/meals/components/NutritionSheet';
import { deleteStoredPhoto, shrinkPhoto, storePhoto } from '../../features/meals/photos';
import { logMeal } from '../../features/meals/save';
import { useSettingsValue } from '../../features/settings/store';
import { useNow, useToday } from '../../features/today/useToday';
import { Card, Divider } from '../../ui/Card';
import { FullButton } from '../../ui/FullButton';
import { ListRow } from '../../ui/ListRow';
import { Screen } from '../../ui/Screen';
import { Segmented } from '../../ui/Segmented';
import { Toggle } from '../../ui/Toggle';
import { colors, fonts, radius, space, type } from '../../ui/tokens';

type Phase = 'analyzing' | 'done' | 'failed' | 'manual';

/** 촬영 직후: 인식 결과를 고치고, 먹은 양을 고르고, 기록한다. */
export default function ReviewScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ photoUri?: string; w?: string; h?: string; barcode?: string; meal?: string }>();
  const settings = useSettingsValue();
  const now = useNow();
  const today = useToday(settings, now);

  const photoUri = params.photoUri || null;
  const barcode = cleanBarcode(params.barcode);

  const [phase, setPhase] = useState<Phase>(photoUri ? 'analyzing' : 'manual');
  const [attempt, setAttempt] = useState(0);
  const [shrunk, setShrunk] = useState<string | null>(null);
  const [ai, setAi] = useState<AiResult>(EMPTY_AI);
  const [portion, setPortion] = useState<Portion>(1);
  const [shared, setShared] = useState(false);
  const [mealIndex, setMealIndex] = useState<number | null>(params.meal ? Number(params.meal) : null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [editing, setEditing] = useState<{ at: number | null } | null>(null);
  const [nutritionOpen, setNutritionOpen] = useState(false);

  // 사진 → 긴 변 1024px로 줄이기 → 서버 분석. 서버가 죽어도 직접 입력으로 이어진다.
  useEffect(() => {
    if (!photoUri) return;
    let cancelled = false;
    (async () => {
      try {
        const small = shrunk ?? (await shrinkPhoto(photoUri, Number(params.w) || 0, Number(params.h) || 0));
        if (cancelled) return;
        setShrunk(small);
        const result = await analyzeMeal(small);
        if (cancelled) return;
        setAi(result);
        setPhase('done');
      } catch (e) {
        console.warn('analyze failed', e);
        if (!cancelled) setPhase('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
    // shrunk는 첫 실행에서 채워지므로 의존성에서 뺀다. 다시 인식하기는 attempt로만 돌린다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoUri, params.w, params.h, attempt]);

  const meals = today.meals;
  const chosen = mealIndex ?? pickMealIndex(meals);
  const slot = meals.find((m) => m.index === chosen) ?? null;
  const already = !!slot?.log;
  const nutrition = useMemo(() => applyPortion(ai, portion, shared), [ai, portion, shared]);

  const setItem = useCallback(
    (item: FoodItem) => {
      setAi((p) => {
        const items = [...p.items];
        if (editing?.at == null) items.push(item);
        else items[editing.at] = item;
        return { ...p, items };
      });
      setEditing(null);
    },
    [editing],
  );

  const removeItem = () => {
    const at = editing?.at;
    if (at != null) setAi((p) => ({ ...p, items: p.items.filter((_, i) => i !== at) }));
    setEditing(null);
  };

  const leave = () => {
    if (!photoUri && !barcode) return router.back();
    Alert.alert(t('review.leaveTitle'), t('review.leaveBody'), [
      { text: t('review.keep'), style: 'cancel' },
      { text: t('review.leave'), style: 'destructive', onPress: () => router.dismissAll() },
    ]);
  };

  const save = async () => {
    if (!slot || saving) return;
    setSaving(true);
    setSaveError(false);
    const at = Date.now();
    let stored: string | null = null;
    try {
      // 사진은 폰 안(앱 문서 디렉터리)에만 저장한다.
      if (shrunk) stored = storePhoto(shrunk, slot.date, slot.index, at);
      await logMeal(
        {
          date: slot.date,
          index: slot.index,
          deadline: settings.meals.find((m) => m.index === slot.index)?.deadline ?? '00:00',
          photoUri: stored,
          barcode,
          ai,
          portion,
          sharedMeal: shared,
        },
        settings,
      );
      router.dismissAll();
    } catch (e) {
      console.warn('log meal failed', e);
      deleteStoredPhoto(stored);
      setSaveError(true);
      setSaving(false);
    }
  };

  const portionLabels: Record<Portion, string> = { 0.25: t('review.portionQuarter'), 0.5: t('review.portionHalf'), 1: t('review.portionAll') };
  const lowConfidence = phase === 'done' && ai.items.length > 0 && ai.confidence < 0.5;

  return (
    <Screen
      header={
        <Pressable onPress={leave} hitSlop={12} accessibilityRole="button" style={styles.back}>
          <ChevronLeft size={24} color={colors.text} strokeWidth={1.8} />
          <Text style={styles.backTitle}>{t('review.title')}</Text>
        </Pressable>
      }
      footer={
        <View style={styles.footer}>
          {saveError ? <Text style={styles.error}>{t('review.saveFailed')}</Text> : null}
          <FullButton label={t('review.save')} onPress={save} disabled={saving || !slot || phase === 'analyzing'} />
        </View>
      }
    >
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
      ) : barcode ? (
        <Card>
          <Text style={type.desc}>{t('review.barcodeLabel', { code: barcode })}</Text>
          <Text style={[type.desc, { marginTop: space.xs }]}>{t('review.barcodeNote')}</Text>
        </Card>
      ) : null}

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>{phase === 'failed' ? t('review.failedTitle') : t('review.detected')}</Text>
        {phase === 'analyzing' ? (
          <View style={styles.analyzing}>
            <ActivityIndicator color={colors.text} />
            <Text style={type.desc}>{t('review.analyzing')}</Text>
          </View>
        ) : (
          <>
            {phase === 'failed' ? (
              <View style={styles.failed}>
                <Text style={type.desc}>{t('review.failedDesc')}</Text>
                <Pressable onPress={() => {
                    setPhase('analyzing');
                    setAttempt((a) => a + 1);
                  }} accessibilityRole="button" hitSlop={8}>
                  <Text style={styles.link}>{t('review.retry')}</Text>
                </Pressable>
              </View>
            ) : null}
            {lowConfidence ? <Text style={[type.caption, styles.pad]}>{t('review.confidence')}</Text> : null}
            {ai.items.length === 0 && phase !== 'failed' ? <Text style={[type.desc, styles.pad]}>{t('review.emptyList')}</Text> : null}
            {ai.items.map((it, i) => (
              <View key={`${i}-${it.name}`}>
                <Divider />
                <ListRow label={it.name} value={it.amount} onPress={() => setEditing({ at: i })} />
              </View>
            ))}
            <Divider />
            <ListRow
              label={t('review.addItem')}
              labelBold
              onPress={() => setEditing({ at: null })}
              right={<Plus size={20} color={colors.text} strokeWidth={1.8} />}
            />
          </>
        )}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>{t('review.howMuch')}</Text>
        <Segmented
          height={56}
          value={portion}
          onChange={setPortion}
          options={PORTIONS.map((p) => ({ value: p, label: portionLabels[p] }))}
        />
        <ListRow
          label={t('review.shared')}
          sub={t('review.sharedDesc')}
          right={<Toggle value={shared} onChange={setShared} />}
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>{t('review.estimate')}</Text>
        <Text style={styles.kcalText}>
          <Text style={styles.approx}>{t('common.approx')} </Text>
          <Text style={styles.kcal}>{formatNumber(roundKcal(nutrition.kcal))}</Text>
          <Text style={styles.approx}> {t('common.kcal')}</Text>
        </Text>
        <View style={styles.macros}>
          {(['carbs', 'protein', 'fat'] as const).map((k, i) => (
            <View key={k} style={[styles.macro, i > 0 && styles.macroSep]}>
              <Text style={type.caption}>{t(`home.${k}`)}</Text>
              <Text style={styles.macroNum}>
                {t('common.approx')} {roundGram(nutrition[k])}
                {t('common.gram')}
              </Text>
            </View>
          ))}
        </View>
        <Divider />
        <ListRow label={t('review.editNutrition')} onPress={() => setNutritionOpen(true)} />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>{t('review.whichMeal')}</Text>
        <MealChips meals={meals.map((m) => ({ index: m.index, logged: m.state === 'logged' }))} value={chosen} onChange={setMealIndex} />
        {already ? <Text style={type.caption}>{t('review.overwrite')}</Text> : null}
      </Card>

      <Text style={[type.caption, styles.note]}>{t('review.photoNote')}</Text>

      <ItemSheet
        visible={editing !== null}
        initial={editing?.at != null ? (ai.items[editing.at] ?? null) : null}
        onClose={() => setEditing(null)}
        onSave={setItem}
        onDelete={removeItem}
      />
      <NutritionSheet
        visible={nutritionOpen}
        value={ai}
        onClose={() => setNutritionOpen(false)}
        onSave={(v) => {
          setAi((p) => ({ ...p, ...v }));
          setNutritionOpen(false);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: space.s, height: 44, marginTop: space.s },
  backTitle: { fontFamily: fonts.medium, fontSize: 17, color: colors.text },
  photo: { width: '100%', height: 240, borderRadius: radius.card, backgroundColor: colors.line },
  card: { gap: space.m },
  cardTitle: { ...type.heading },
  analyzing: { flexDirection: 'row', alignItems: 'center', gap: space.s, paddingVertical: space.s },
  failed: { gap: space.s },
  link: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text, textDecorationLine: 'underline' },
  pad: { paddingBottom: space.xs },
  kcalText: { fontFamily: fonts.regular, color: colors.sub },
  approx: { fontFamily: fonts.regular, fontSize: 17, color: colors.sub },
  kcal: { ...type.number, color: colors.text },
  macros: { flexDirection: 'row' },
  macro: { flex: 1, gap: 2, paddingLeft: space.s },
  macroSep: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.line },
  macroNum: { fontFamily: fonts.semibold, fontSize: 17, color: colors.text, fontVariant: ['tabular-nums'] },
  note: { marginHorizontal: space.xs, marginBottom: space.m },
  footer: { gap: space.s },
  error: { ...type.caption, textAlign: 'center', color: colors.text },
});

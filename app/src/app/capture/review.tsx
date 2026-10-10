import { router, useLocalSearchParams } from 'expo-router';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AiResult } from '../../db/schema';
import { formatNumber, roundGram, roundKcal } from '../../domain/format';
import {
  applyPortion,
  cleanBarcode,
  EMPTY_AI,
  ITEM_PORTIONS,
  pickMealIndex,
  PORTIONS,
  type ItemPortion,
  type Portion,
} from '../../domain/logging';
import {
  canPortionPerFood,
  eatenFoodInMeal,
  foodFactor,
  itemPortion,
  mealToSave,
  usesFoodPortions,
} from '../../domain/portion';
import { fromMinutes, parseDateKey } from '../../domain/time';
import { analyzeMeal, lookupBarcode, type BarcodeProduct } from '../../features/api/client';
import { ItemSheet, type FoodItem } from '../../features/meals/components/ItemSheet';
import { MealChips } from '../../features/meals/components/MealChips';
import { NutritionSheet } from '../../features/meals/components/NutritionSheet';
import { PortionSheet } from '../../features/meals/components/PortionSheet';
import { deleteStoredPhoto, shrinkPhoto, storePhoto } from '../../features/meals/photos';
import { logMeal, readLoggedMeal } from '../../features/meals/save';
import { useSettingsValue } from '../../features/settings/store';
import { useNow, useToday } from '../../features/today/useToday';
import { Card, Divider } from '../../ui/Card';
import { FullButton } from '../../ui/FullButton';
import { CenterHeader } from '../../ui/Headers';
import { ListRow } from '../../ui/ListRow';
import { Screen } from '../../ui/Screen';
import { usePalette, useThemedStyles, type Palette } from '../../ui/theme';
import { Toggle } from '../../ui/Toggle';
import { fonts, layout, radius, text } from '../../ui/tokens';

// saved = 하루 상세에서 "수정"으로 연 저장된 끼니 (다시 분석하지 않는다)
type Phase = 'analyzing' | 'done' | 'failed' | 'manual' | 'saved';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const hhmm = (d: Date) => fromMinutes(d.getHours() * 60 + d.getMinutes());

/**
 * 촬영 직후: 인식 결과를 고치고, 음식별(또는 끼니 전체) 먹은 양을 고르고, 기록한다.
 * /capture/review?date=&index=&edit=1 이면 저장된 끼니를 불러와 고친다(같은 날·같은 끼니를 덮어쓴다).
 */
export default function ReviewScreen() {
  const { t } = useTranslation();
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const params = useLocalSearchParams<{
    photoUri?: string;
    w?: string;
    h?: string;
    barcode?: string;
    meal?: string;
    date?: string;
    index?: string;
    edit?: string;
  }>();
  const settings = useSettingsValue();
  const now = useNow();
  const today = useToday(settings, now);

  // 수정: 화면을 연 순간의 저장값으로 시작한다 (그 뒤 DB가 바뀌어도 고치던 내용을 덮지 않는다)
  const editMode = params.edit === '1';
  const [saved] = useState(() =>
    editMode && params.date && DATE_RE.test(params.date) && Number(params.index) > 0
      ? readLoggedMeal(params.date, Number(params.index))
      : null,
  );
  const missing = editMode && !saved;

  const photoUri = saved ? saved.photoUri : params.photoUri || null;
  const barcode = saved ? saved.barcode : cleanBarcode(params.barcode);

  // 헤더 아래 "오늘 18:40": 찍은(이 화면을 연) 시각. 수정이면 그 끼니를 기록한 날·시각.
  const [openedAt] = useState(() => new Date(saved?.loggedAt ?? Date.now()));
  const [phase, setPhase] = useState<Phase>(saved ? 'saved' : photoUri || barcode ? 'analyzing' : 'manual');
  // 바코드 조회 결과: 찾은 제품 / 등록 안 된 바코드(notFound) / 조회를 못 함(unavailable)
  const [product, setProduct] = useState<BarcodeProduct | 'notFound' | 'unavailable' | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [shrunk, setShrunk] = useState<string | null>(null);
  const [ai, setAi] = useState<AiResult>(saved?.ai ?? EMPTY_AI);
  const [portion, setPortion] = useState<Portion>((saved?.portion ?? 1) as Portion);
  const [shared, setShared] = useState(saved?.sharedMeal ?? false);
  const [shareFriends, setShareFriends] = useState(saved ? saved.shareFriends : settings.shareFriends);
  // 합계를 직접 고쳤다(또는 예전 방식으로 저장된 끼니): 음식별 먹은 양 대신 이 합계 × 끼니 전체 먹은 양으로 기록한다.
  const [manualTotals, setManualTotals] = useState(() =>
    saved ? !usesFoodPortions(saved.ai ?? EMPTY_AI, saved.portion) : false,
  );
  const [mealIndex, setMealIndex] = useState<number | null>(params.meal ? Number(params.meal) : null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [editing, setEditing] = useState<{ at: number | null } | null>(null);
  const [nutritionOpen, setNutritionOpen] = useState(false);
  const [portionOpen, setPortionOpen] = useState(false);
  const [foodAt, setFoodAt] = useState(0);
  const [foodOpen, setFoodOpen] = useState(false);

  // 사진 → 긴 변 1024px로 줄이기 → 서버 분석. 서버가 죽어도 직접 입력으로 이어진다. 수정에서는 분석하지 않는다.
  useEffect(() => {
    if (!photoUri || editMode) return;
    let cancelled = false;
    (async () => {
      try {
        const small = shrunk ?? (await shrinkPhoto(photoUri, Number(params.w) || 0, Number(params.h) || 0));
        if (cancelled) return;
        setShrunk(small);
        const result = await analyzeMeal(small);
        if (cancelled) return;
        setAi(result);
        setManualTotals(false);
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

  // 바코드: 찍자마자 제품·영양정보를 찾아 채운다(누를 것 없음). 못 찾으면 직접 입력이나 성분표 사진으로.
  useEffect(() => {
    if (!barcode || photoUri || editMode) return;
    let cancelled = false;
    (async () => {
      try {
        const found = await lookupBarcode(barcode);
        if (cancelled) return;
        if (!found) {
          setProduct('notFound');
          setPhase('manual');
          return;
        }
        setProduct(found.product);
        if (found.result) {
          setAi(found.result);
          setManualTotals(false);
          setPhase('done');
        } else {
          // 제품은 알지만 영양정보가 없다: 이름만 채워 두고 숫자는 직접
          setAi({ ...EMPTY_AI, items: [{ name: found.product.name, amount: '' }] });
          setPhase('manual');
        }
      } catch (e) {
        console.warn('barcode lookup failed', e);
        if (!cancelled) {
          setProduct('unavailable');
          setPhase('manual');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [barcode, photoUri, editMode, attempt]);

  const meals = today.meals;
  const chosen = saved ? saved.index : (mealIndex ?? pickMealIndex(meals));
  const slot = saved ? null : (meals.find((m) => m.index === chosen) ?? null);
  const already = !!slot?.log;

  // 저장할 모양: 모든 음식에 숫자가 있으면 음식별 먹은 양의 합(끼니 먹은 양 1), 아니면 끼니 전체 먹은 양.
  const plan = useMemo(() => mealToSave(ai, portion, manualTotals), [ai, portion, manualTotals]);
  const perFood = plan.perFood;
  const nutrition = useMemo(() => applyPortion(plan.ai, plan.portion, shared), [plan, shared]);

  const setItem = useCallback(
    (item: FoodItem) => {
      setAi((p) => {
        const items = [...p.items];
        if (editing?.at == null) items.push(item);
        else {
          // 이름이 같으면(양만 고침) AI가 추정한 음식별 칼로리·탄단지·먹은 양을 남기고, 다른 음식으로 바꾸면 버린다
          const prev = items[editing.at];
          items[editing.at] = prev && prev.name === item.name ? { ...prev, ...item } : item;
        }
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

  const setFoodPortion = (at: number, p: ItemPortion) => {
    setAi((prev) => ({ ...prev, items: prev.items.map((it, i) => (i === at ? { ...it, portion: p } : it)) }));
    setFoodOpen(false);
  };

  const close = () => (saved ? router.back() : router.dismissAll());

  const leave = () => {
    if (missing || (!saved && !photoUri && !barcode)) return router.back();
    Alert.alert(t(saved ? 'review.leaveEditTitle' : 'review.leaveTitle'), t('review.leaveBody'), [
      { text: t('review.keep'), style: 'cancel' },
      { text: t('review.leave'), style: 'destructive', onPress: close },
    ]);
  };

  const save = async () => {
    const target = saved
      ? { date: saved.date, index: saved.index, deadline: saved.deadline }
      : slot
        ? {
            date: slot.date,
            index: slot.index,
            deadline: settings.meals.find((m) => m.index === slot.index)?.deadline ?? '00:00',
          }
        : null;
    if (!target || saving) return;
    setSaving(true);
    setSaveError(false);
    const at = Date.now();
    let stored: string | null = null;
    try {
      // 사진은 폰 안(앱 문서 디렉터리)에 저장한다. 수정은 원래 사진을 그대로 둔다(같은 경로라 지워지지 않는다).
      if (saved) stored = saved.photoUri;
      else if (shrunk) stored = storePhoto(shrunk, target.date, target.index, at);
      await logMeal(
        {
          ...target,
          photoUri: stored,
          barcode,
          ai: plan.ai,
          portion: plan.portion,
          sharedMeal: shared,
          shareFriends,
          loggedAt: saved ? (saved.loggedAt ?? at) : undefined,
        },
        settings,
      );
      close();
    } catch (e) {
      console.warn('log meal failed', e);
      if (!saved) deleteStoredPhoto(stored);
      setSaveError(true);
      setSaving(false);
    }
  };

  const analyzing = phase === 'analyzing';
  const lowConfidence = phase === 'done' && ai.items.length > 0 && ai.confidence < 0.5;
  const pct = Math.round(portion * 100);
  const count = ai.items.length;
  const savedDay = saved ? parseDateKey(saved.date) : null;
  const food = ai.items[foodAt];
  const photoNote = shareFriends
    ? settings.photoBackup
      ? 'review.photoNoteBackupShared'
      : 'review.photoNoteShared'
    : settings.photoBackup
      ? 'review.photoNoteBackup'
      : 'review.photoNote';

  if (missing) {
    return (
      <Screen header={<CenterHeader title={t('review.editTitle')} onBack={() => router.back()} />}>
        <Text style={styles.bodySub}>{t('review.notFound')}</Text>
      </Screen>
    );
  }

  return (
    <Screen
      header={
        <View>
          <CenterHeader
            title={t(saved ? 'review.editTitle' : 'review.title')}
            onBack={leave}
            right={chosen ? <Text style={styles.headerRight}>{t('common.meal', { n: chosen })}</Text> : null}
          />
          <Text style={styles.when}>
            {savedDay
              ? t('review.whenDate', { month: savedDay.getMonth() + 1, day: savedDay.getDate(), time: hhmm(openedAt) })
              : t('review.when', { time: hhmm(openedAt) })}
          </Text>
        </View>
      }
      footer={
        <>
          {saveError ? <Text style={styles.error}>{t('review.saveFailed')}</Text> : null}
          <FullButton label={t('review.save')} onPress={save} disabled={saving || (!slot && !saved) || analyzing} />
        </>
      }
    >
      {photoUri || barcode ? (
        <View style={styles.top}>
          {photoUri ? <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" /> : null}
          {barcode ? (
            <View style={styles.related}>
              {product && typeof product === 'object' ? (
                <>
                  <Text style={styles.bodyText}>{product.name}</Text>
                  <Text style={styles.caption}>
                    {[product.maker, product.amount && t('review.barcodeBasis', { amount: product.amount })]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.bodyText}>{t('review.barcodeLabel', { code: barcode })}</Text>
                  {product === 'notFound' || product === 'unavailable' ? (
                    <Text style={styles.caption}>
                      {t(product === 'notFound' ? 'review.barcodeNotFound' : 'review.barcodeUnavailable')}
                    </Text>
                  ) : null}
                </>
              )}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.related}>
        <Card style={styles.summary}>
          <Text style={styles.caption}>{t('review.estimate')}</Text>
          {analyzing ? (
            <View style={styles.analyzing}>
              <ActivityIndicator color={c.sub} />
              <Text style={styles.bodySub}>{t(barcode && !photoUri ? 'review.lookingUp' : 'review.analyzing')}</Text>
            </View>
          ) : (
            <>
              <Text style={styles.kcalLine}>
                <Text style={styles.kcal}>{formatNumber(roundKcal(nutrition.kcal))}</Text>
                <Text style={styles.kcalUnit}> {t('common.kcal')}</Text>
              </Text>
              <View style={styles.macros}>
                {(['carbs', 'protein', 'fat'] as const).map((k, i) => (
                  <View key={k} style={[styles.macro, i > 0 && styles.macroSep]}>
                    <Text style={styles.caption}>{t(`home.${k}`)}</Text>
                    <Text style={styles.macroNum}>
                      {roundGram(nutrition[k])}
                      {t('common.gram')}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </Card>
        {analyzing ? null : (
          <Pressable
            onPress={() => setNutritionOpen(true)}
            accessibilityRole="button"
            hitSlop={8}
            style={({ pressed }) => [styles.editLink, pressed && styles.pressed]}
          >
            <Text style={styles.editLinkText}>{t('review.editNutrition')}</Text>
            <ChevronRight size={16} color={c.sub} strokeWidth={1.8} />
          </Pressable>
        )}
      </View>

      {analyzing ? null : (
        <View>
          <View style={styles.sectionHead}>
            <Text style={styles.heading}>{count > 0 ? t('review.foods', { count }) : t('review.foodsNone')}</Text>
            <Pressable onPress={() => setEditing({ at: null })} accessibilityRole="button" hitSlop={12}>
              <Text style={styles.addText}>{t('review.add')}</Text>
            </Pressable>
          </View>
          {phase === 'failed' ? (
            <View style={styles.notice}>
              <Text style={styles.bodySub}>
                {t('review.failedTitle')}. {t('review.failedDesc')}
              </Text>
              <Pressable
                onPress={() => {
                  setPhase('analyzing');
                  setAttempt((a) => a + 1);
                }}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text style={styles.link}>{t('review.retry')}</Text>
              </Pressable>
            </View>
          ) : null}
          {lowConfidence ? <Text style={[styles.caption, styles.notice]}>{t('review.confidence')}</Text> : null}
          {count === 0 && phase !== 'failed' ? (
            <Text style={[styles.bodySub, styles.notice]}>{t('review.emptyList')}</Text>
          ) : null}
          {manualTotals && canPortionPerFood(ai.items) ? (
            // 합계를 직접 고쳤거나 예전 방식으로 저장된 끼니: 음식별로 다시 계산할 수 있게
            <View style={styles.notice}>
              <Text style={styles.caption}>{t('review.mealMode')}</Text>
              <Pressable onPress={() => setManualTotals(false)} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.link}>{t('review.perFoodReset')}</Text>
              </Pressable>
            </View>
          ) : null}
          {ai.items.map((it, i) => {
            // 표시는 저장할 모양 기준: 끼니 전체 먹은 양이면 음식별 비율은 빠지고 끼니 비율만 곱한다
            const shown = plan.ai.items[i] ?? it;
            const eaten = eatenFoodInMeal(shown, plan.portion, shared);
            const eatenPct = Math.round(foodFactor(shown, plan.portion, shared) * 100);
            const itemPct = t('review.pct', { pct: Math.round(itemPortion(it) * 100) });
            return (
              <View key={`${i}-${it.name}`}>
                {i > 0 ? <Divider /> : null}
                <View style={styles.food}>
                  <Pressable
                    onPress={() => setEditing({ at: i })}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.foodText, pressed && styles.pressed]}
                  >
                    <Text style={styles.foodName}>{it.name}</Text>
                    {it.kcal != null ? (
                      <Text style={styles.bodySub}>
                        {formatNumber(roundKcal(eaten.kcal))} {t('common.kcal')}
                      </Text>
                    ) : null}
                    <Text style={styles.caption}>
                      {it.amount ? `${t('review.itemBase', { amount: it.amount })} · ` : ''}
                      {t('review.itemEaten', { pct: eatenPct })}
                    </Text>
                  </Pressable>
                  {perFood ? (
                    <Pressable
                      onPress={() => {
                        setFoodAt(i);
                        setFoodOpen(true);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`${it.name} ${t('review.howMuch')} ${itemPct}`}
                      style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
                    >
                      <Text style={styles.pillText}>{itemPct}</Text>
                      <ChevronDown size={16} color={c.text} strokeWidth={1.8} />
                    </Pressable>
                  ) : (
                    <ChevronRight size={18} color={c.sub} strokeWidth={1.8} />
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View>
        {perFood ? null : (
          <>
            {/* 음식별 숫자가 없는 음식이 있으면 음식별로 계산할 수 없어 끼니 전체 먹은 양을 고른다 */}
            <View style={styles.row}>
              <Text style={styles.label}>{t('review.howMuch')}</Text>
              <Pressable
                onPress={() => setPortionOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`${t('review.howMuch')} ${t('review.pct', { pct })}`}
                style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
              >
                <Text style={styles.pillText}>{t('review.pct', { pct })}</Text>
                <ChevronDown size={16} color={c.text} strokeWidth={1.8} />
              </Pressable>
            </View>
            <Divider />
          </>
        )}
        <ListRow
          label={t('review.shared')}
          desc={t('review.sharedDesc')}
          right={<Toggle value={shared} onChange={setShared} />}
        />
        <Divider />
        <ListRow
          label={t('review.shareFriends')}
          desc={t('review.shareFriendsDesc')}
          right={<Toggle value={shareFriends} onChange={setShareFriends} />}
        />
      </View>

      {savedDay ? (
        // 수정: 끼니는 바꿀 수 없다 (같은 날·같은 끼니를 덮어쓴다)
        <ListRow
          label={t('review.mealLabel')}
          value={t('review.mealOf', { month: savedDay.getMonth() + 1, day: savedDay.getDate(), n: saved!.index })}
        />
      ) : (
        <View style={styles.mealBlock}>
          <Text style={styles.heading}>{t('review.whichMeal')}</Text>
          <MealChips
            meals={meals.map((m) => ({ index: m.index, logged: m.state === 'logged' }))}
            value={chosen}
            onChange={setMealIndex}
          />
          {already ? <Text style={styles.caption}>{t('review.overwrite')}</Text> : null}
        </View>
      )}

      <Text style={styles.caption}>{t(photoNote)}</Text>

      <ItemSheet
        visible={editing !== null}
        initial={editing?.at != null ? (ai.items[editing.at] ?? null) : null}
        onClose={() => setEditing(null)}
        onSave={setItem}
        onDelete={removeItem}
      />
      <NutritionSheet
        visible={nutritionOpen}
        value={plan.ai}
        desc={perFood ? t('review.nutritionPerFoodDesc') : undefined}
        onClose={() => setNutritionOpen(false)}
        onSave={(v) => {
          // 음식별 합계를 고쳤으면 그 값이 먹은 양이라 끼니 먹은 양은 100%에서 시작한다
          if (perFood) setPortion(1);
          setAi((p) => ({ ...p, ...v }));
          setManualTotals(true);
          setNutritionOpen(false);
        }}
      />
      <PortionSheet
        visible={portionOpen}
        value={portion}
        options={PORTIONS}
        preview={(p) => applyPortion(plan.ai, p, shared)}
        desc={t('review.howMuchDesc')}
        onClose={() => setPortionOpen(false)}
        onApply={(p) => {
          setPortion(p);
          setPortionOpen(false);
        }}
      />
      {food ? (
        <PortionSheet
          visible={foodOpen}
          value={
            (ITEM_PORTIONS as readonly number[]).includes(itemPortion(food)) ? (itemPortion(food) as ItemPortion) : 1
          }
          options={ITEM_PORTIONS}
          preview={(p) => eatenFoodInMeal({ ...food, portion: p }, 1, shared)}
          food={{ name: food.name, amount: food.amount }}
          onClose={() => setFoodOpen(false)}
          onApply={(p) => setFoodPortion(foodAt, p)}
        />
      ) : null}
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    headerRight: { ...text.body, color: c.sub },
    when: { ...text.caption, color: c.sub, marginBottom: 12 },
    top: { gap: 12 },
    photo: { width: '100%', height: 160, borderRadius: radius.card, backgroundColor: c.card },
    related: { gap: 12 },
    summary: { padding: 20, gap: layout.related },
    analyzing: { flexDirection: 'row', alignItems: 'center', gap: layout.related, paddingVertical: 12 },
    kcalLine: { color: c.text },
    kcal: { fontFamily: fonts.bold, fontSize: 40, lineHeight: 48, color: c.text, fontVariant: ['tabular-nums'] },
    kcalUnit: { fontFamily: fonts.medium, fontSize: 20, color: c.text },
    macros: { flexDirection: 'row', marginTop: 12 },
    macro: { flex: 1, alignItems: 'center', gap: 4 },
    macroSep: { borderLeftWidth: layout.hairline, borderLeftColor: c.line },
    macroNum: { ...text.label, fontSize: 17, color: c.text, fontVariant: ['tabular-nums'] },
    editLink: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 2 },
    editLinkText: { ...text.caption, color: c.sub },
    row: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    label: { ...text.label, color: c.text, flexShrink: 1 },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 40,
      paddingHorizontal: 14,
      borderRadius: radius.field,
      backgroundColor: c.selected,
    },
    pillText: { ...text.bodyMedium, color: c.text, fontVariant: ['tabular-nums'] },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 4,
    },
    heading: { ...text.heading, color: c.text },
    addText: { ...text.bodyMedium, color: c.sub },
    notice: { paddingVertical: 12, gap: layout.related },
    link: { ...text.bodyMedium, color: c.text, textDecorationLine: 'underline' },
    food: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
    foodText: { flex: 1, gap: 2 },
    foodName: { ...text.label, fontFamily: fonts.semibold, color: c.text },
    mealBlock: { gap: 12 },
    bodyText: { ...text.body, color: c.text },
    bodySub: { ...text.body, color: c.sub },
    caption: { ...text.caption, color: c.sub },
    error: { ...text.caption, textAlign: 'center', color: c.text },
    pressed: { opacity: 0.6 },
  });

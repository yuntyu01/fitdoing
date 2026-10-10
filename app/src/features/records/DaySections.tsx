import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { FoodItem, gymLogs, lockEvents } from '../../db/schema';
import { formatNumber, roundKcal } from '../../domain/format';
import { mealLabel } from '../../domain/meals';
import { eatenFoodInMeal } from '../../domain/portion';
import { eatenFactor } from '../../domain/stats';
import { Divider } from '../../ui/Card';
import { ListRow } from '../../ui/ListRow';
import { useThemedStyles, type Palette } from '../../ui/theme';
import { fonts, radius, text } from '../../ui/tokens';
import { clock, eatenPct, kcalText, macroText, type MealRow } from './format';

type GymRow = typeof gymLogs.$inferSelect;
type LockRow = typeof lockEvents.$inferSelect;

/**
 * 한 끼: "2끼 12:18 … 수정", 사진(있을 때만), 음식 줄(이름·양·섭취 % / 먹은 만큼의 kcal·탄단지), 합계.
 * 음식 줄은 음식별 먹은 양 × 끼니 먹은 양 × 나눠 먹음을 곱한다(예전 기록은 음식별 먹은 양이 없어 끼니 비율만).
 * 합계는 저장된 끼니 합계(음식별 먹은 양이 이미 반영)에 끼니 비율을 곱한다. 음식별 추정이 없으면 이름·양만.
 */
export function MealSection({ meal, onEdit }: { meal: MealRow; onEdit?: () => void }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const ai = meal.ai;
  const f = eatenFactor(meal.portion, meal.sharedMeal); // 홈 식단 표와 같은 계산
  const items = ai?.items ?? [];
  const time = clock(meal.loggedAt);

  return (
    <View>
      <View style={styles.titleRow}>
        <Text style={styles.sectionTitle}>{mealLabel(t, meal.index)}</Text>
        {time ? <Text style={styles.time}>{time}</Text> : null}
        <View style={styles.spacer} />
        {onEdit ? (
          <Pressable
            onPress={onEdit}
            accessibilityRole="button"
            accessibilityLabel={t('day.editMeal', { n: meal.index })}
            hitSlop={12}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Text style={styles.edit}>{t('day.edit')}</Text>
          </Pressable>
        ) : null}
      </View>

      {meal.photoUri ? (
        <Image
          source={{ uri: meal.photoUri }}
          style={styles.photo}
          accessibilityLabel={t('records.mealPhoto', { n: meal.index })}
        />
      ) : null}
      {/* 같은 끼니의 2·3번째 사진 */}
      {meal.extraPhotoUris?.length ? (
        <View style={styles.extraPhotos}>
          {meal.extraPhotoUris.map((u) => (
            <Image key={u} source={{ uri: u }} style={styles.extraPhoto} />
          ))}
        </View>
      ) : null}

      <View style={styles.items}>
        {items.length === 0 ? <Text style={styles.muted}>{t('records.noItems')}</Text> : null}
        {items.map((it, i) => (
          <FoodRow key={i} item={it} meal={meal} t={t} styles={styles} />
        ))}
      </View>

      {ai ? (
        <>
          <Divider />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t('day.total')}</Text>
            <View style={styles.nums}>
              <Text style={styles.totalKcal}>
                {kcalText(ai.kcal * f)} {t('common.kcal')}
              </Text>
              <Text style={styles.macros}>
                {macroText(t, { carbs: ai.carbs * f, protein: ai.protein * f, fat: ai.fat * f })}
              </Text>
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

function FoodRow({
  item,
  meal,
  t,
  styles,
}: {
  item: FoodItem;
  meal: MealRow;
  t: TFunction;
  styles: ReturnType<typeof makeStyles>;
}) {
  const hasKcal = item.kcal != null;
  const hasMacros = item.carbs != null && item.protein != null && item.fat != null;
  const n = eatenFoodInMeal(item, meal.portion, meal.sharedMeal);
  const pct = eatenPct(item, meal);
  // "200g · 섭취 75%": 다 먹었으면 양만
  const sub = [item.amount, pct === 100 ? '' : t('day.eaten', { pct })].filter(Boolean).join(' · ');
  return (
    <View style={styles.food}>
      <View style={styles.foodName}>
        <Text style={styles.name}>{item.name}</Text>
        {sub ? <Text style={styles.amount}>{sub}</Text> : null}
      </View>
      {hasKcal || hasMacros ? (
        <View style={styles.nums}>
          {hasKcal ? (
            <Text style={styles.kcal}>
              {formatNumber(roundKcal(n.kcal))} {t('common.kcal')}
            </Text>
          ) : null}
          {hasMacros ? <Text style={styles.macros}>{macroText(t, n)}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const VERIFIED = { geofence: 'day.verifiedGeofence', photo: 'day.verifiedPhoto', rest: 'day.verifiedRest' } as const;

/** 헬스: "헬스 17:40" + 오른쪽 인증 방법. 사진은 저장하지 않아서 없다. */
export function GymSection({ gym }: { gym: GymRow }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const time = clock(gym.checkInAt);
  return (
    <View style={styles.titleRow}>
      <Text style={styles.sectionTitle}>{t('day.gym')}</Text>
      {time ? <Text style={styles.time}>{time}</Text> : null}
      <View style={styles.spacer} />
      {gym.verifiedBy ? <Text style={styles.time}>{t(VERIFIED[gym.verifiedBy])}</Text> : null}
    </View>
  );
}

const LOCK_TYPE = { meal: 'day.lockMeal', gym: 'day.lockGym', sleep: 'day.lockSleep' } as const;
const RELEASED = {
  action: 'day.releasedAction',
  time: 'day.releasedTime',
  emergency: 'day.releasedEmergency',
  coupon: 'day.releasedCoupon',
} as const;

/** 잠금: 그날 걸린 잠금마다 종류·시각·풀린 방법. 잠금 기록 없이 끼니만 잠김으로 남은 경우도 적는다. */
export function LockSection({ locks, lockedMeals }: { locks: LockRow[]; lockedMeals: MealRow[] }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  return (
    <View>
      <Text style={styles.sectionTitle}>{t('day.locks')}</Text>
      <View style={styles.lockList}>
        {locks.map((l) => {
          const range = [clock(l.startedAt), clock(l.endedAt)].filter(Boolean).join(' – ');
          const how = l.releasedBy ? t(RELEASED[l.releasedBy]) : l.endedAt == null ? t('day.lockOngoing') : undefined;
          return <ListRow key={l.id} label={t(LOCK_TYPE[l.type])} desc={range} value={how} />;
        })}
        {locks.length === 0
          ? lockedMeals.map((m) => <ListRow key={m.index} label={t('day.mealLocked', { n: m.index })} />)
          : null}
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
    sectionTitle: { ...text.heading, fontFamily: fonts.bold, color: c.text },
    time: { ...text.caption, color: c.sub, fontVariant: ['tabular-nums'] },
    spacer: { flex: 1 },
    edit: { ...text.body, color: c.sub },
    pressed: { opacity: 0.6 },
    photo: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.card, marginTop: 12, backgroundColor: c.card },
    extraPhotos: { flexDirection: 'row', gap: 8, marginTop: 8 },
    extraPhoto: { flex: 1, aspectRatio: 1, maxWidth: 120, borderRadius: radius.field, backgroundColor: c.card },
    items: { marginTop: 12, marginBottom: 4 },
    muted: { ...text.body, color: c.sub, paddingVertical: 10 },
    food: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 10 },
    foodName: { flexShrink: 1, gap: 2 },
    name: { ...text.label, color: c.text },
    amount: { ...text.caption, color: c.sub },
    nums: { alignItems: 'flex-end', gap: 2, flexShrink: 0 },
    kcal: { ...text.label, fontFamily: fonts.semibold, color: c.text, fontVariant: ['tabular-nums'] },
    macros: { ...text.caption, color: c.sub, fontVariant: ['tabular-nums'] },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingTop: 14 },
    totalLabel: { ...text.label, fontFamily: fonts.semibold, color: c.text },
    totalKcal: { ...text.heading, fontFamily: fonts.bold, color: c.text, fontVariant: ['tabular-nums'] },
    lockList: { marginTop: 4 },
  });

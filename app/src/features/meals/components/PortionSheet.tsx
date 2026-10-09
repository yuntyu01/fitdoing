import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { formatNumber, roundGram, roundKcal } from '../../../domain/format';
import type { Nutrition } from '../../../domain/stats';
import { BottomSheet } from '../../../ui/BottomSheet';
import { Divider } from '../../../ui/Card';
import { FullButton } from '../../../ui/FullButton';
import { Segmented } from '../../../ui/Segmented';
import { useThemedStyles, type Palette } from '../../../ui/theme';
import { fonts, layout, text } from '../../../ui/tokens';

// 한 줄에 놓을 선택지 수. 음식별 6단계는 좁은 폰(360)에서 "150%"가 잘리지 않게 3개씩 두 줄로 놓는다.
const PER_ROW = 5;

interface Props<T extends number> {
  visible: boolean;
  value: T;
  options: readonly T[];
  /** 고른 비율에서 먹은 영양 (미리 보기 줄) */
  preview: (p: T) => Nutrition;
  /** 음식별일 때 그 음식 ("현미밥 · 기준 200g") */
  food?: { name: string; amount: string };
  /** 끼니 전체일 때 도움말 */
  desc?: string;
  onClose: () => void;
  onApply: (p: T) => void;
}

/**
 * 먹은 양 시트. 끼니 전체(PORTIONS)에도, 음식 하나(ITEM_PORTIONS)에도 쓴다.
 * 시트 안에서 고른 값은 초안이고 "적용하기"를 눌러야 바뀐다. 닫으면 버린다.
 */
export function PortionSheet<T extends number>({ visible, onClose, ...form }: Props<T>) {
  const { t } = useTranslation();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('review.howMuch')}>
      <PortionForm {...form} />
    </BottomSheet>
  );
}

// 시트가 열릴 때마다 새로 만들어져서 초안이 지금 값으로 시작한다 (닫으면 버려진다).
function PortionForm<T extends number>({
  value,
  options,
  preview,
  food,
  desc,
  onApply,
}: Omit<Props<T>, 'visible' | 'onClose'>) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const [draft, setDraft] = useState<T>(value);
  const n = preview(draft);
  const pct = (p: number) => t('review.pct', { pct: Math.round(p * 100) });
  const perRow = options.length > PER_ROW ? Math.ceil(options.length / 2) : options.length;
  const rows: T[][] = [];
  for (let i = 0; i < options.length; i += perRow) rows.push(options.slice(i, i + perRow));

  return (
    <View style={styles.body}>
      <View style={styles.head}>
        {food ? (
          <Text style={styles.subject}>
            <Text style={styles.subjectName}>{food.name}</Text>
            {food.amount ? ` · ${t('review.itemBase', { amount: food.amount })}` : ''}
          </Text>
        ) : null}
        <Text style={styles.big}>{pct(draft)}</Text>
        {desc ? <Text style={styles.desc}>{desc}</Text> : null}
      </View>
      <View style={styles.options}>
        {rows.map((row) => (
          <Segmented
            key={row.join()}
            value={draft}
            onChange={setDraft}
            options={row.map((p) => ({ value: p, label: pct(p) }))}
          />
        ))}
      </View>
      <View style={styles.result}>
        <Divider />
        <Text style={styles.line}>
          {t('review.macroLine', {
            kcal: formatNumber(roundKcal(n.kcal)),
            c: roundGram(n.carbs),
            p: roundGram(n.protein),
            f: roundGram(n.fat),
          })}
        </Text>
      </View>
      <FullButton label={t('review.apply')} onPress={() => onApply(draft)} />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    body: { gap: 24 },
    head: { gap: layout.related },
    subject: { ...text.body, color: c.sub },
    subjectName: { fontFamily: fonts.semibold, color: c.text },
    big: { fontFamily: fonts.bold, fontSize: 40, lineHeight: 48, color: c.text, fontVariant: ['tabular-nums'] },
    desc: { ...text.caption, color: c.sub },
    options: { gap: layout.related },
    result: { gap: layout.inner },
    line: { ...text.body, color: c.sub, fontVariant: ['tabular-nums'] },
  });

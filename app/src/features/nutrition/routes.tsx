import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text } from 'react-native';

import type { Settings } from '../../db/schema';
import { autoBlocks, calculate, toTargets } from '../../domain/nutrition';
import type { Targets } from '../../domain/targets';
import { FullButton } from '../../ui/FullButton';
import { StepHeader, SubHeader } from '../../ui/Headers';
import { Screen } from '../../ui/Screen';
import { useThemedStyles, type Palette } from '../../ui/theme';
import { text } from '../../ui/tokens';
import { bodyOf, calcInputOf, isBodyValid, switchMode, useForm, useNutritionForm } from './form';
import { ActivityStep } from './steps/ActivityStep';
import { BodyGoalStep } from './steps/BodyGoalStep';
import { calcErrorText } from './steps/messages';
import { PlanStep } from './steps/PlanStep';
import { ResultStep } from './steps/ResultStep';

// 설정과 온보딩이 같이 쓰는 영양 목표 4단계 화면(신체·목표 → 일상 활동·운동 → 계산 모드 → 결과 확인·적용).
// flow 마다 머리·다음 경로·적용 방법만 다르다.

export type StepNo = 1 | 2 | 3 | 4;

export interface Flow {
  kind: 'settings' | 'onboarding';
  /** 온보딩이면 전체 단계 중 위치, 설정이면 null */
  step: (i: StepNo) => { step: number; total: number } | null;
  next: { activity: Href; plan: Href; result: Href };
  /** 결과 적용 */
  apply: (targets: Targets) => void;
  /** 지금 적용돼 있는 목표(비교용). 온보딩처럼 아직 없으면 null */
  before: Targets | null;
}

function Header({ flow, i }: { flow: Flow; i: StepNo }) {
  const { t } = useTranslation();
  const s = flow.step(i);
  const back = () => router.back();
  if (s) return <StepHeader step={s.step} total={s.total} onBack={i === 1 && s.step === 1 ? undefined : back} />;
  return <SubHeader title={t('nutrition.title')} onBack={back} />;
}

function ErrorLine({ msg }: { msg: string }) {
  const styles = useThemedStyles(makeStyles);
  return <Text style={styles.err}>{msg}</Text>;
}

/** 1단계 화면을 열 때 지금 설정으로 입력 상태를 새로 만든다(고치다 만 값이 남지 않게). */
export function useStartForm(st: Settings) {
  useState(() => {
    useNutritionForm.getState().start(st);
    return true;
  });
}

/** 2~4단계: 입력 상태가 없으면(앱이 다시 켜졌거나 직접 열린 경우) 뒤로 돌아간다 */
function useHasForm() {
  const has = useNutritionForm((s) => s.form !== null);
  useEffect(() => {
    if (!has && router.canGoBack()) router.back();
  }, [has]);
  return has;
}

export function BodyGoalScreen({
  flow,
  nickname,
}: {
  flow: Flow;
  nickname?: { value: string; onChange: (v: string) => void; title: string };
}) {
  const { t } = useTranslation();
  const f = useForm();
  return (
    <Screen
      header={<Header flow={flow} i={1} />}
      title={t('nutrition.step1')}
      footer={
        <FullButton
          label={t('common.next')}
          disabled={!isBodyValid(f)}
          onPress={() => router.push(flow.next.activity)}
        />
      }
    >
      <BodyGoalStep nickname={nickname} />
    </Screen>
  );
}

export function ActivityScreen({ flow }: { flow: Flow }) {
  const { t } = useTranslation();
  if (!useHasForm()) return null;
  return (
    <Screen
      header={<Header flow={flow} i={2} />}
      title={t('nutrition.step2')}
      footer={<FullButton label={t('common.next')} onPress={() => router.push(flow.next.plan)} />}
    >
      <ActivityStep />
    </Screen>
  );
}

export function PlanScreen({ flow }: { flow: Flow }) {
  if (!useHasForm()) return null;
  return <PlanInner flow={flow} />;
}

function PlanInner({ flow }: { flow: Flow }) {
  const { t } = useTranslation();
  const f = useForm();
  const set = useNutritionForm((s) => s.set);
  const blocked = autoBlocks(bodyOf(f), f.eligibility).length > 0;
  // 일반 자동 계산 대상이 아니면 직접 설정으로 바꿔 둔다. 이유는 화면에 함께 보인다.
  useEffect(() => {
    if (blocked && f.mode !== 'custom') set(switchMode(f, 'custom', 0));
  }, [blocked, f, set]);
  const result = calculate(calcInputOf(f));
  const err = calcErrorText(t, f, result);
  return (
    <Screen
      header={<Header flow={flow} i={3} />}
      title={t('nutrition.step3')}
      footer={
        <>
          {err ? <ErrorLine msg={err} /> : null}
          <FullButton
            label={t('nutrition.seeResult')}
            disabled={!result.ok}
            onPress={() => router.push(flow.next.result)}
          />
        </>
      }
    >
      <PlanStep />
    </Screen>
  );
}

export function ResultScreen({ flow }: { flow: Flow }) {
  if (!useHasForm()) return null;
  return <ResultInner flow={flow} />;
}

function ResultInner({ flow }: { flow: Flow }) {
  const { t } = useTranslation();
  const f = useForm();
  const result = calculate(calcInputOf(f));
  return (
    <Screen
      header={<Header flow={flow} i={4} />}
      title={t('nutrition.step4')}
      desc={t('nutrition.step4Desc')}
      footer={
        <FullButton
          label={flow.kind === 'settings' ? t('nutrition.apply') : t('common.next')}
          disabled={!result.ok}
          onPress={() => {
            if (result.ok) flow.apply(toTargets(result.calc));
          }}
        />
      }
    >
      <ResultStep before={flow.before} />
    </Screen>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({ err: { ...text.caption, color: c.text } });

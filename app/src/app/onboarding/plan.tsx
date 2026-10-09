import { PlanScreen } from '../../features/nutrition/routes';
import { onboardingFlow } from '../../features/onboarding/flow';

export default function OnboardingPlan() {
  return <PlanScreen flow={onboardingFlow} />;
}

import { ActivityScreen } from '../../features/nutrition/routes';
import { onboardingFlow } from '../../features/onboarding/flow';

export default function OnboardingActivity() {
  return <ActivityScreen flow={onboardingFlow} />;
}

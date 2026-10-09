import { ResultScreen } from '../../features/nutrition/routes';
import { onboardingFlow } from '../../features/onboarding/flow';

export default function OnboardingResult() {
  return <ResultScreen flow={onboardingFlow} />;
}

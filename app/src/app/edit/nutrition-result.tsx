import { ResultScreen } from '../../features/nutrition/routes';
import { settingsFlow } from '../../features/nutrition/settingsFlow';

export default function NutritionResult() {
  return <ResultScreen flow={settingsFlow()} />;
}

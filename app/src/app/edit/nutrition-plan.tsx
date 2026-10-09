import { PlanScreen } from '../../features/nutrition/routes';
import { settingsFlow } from '../../features/nutrition/settingsFlow';

export default function NutritionPlan() {
  return <PlanScreen flow={settingsFlow()} />;
}

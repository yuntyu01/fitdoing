import { ActivityScreen } from '../../features/nutrition/routes';
import { settingsFlow } from '../../features/nutrition/settingsFlow';

export default function NutritionActivity() {
  return <ActivityScreen flow={settingsFlow()} />;
}

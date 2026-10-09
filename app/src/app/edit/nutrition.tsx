import { BodyGoalScreen, useStartForm } from '../../features/nutrition/routes';
import { settingsFlow } from '../../features/nutrition/settingsFlow';
import { useSettingsValue } from '../../features/settings/store';

/** 영양 목표 1단계: 신체·목표 */
export default function NutritionBody() {
  useStartForm(useSettingsValue());
  return <BodyGoalScreen flow={settingsFlow()} />;
}

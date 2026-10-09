import { Tabs } from 'expo-router';
import { ChartNoAxesColumn, House, Settings, Users } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { usePalette } from '../../ui/theme';
import { FloatingTabBar } from '../../ui/FloatingTabBar';

export default function TabsLayout() {
  const { t } = useTranslation();
  const c = usePalette();

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.today'),
          tabBarIcon: ({ color, size, focused }) => (
            <House color={color} size={size} strokeWidth={1.8} fill={focused ? color : 'none'} />
          ),
        }}
      />
      <Tabs.Screen
        name="records"
        options={{
          title: t('tabs.records'),
          tabBarIcon: ({ color, size }) => <ChartNoAxesColumn color={color} size={size} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: t('tabs.friends'),
          tabBarIcon: ({ color, size, focused }) => (
            <Users color={color} size={size} strokeWidth={1.8} fill={focused ? color : 'none'} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} strokeWidth={1.8} />,
        }}
      />
    </Tabs>
  );
}

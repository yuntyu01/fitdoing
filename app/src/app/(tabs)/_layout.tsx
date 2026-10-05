import { Tabs } from 'expo-router';
import { House, Settings, SquareMenu } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { colors, fonts, radius } from '../../ui/tokens';

export default function TabsLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.sub,
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 12 },
        // 시안: 선 없이 윗모서리만 둥근 흰 막대
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopWidth: 0,
          borderTopLeftRadius: radius.card,
          borderTopRightRadius: radius.card,
        },
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
          tabBarIcon: ({ color, size }) => (
            <SquareMenu color={color} size={size} strokeWidth={1.8} />
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

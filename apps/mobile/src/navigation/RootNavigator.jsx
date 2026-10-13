import { createNativeStackNavigator } from '@react-navigation/native-stack'
import HealthScreen from '../features/health/screens/HealthScreen.jsx'
import ServicesScreen from '../features/services/screens/ServicesScreen.jsx'

const Stack = createNativeStackNavigator()

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Services" component={ServicesScreen} />
      <Stack.Screen
        name="Health"
        component={HealthScreen}
        options={{
          headerShown: true,
          title: 'Kết nối API',
          headerTintColor: '#8d4939',
          headerStyle: { backgroundColor: '#f7f3ed' },
        }}
      />
    </Stack.Navigator>
  )
}

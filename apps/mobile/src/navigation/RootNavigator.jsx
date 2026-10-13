import HomeScreen from '../features/home/screens/HomeScreen.jsx'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import HealthScreen from '../features/health/screens/HealthScreen.jsx'
import ServicesScreen from '../features/services/screens/ServicesScreen.jsx'
import { colors } from '../theme/tokens.js'

const Stack = createNativeStackNavigator()

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Services" component={ServicesScreen} />
      <Stack.Screen
        name="Health"
        component={HealthScreen}
        options={{
          headerShown: true,
          title: 'Kết nối API',
          headerTintColor: colors.copper,
          headerStyle: { backgroundColor: colors.canvas },
        }}
      />
    </Stack.Navigator>
  )
}

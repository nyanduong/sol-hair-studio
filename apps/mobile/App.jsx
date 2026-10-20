import { NavigationContainer } from '@react-navigation/native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import FeatureUnavailableProvider from './src/components/FeatureUnavailableProvider.jsx'
import { AuthProvider } from './src/features/auth/context/AuthContext.jsx'
import RootNavigator from './src/navigation/RootNavigator.jsx'

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <FeatureUnavailableProvider>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </FeatureUnavailableProvider>
      </AuthProvider>
    </SafeAreaProvider>
  )
}

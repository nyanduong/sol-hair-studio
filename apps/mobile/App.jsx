import { NavigationContainer } from '@react-navigation/native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import FeatureUnavailableProvider from './src/components/FeatureUnavailableProvider.jsx'
import RootNavigator from './src/navigation/RootNavigator.jsx'

export default function App() {
  return (
    <SafeAreaProvider>
      <FeatureUnavailableProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </FeatureUnavailableProvider>
    </SafeAreaProvider>
  )
}

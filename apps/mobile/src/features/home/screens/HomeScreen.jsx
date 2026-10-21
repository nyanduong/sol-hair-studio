import { StatusBar } from 'expo-status-bar'
import { SafeAreaView } from 'react-native-safe-area-context'
import BottomNav from '../../../navigation/BottomNav.jsx'
import ServicesList from '../../services/components/ServicesList.jsx'
import HomeHeader from '../components/HomeHeader.jsx'
import BookingBanner from '../components/BookingBanner.jsx'
import styles from '../../services/styles/ServicesScreen.styles.js'

export default function HomeScreen({ navigation }) {
  return <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
    <ServicesList
      showToolbar={false}
      navigation={navigation}
      header={<HomeHeader navigation={navigation} onServices={() => navigation.navigate('Services')} />}
      footer={<BookingBanner navigation={navigation} />}
    />
    <BottomNav navigation={navigation} active="Home" />
    <StatusBar style="dark" />
  </SafeAreaView>
}

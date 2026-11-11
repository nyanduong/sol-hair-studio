import { StatusBar } from 'expo-status-bar'
import { SafeAreaView } from 'react-native-safe-area-context'
import BottomNav from '../../../navigation/BottomNav.jsx'
import ServicesList from '../../services/components/ServicesList.jsx'
import HomeHeader from '../components/HomeHeader.jsx'
import BookingBanner from '../components/BookingBanner.jsx'
import { useAuth } from '../../auth/hooks/useAuth.js'
import styles from '../../services/styles/ServicesScreen.styles.js'

export default function HomeScreen({ navigation }) {
  const { account } = useAuth()
  const isOwner = Array.isArray(account?.roles) && account.roles.includes('owner')

  return <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
    <ServicesList
      showToolbar={false}
      navigation={navigation}
      header={<HomeHeader navigation={navigation} onServices={() => navigation.navigate('Services')} showBooking={!isOwner} />}
      footer={isOwner ? null : <BookingBanner navigation={navigation} />}
    />
    <BottomNav navigation={navigation} active="Home" />
    <StatusBar style="dark" />
  </SafeAreaView>
}

import { StatusBar } from 'expo-status-bar'
import { Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import BottomNav from '../../../navigation/BottomNav.jsx'
import ServicesList from '../components/ServicesList.jsx'
import styles from '../styles/ServicesScreen.styles.js'

export default function ServicesScreen({ navigation }) {
  return <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
    <ServicesList navigation={navigation} header={<View style={styles.header}>
      <Text style={styles.brand}>DỊCH VỤ TẠI SOL</Text>
      <Text accessibilityRole="header" style={styles.title}>Dành một chút cho chính mình.</Text>
      <Text style={styles.intro}>Bắt đầu từ điều mái tóc bạn đang cần.</Text>
    </View>} />
    <BottomNav navigation={navigation} active="Services" />
    <StatusBar style="dark" />
  </SafeAreaView>
}

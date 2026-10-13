import { StatusBar } from 'expo-status-bar'
import { ScrollView, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { apiBaseUrl } from '../../../config/env.js'
import HealthStatusCard from '../components/HealthStatusCard.jsx'
import { useHealth } from '../hooks/useHealth.js'
import styles from '../styles/HealthScreen.styles.js'

export default function HealthScreen() {
  const { state, retry } = useHealth()

  return (
    <SafeAreaView
      edges={['right', 'bottom', 'left']}
      style={styles.safeArea}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>SOL HAIR STUDIO</Text>
        <Text style={styles.title}>Nền tảng mobile dùng chung</Text>
        <Text style={styles.description}>
          Màn hình này kiểm tra ứng dụng React Native có thể kết nối tới API
          dùng chung. Quay lại để xem danh mục dịch vụ của Sol.
        </Text>
        <HealthStatusCard
          state={state}
          endpoint={`${apiBaseUrl}/api/health`}
          onRetry={retry}
        />
        <Text style={styles.hint}>
          Bản dev tự dùng máy chạy Expo làm host API ở cổng 4000. Hãy chạy
          API và kết nối cùng mạng. Nếu API ở máy hoặc cổng khác, đặt
          EXPO_PUBLIC_API_BASE_URL trong apps/mobile/.env rồi tải lại app.
        </Text>
      </ScrollView>
      <StatusBar style="dark" />
    </SafeAreaView>
  )
}

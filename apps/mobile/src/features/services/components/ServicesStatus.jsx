import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import styles from '../styles/ServicesScreen.styles.js'
import { colors } from '../../../theme/tokens.js'

export default function ServicesStatus({ state, onRetry }) {
  if (state.kind === 'loading') {
    return (
      <View style={styles.status} accessibilityLiveRegion="polite">
        <ActivityIndicator
          color={colors.copper}
          size="large"
          accessibilityLabel="Đang tải dịch vụ"
        />
        <Text style={styles.statusTitle}>Đang tải dịch vụ…</Text>
        <Text style={styles.statusDescription}>Một chút nữa để chọn điều bạn thích.</Text>
      </View>
    )
  }

  const isError = state.kind === 'error'

  return (
    <View style={styles.status} accessibilityLiveRegion="polite">
      <Text accessibilityRole="header" style={styles.statusTitle}>
        {isError ? 'Chưa tải được dịch vụ' : 'Chưa có dịch vụ'}
      </Text>
      <Text style={styles.statusDescription}>
        {isError ? state.message : 'Danh mục đang được cập nhật. Bạn hãy quay lại sau nhé.'}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
      >
        <Text style={styles.retryButtonText}>{isError ? 'Thử lại' : 'Tải lại danh mục'}</Text>
      </Pressable>
    </View>
  )
}

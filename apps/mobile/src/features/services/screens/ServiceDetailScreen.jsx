import { useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Feather from '@expo/vector-icons/Feather'
import { colors } from '../../../theme/tokens.js'
import { useAuth } from '../../auth/hooks/useAuth.js'
import { useServices } from '../hooks/useServices.js'
import { formatDuration, formatPrice } from '../service-presentation.js'
import styles from '../styles/ServiceDetailScreen.styles.js'

export default function ServiceDetailScreen({ route, navigation }) {
  const { serviceId, service: initialService } = route?.params || {}
  const { state } = useServices()
  const { isAuthenticated } = useAuth()
  const [failedImageUrl, setFailedImageUrl] = useState(null)

  // Use passed service object or look it up from cached state
  const service =
    initialService ||
    (state.kind === 'success' && Array.isArray(state.data)
      ? state.data.find((s) => s.id === serviceId)
      : null)

  function handleBooking() {
    if (!isAuthenticated) {
      navigation.navigate('Login', {
        notice: 'Vui lòng đăng nhập tài khoản trước khi đặt lịch hẹn.',
        returnTo: 'Booking',
      })
      return
    }

    navigation.navigate('Booking', {
      selectedServiceId: service?.id,
    })
  }

  if (!service && state.kind === 'loading') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.copper} />
          <Text style={{ marginTop: 12, color: colors.muted, fontSize: 14 }}>
            Đang tải thông tin dịch vụ…
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  if (!service) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Feather name="arrow-left" size={20} color={colors.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Dịch vụ</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Feather name="alert-circle" size={48} color={colors.copper} />
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink, marginTop: 14 }}>
            Không tìm thấy dịch vụ
          </Text>
          <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 6 }}>
            Dịch vụ này có thể đã tạm dừng hoặc không còn hoạt động.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.goBack()}
            style={[styles.bookButton, { marginTop: 20 }]}
          >
            <Text style={styles.bookButtonText}>Quay lại danh mục</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Top Navigation Bar */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Feather name="arrow-left" size={20} color={colors.ink} />
        </Pressable>
        <Text style={styles.brandTag}>SOL HAIR STUDIO</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chia sẻ"
          onPress={() => {}}
          style={styles.backButton}
        >
          <Feather name="share-2" size={18} color={colors.ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Banner Image */}
        <View style={styles.imageContainer}>
          {failedImageUrl === service.imageUrl ? (
            <View style={styles.imageFallback}>
              <Feather name="image" size={36} color={colors.muted} />
              <Text style={styles.imageFallbackText}>Chưa tải được ảnh dịch vụ</Text>
            </View>
          ) : (
            <Image
              source={{ uri: service.imageUrl }}
              accessibilityLabel={`Ảnh dịch vụ ${service.name}`}
              resizeMode="cover"
              style={styles.heroImage}
              onError={() => setFailedImageUrl(service.imageUrl)}
            />
          )}
        </View>

        {/* Content Body */}
        <View style={styles.body}>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>{service.category || 'Dịch vụ Salon'}</Text>
          </View>

          <Text accessibilityRole="header" style={styles.serviceName}>
            {service.name}
          </Text>

          {/* Pricing & Duration */}
          <View style={styles.metaRow}>
            <Text style={styles.priceTag}>{formatPrice(service.priceVnd)}</Text>
            <View style={styles.durationRow}>
              <Feather name="clock" size={15} color={colors.muted} />
              <Text style={styles.durationText}>{formatDuration(service.durationMinutes)}</Text>
            </View>
          </View>

          {/* Detailed Description */}
          <Text style={styles.sectionTitle}>Mô tả dịch vụ</Text>
          <Text style={styles.descriptionText}>
            {service.description ||
              'Dịch vụ chăm sóc tóc chuyên sâu tại Sol Hair Studio, kết hợp kỹ thuật cắt tạo kiểu hiện đại và mỹ phẩm cao cấp giúp tôn vinh phong cách riêng của bạn.'}
          </Text>

          {/* Quy trình thực hiện */}
          <Text style={styles.sectionTitle}>Quy trình thực hiện tại Sol</Text>
          <View style={styles.stepsCard}>
            <View style={styles.stepItem}>
              <Text style={styles.stepNumber}>1</Text>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Tư vấn & Phân tích chất tóc</Text>
                <Text style={styles.stepDesc}>
                  Chuyên viên trao đổi phong cách, tư vấn phom dáng phù hợp góc cạnh gương mặt.
                </Text>
              </View>
            </View>

            <View style={styles.stepItem}>
              <Text style={styles.stepNumber}>2</Text>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Gội xả thư giãn thảo dược</Text>
                <Text style={styles.stepDesc}>
                  Làm sạch sâu da đầu kết hợp massage thư giãn cổ vai gáy.
                </Text>
              </View>
            </View>

            <View style={styles.stepItem}>
              <Text style={styles.stepNumber}>3</Text>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Cắt & Tạo kiểu chuyên sâu</Text>
                <Text style={styles.stepDesc}>
                  Thực hiện kỹ thuật theo đúng phom dáng đã thống nhất, chỉnh chu từng chi tiết.
                </Text>
              </View>
            </View>

            <View style={[styles.stepItem, { marginBottom: 0 }]}>
              <Text style={styles.stepNumber}>4</Text>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Sấy dưỡng & Hoàn thiện kiểu</Text>
                <Text style={styles.stepDesc}>
                  Dưỡng tinh dầu phục hồi, sấy tạo nếp và hướng dẫn tự chăm sóc tại nhà.
                </Text>
              </View>
            </View>
          </View>

          {/* Cam kết Sol Atelier */}
          <Text style={styles.sectionTitle}>Cam kết chất lượng Sol Atelier</Text>
          <View style={styles.policyCard}>
            <View style={styles.policyItem}>
              <Feather name="check-circle" size={16} color={colors.copper} />
              <Text style={styles.policyText}>Sử dụng mỹ phẩm và dưỡng chất chính hãng 100%</Text>
            </View>
            <View style={styles.policyItem}>
              <Feather name="shield" size={16} color={colors.copper} />
              <Text style={styles.policyText}>Bảo hành phom tóc và hỗ trợ chỉnh sửa trong 3 ngày</Text>
            </View>
            <View style={[styles.policyItem, { marginBottom: 0 }]}>
              <Feather name="heart" size={16} color={colors.copper} />
              <Text style={styles.policyText}>Tư vấn miễn phí và lắng nghe nhu cầu của khách hàng</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Fixed Bottom Action Bar */}
      <View style={styles.bottomBar}>
        <View>
          <Text style={styles.barPriceLabel}>Giá dịch vụ</Text>
          <Text style={styles.barPriceValue}>{formatPrice(service.priceVnd)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Đặt lịch dịch vụ ${service.name}`}
          onPress={handleBooking}
          style={({ pressed }) => [styles.bookButton, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.bookButtonText}>Đặt lịch dịch vụ này →</Text>
        </Pressable>
      </View>

      <StatusBar style="dark" />
    </SafeAreaView>
  )
}


import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import BottomNav from '../../../navigation/BottomNav.jsx'
import { colors } from '../../../theme/tokens.js'
import { getAuthErrorMessage } from '../api/auth.api.js'
import { useAuth } from '../hooks/useAuth.js'
import { authStyles } from '../styles/auth.styles.js'
import { validateCustomerProfileForm } from '../validation/auth.validation.js'

function getRoleLabel(roles = []) {
  if (roles.includes('owner')) return 'Chủ tiệm'
  if (roles.includes('stylist')) return 'Stylist'
  return 'Khách hàng'
}

export default function ProfileScreen({ navigation }) {
  const {
    account,
    customer,
    isAuthenticated,
    isProfileComplete,
    logout,
    refreshProfile,
    updateCustomerProfile,
  } = useAuth()

  const [displayName, setDisplayName] = useState(customer?.displayName || '')
  const [phone, setPhone] = useState(customer?.phone || '')
  const [fieldErrors, setFieldErrors] = useState({})
  const [apiError, setApiError] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const [prevCustomer, setPrevCustomer] = useState(customer)
  if (customer !== prevCustomer) {
    setPrevCustomer(customer)
    setDisplayName(customer?.displayName || '')
    setPhone(customer?.phone || '')
  }

  // Redirect to Login if unauthenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigation.navigate('Login', {
        notice: 'Vui lòng đăng nhập để xem thông tin tài khoản.',
      })
    }
  }, [isAuthenticated, navigation])

  async function handleSaveProfile() {
    setApiError(null)
    setSuccessMessage(null)

    const validation = validateCustomerProfileForm({
      displayName,
      phone,
      isPhoneRequired: false,
    })

    if (!validation.isValid) {
      setFieldErrors(validation.errors)
      return
    }

    setFieldErrors({})
    setIsSubmitting(true)

    try {
      await updateCustomerProfile({
        displayName: validation.values.displayName,
        phone: validation.values.phone,
      })
      setSuccessMessage('Hồ sơ khách hàng đã được cập nhật thành công!')
    } catch (err) {
      setApiError(getAuthErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleRefresh() {
    setIsRefreshing(true)
    setApiError(null)
    try {
      await refreshProfile()
    } catch (err) {
      setApiError(getAuthErrorMessage(err))
    } finally {
      setIsRefreshing(false)
    }
  }

  async function handleLogout() {
    await logout()
    navigation.reset({
      index: 0,
      routes: [{ name: 'Home' }],
    })
  }

  if (!isAuthenticated || !account) {
    return (
      <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={authStyles.safeArea}>
        <View style={[authStyles.scrollContent, { justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="large" color={colors.copper} />
          <Text style={[authStyles.subtitle, { marginTop: 12 }]}>Đang kiểm tra phiên...</Text>
        </View>
        <BottomNav navigation={navigation} active="Tài khoản" />
      </SafeAreaView>
    )
  }

  const roleLabel = getRoleLabel(account.roles)
  const avatarLetter = account.email?.charAt(0).toUpperCase() || 'S'
  const isOwner = Array.isArray(account.roles) && account.roles.includes('owner')

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={authStyles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={authStyles.keyboardAvoid}
      >
        <ScrollView
          contentContainerStyle={authStyles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header row */}
          <View style={authStyles.headerRow}>
            <Text style={authStyles.brandPill}>Tài khoản Sol</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Làm mới thông tin"
              onPress={handleRefresh}
              disabled={isRefreshing}
              style={authStyles.backButton}
            >
              <Feather
                name="refresh-cw"
                size={20}
                color={isRefreshing ? colors.copper : colors.ink}
              />
            </Pressable>
          </View>

          {/* User badge */}
          <View style={authStyles.card}>
            <View style={authStyles.profileAvatarRow}>
              <View style={authStyles.avatarCircle}>
                <Text style={authStyles.avatarLetter}>{avatarLetter}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={authStyles.profileEmail} numberOfLines={1}>
                  {account.email}
                </Text>
                <View style={authStyles.roleBadge}>
                  <Text style={authStyles.roleBadgeText}>{roleLabel}</Text>
                </View>
              </View>
            </View>

            {/* Booking Readiness Notice */}
            {isProfileComplete ? (
              <View style={authStyles.successBox}>
                <Text style={authStyles.successText}>
                  ✓ Hồ sơ đã sẵn sàng. Bạn có thể đặt lịch hẹn ngay bây giờ!
                </Text>
              </View>
            ) : (
              <View style={authStyles.noticeBox}>
                <Text style={authStyles.noticeText}>
                  ⓘ Lưu ý: Vui lòng bổ sung đầy đủ Họ tên và Số điện thoại bên dưới trước khi đặt lịch hẹn.
                </Text>
              </View>
            )}
          </View>

          {/* Owner Dashboard Shortcut - ONLY visible to Owner role */}
          {isOwner ? (
            <View style={authStyles.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 }}>
                <Feather name="bar-chart-2" size={20} color={colors.copper} />
                <Text style={[authStyles.title, { fontSize: 18, marginBottom: 0 }]}>
                  Khu vực Quản trị Salon
                </Text>
              </View>
              <Text style={[authStyles.subtitle, { marginBottom: 16 }]}>
                Dành riêng cho Chủ tiệm: Theo dõi doanh thu hôm nay, hàng đợi lịch hẹn và điều phối dịch vụ.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Mở Dashboard Quản lý Salon"
                onPress={() => navigation.navigate('OwnerDashboard')}
                style={({ pressed }) => [
                  authStyles.primaryButton,
                  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
                  pressed && { opacity: 0.9 },
                ]}
              >
                <Feather name="layout" size={18} color={colors.surface} />
                <Text style={authStyles.primaryButtonText}>Mở Dashboard Salon →</Text>
              </Pressable>
            </View>
          ) : null}

          {successMessage ? (
            <View style={authStyles.successBox}>
              <Text style={authStyles.successText}>{successMessage}</Text>
            </View>
          ) : null}

          {apiError ? (
            <View style={authStyles.errorBox}>
              <Text style={authStyles.errorText}>{apiError}</Text>
            </View>
          ) : null}

          {/* Customer Profile Edit Card */}
          <View style={authStyles.card}>
            <Text style={[authStyles.title, { fontSize: 20, marginBottom: 16 }]}>
              Hồ sơ khách hàng
            </Text>

            {/* Display Name */}
            <View style={authStyles.inputGroup}>
              <Text style={authStyles.label}>Họ và tên</Text>
              <View
                style={[
                  authStyles.inputWrapper,
                  fieldErrors.displayName && authStyles.inputWrapperError,
                ]}
              >
                <TextInput
                  value={displayName}
                  onChangeText={(val) => {
                    setDisplayName(val)
                    if (fieldErrors.displayName) {
                      setFieldErrors((prev) => ({ ...prev, displayName: null }))
                    }
                  }}
                  placeholder="Ví dụ: Nguyễn Văn A"
                  placeholderTextColor={colors.muted}
                  editable={!isSubmitting}
                  style={authStyles.input}
                />
              </View>
              {fieldErrors.displayName && (
                <Text style={authStyles.fieldError}>{fieldErrors.displayName}</Text>
              )}
            </View>

            {/* Phone */}
            <View style={authStyles.inputGroup}>
              <Text style={authStyles.label}>Số điện thoại</Text>
              <View
                style={[
                  authStyles.inputWrapper,
                  fieldErrors.phone && authStyles.inputWrapperError,
                ]}
              >
                <TextInput
                  value={phone}
                  onChangeText={(val) => {
                    setPhone(val)
                    if (fieldErrors.phone) {
                      setFieldErrors((prev) => ({ ...prev, phone: null }))
                    }
                  }}
                  placeholder="+84901234567 hoặc 0901234567"
                  placeholderTextColor={colors.muted}
                  keyboardType="phone-pad"
                  editable={!isSubmitting}
                  style={authStyles.input}
                />
              </View>
              {fieldErrors.phone && (
                <Text style={authStyles.fieldError}>{fieldErrors.phone}</Text>
              )}
            </View>

            {/* Save Button */}
            <Pressable
              accessibilityRole="button"
              onPress={handleSaveProfile}
              disabled={isSubmitting}
              style={[
                authStyles.primaryButton,
                isSubmitting && authStyles.primaryButtonDisabled,
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <Text style={authStyles.primaryButtonText}>Lưu hồ sơ</Text>
              )}
            </Pressable>
          </View>

          {/* Logout */}
          <Pressable
            accessibilityRole="button"
            onPress={handleLogout}
            style={authStyles.logoutButton}
          >
            <Text style={authStyles.logoutButtonText}>Đăng xuất khỏi thiết bị</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
      <BottomNav navigation={navigation} active="Tài khoản" />
    </SafeAreaView>
  )
}

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
import { useOwnerStaff } from '../../staff/hooks/useOwnerStaff.js'
import {
  DISPLAY_NAME_MAX_LENGTH,
  PHONE_LENGTH,
  formatPhoneForInput,
  validateCustomerProfileForm,
} from '../validation/auth.validation.js'

function getRoleLabel(roles = []) {
  if (roles.includes('owner')) return 'Chủ tiệm'
  if (roles.includes('stylist')) return 'Stylist'
  return 'Khách hàng'
}

export default function ProfileScreen({ navigation }) {
  const {
    account,
    customer,
    token,
    isAuthenticated,
    isCustomer,
    isProfileComplete,
    logout,
    refreshProfile,
    updateCustomerProfile,
  } = useAuth()
  const isOwner = Boolean(account?.roles?.includes('owner'))
  const { state: ownerStaffState, retry: retryOwnerStaff } = useOwnerStaff(token, isOwner)

  const [displayName, setDisplayName] = useState(customer?.displayName || '')
  const [phone, setPhone] = useState(formatPhoneForInput(customer?.phone))
  const [fieldErrors, setFieldErrors] = useState({})
  const [apiError, setApiError] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const [prevCustomer, setPrevCustomer] = useState(customer)
  if (
    customer !== prevCustomer &&
    (customer?.displayName !== prevCustomer?.displayName ||
      customer?.phone !== prevCustomer?.phone)
  ) {
    setPrevCustomer(customer)
    setDisplayName(customer?.displayName || '')
    setPhone(formatPhoneForInput(customer?.phone))
  }

  // Redirect to Login if unauthenticated, or sync latest customer profile on mount
  useEffect(() => {
    if (!isAuthenticated) {
      navigation.navigate('Login', {
        notice: 'Vui lòng đăng nhập để xem thông tin tài khoản.',
      })
      return
    }
    void refreshProfile().catch(() => {})
  }, [isAuthenticated, navigation, refreshProfile])

  async function handleSaveProfile() {
    setApiError(null)
    setSuccessMessage(null)

    const validation = validateCustomerProfileForm({
      displayName,
      phone,
      isPhoneRequired: true,
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
      await Promise.all([
        refreshProfile(),
        isOwner ? retryOwnerStaff() : Promise.resolve(),
      ])
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
            <Text style={authStyles.brandPill}>{isOwner ? 'Tài khoản quản trị' : 'Tài khoản Sol'}</Text>
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
                {isOwner ? <Text style={authStyles.adminAccountTitle}>Tài khoản admin</Text> : null}
                <Text style={authStyles.profileEmail} numberOfLines={1}>
                  {account.email}
                </Text>
                <View style={authStyles.roleBadge}>
                  <Text style={authStyles.roleBadgeText}>{roleLabel}</Text>
                </View>
              </View>
            </View>

            {/* Booking Readiness Notice */}
            {isCustomer && isProfileComplete ? (
              <View style={authStyles.successBox}>
                <Text style={authStyles.successText}>
                  ✓ Hồ sơ đã sẵn sàng. Bạn có thể đặt lịch hẹn ngay bây giờ!
                </Text>
              </View>
            ) : isCustomer ? (
              <View style={authStyles.noticeBox}>
                <Text style={authStyles.noticeText}>
                  ⓘ Lưu ý: Vui lòng bổ sung đầy đủ Họ tên và Số điện thoại bên dưới trước khi đặt lịch hẹn.
                </Text>
              </View>
            ) : null}
          </View>

          {isOwner ? <OwnerStaffCard state={ownerStaffState} retry={retryOwnerStaff} /> : null}

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
          {isCustomer ? (
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
                    maxLength={DISPLAY_NAME_MAX_LENGTH}
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
                    placeholder="Ví dụ: 0901234567"
                    placeholderTextColor={colors.muted}
                    keyboardType="phone-pad"
                    maxLength={PHONE_LENGTH}
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
          ) : !isOwner ? (
            <View style={authStyles.card}>
              <Text style={[authStyles.title, { fontSize: 20, marginBottom: 8 }]}>
                Hồ sơ nhân viên
              </Text>
              <Text style={authStyles.subtitle}>
                Thông tin hồ sơ stylist và dịch vụ phụ trách được Chủ tiệm quản lý.
              </Text>
            </View>
          ) : null}

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

function OwnerStaffCard({ state, retry }) {
  return (
    <View style={authStyles.card}>
      <Text style={[authStyles.title, { fontSize: 20, marginBottom: 4 }]}>Nhân viên hiện tại</Text>
      <Text style={[authStyles.subtitle, { marginTop: 0, marginBottom: 14 }]}>Danh sách được đồng bộ từ hệ thống quản lý nhân sự.</Text>

      {state.kind === 'loading' ? <ActivityIndicator color={colors.copper} /> : null}
      {state.kind === 'error' ? (
        <>
          <Text style={authStyles.fieldError}>{state.message}</Text>
          <Pressable accessibilityRole="button" onPress={retry} style={authStyles.secondaryButton}>
            <Text style={authStyles.secondaryButtonText}>Thử lại</Text>
          </Pressable>
        </>
      ) : null}
      {state.kind === 'success' && state.data.length === 0 ? <Text style={authStyles.subtitle}>Chưa có hồ sơ nhân viên nào.</Text> : null}
      {state.kind === 'success' ? state.data.map((staff) => (
        <View key={staff.staffId} style={authStyles.staffRow}>
          <Text style={authStyles.staffName}>{staff.displayName}</Text>
          <View style={[authStyles.staffStatus, staff.isActive ? authStyles.staffStatusActive : authStyles.staffStatusInactive]}>
            <Text style={authStyles.staffStatusText}>{staff.isActive ? 'Hoạt động' : 'Ngừng hoạt động'}</Text>
          </View>
        </View>
      )) : null}
    </View>
  )
}

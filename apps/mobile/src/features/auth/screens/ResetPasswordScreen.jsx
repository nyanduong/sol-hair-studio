import { useState } from 'react'
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
import { colors } from '../../../theme/tokens.js'
import { getAuthErrorMessage } from '../api/auth.api.js'
import { useAuth } from '../hooks/useAuth.js'
import { authStyles } from '../styles/auth.styles.js'
import { validateCompletePasswordForm } from '../validation/auth.validation.js'

export default function ResetPasswordScreen({ navigation, route }) {
  const { completePasswordForPurpose } = useAuth()
  const email = route?.params?.email || ''
  const purpose = route?.params?.purpose || 'reset_password'
  const grant = route?.params?.grant || ''
  const isStaff = route?.params?.isStaff || purpose === 'activate_staff'

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [apiError, setApiError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleComplete() {
    setApiError(null)
    const validation = validateCompletePasswordForm({ password, confirmPassword })
    if (!validation.isValid) {
      setFieldErrors(validation.errors)
      return
    }

    if (!grant) {
      setApiError('Mã proof xác thực đã mất. Vui lòng yêu cầu lại OTP.')
      return
    }

    setFieldErrors({})
    setIsSubmitting(true)

    try {
      await completePasswordForPurpose({
        email,
        purpose,
        grant,
        password: validation.values.password,
      })

      // Navigate to Login with success message
      navigation.reset({
        index: 0,
        routes: [
          {
            name: 'Login',
            params: {
              email,
              notice: isStaff
                ? 'Thiết lập mật khẩu nhân viên thành công! Vui lòng đăng nhập.'
                : 'Đặt lại mật khẩu thành công! Vui lòng đăng nhập bằng mật khẩu mới.',
            },
          },
        ],
      })
    } catch (err) {
      setApiError(getAuthErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Quay lại"
              onPress={() => navigation.goBack()}
              style={authStyles.backButton}
            >
              <Feather name="arrow-left" size={24} color={colors.ink} />
            </Pressable>
            <Text style={authStyles.brandPill}>
              {isStaff ? 'Nhân viên Stylist' : 'Mật khẩu mới'}
            </Text>
            <View style={{ width: 44 }} />
          </View>

          {/* Title */}
          <View style={authStyles.titleContainer}>
            <Text accessibilityRole="header" style={authStyles.title}>
              {isStaff ? 'Thiết lập mật khẩu' : 'Đặt mật khẩu mới'}
            </Text>
            <Text style={authStyles.subtitle}>
              {isStaff
                ? `Tạo mật khẩu đăng nhập cho tài khoản nhân viên ${email}.`
                : `Nhập mật khẩu mới cho tài khoản ${email}.`}
            </Text>
          </View>

          {apiError ? (
            <View style={authStyles.errorBox}>
              <Text style={authStyles.errorText}>{apiError}</Text>
            </View>
          ) : null}

          {/* Form Card */}
          <View style={authStyles.card}>
            {/* New Password */}
            <View style={authStyles.inputGroup}>
              <Text style={authStyles.label}>Mật khẩu mới (ít nhất 8 ký tự)</Text>
              <View
                style={[
                  authStyles.inputWrapper,
                  fieldErrors.password && authStyles.inputWrapperError,
                ]}
              >
                <TextInput
                  value={password}
                  onChangeText={(val) => {
                    setPassword(val)
                    if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: null }))
                  }}
                  placeholder="••••••••"
                  placeholderTextColor={colors.muted}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  editable={!isSubmitting}
                  style={authStyles.input}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  onPress={() => setShowPassword((prev) => !prev)}
                  style={authStyles.eyeButton}
                >
                  <Feather
                    name={showPassword ? 'eye-off' : 'eye'}
                    size={20}
                    color={colors.muted}
                  />
                </Pressable>
              </View>
              {fieldErrors.password && (
                <Text style={authStyles.fieldError}>{fieldErrors.password}</Text>
              )}
            </View>

            {/* Confirm New Password */}
            <View style={authStyles.inputGroup}>
              <Text style={authStyles.label}>Xác nhận mật khẩu mới</Text>
              <View
                style={[
                  authStyles.inputWrapper,
                  fieldErrors.confirmPassword && authStyles.inputWrapperError,
                ]}
              >
                <TextInput
                  value={confirmPassword}
                  onChangeText={(val) => {
                    setConfirmPassword(val)
                    if (fieldErrors.confirmPassword) {
                      setFieldErrors((prev) => ({ ...prev, confirmPassword: null }))
                    }
                  }}
                  placeholder="••••••••"
                  placeholderTextColor={colors.muted}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  editable={!isSubmitting}
                  style={authStyles.input}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showConfirmPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  onPress={() => setShowConfirmPassword((prev) => !prev)}
                  style={authStyles.eyeButton}
                >
                  <Feather
                    name={showConfirmPassword ? 'eye-off' : 'eye'}
                    size={20}
                    color={colors.muted}
                  />
                </Pressable>
              </View>
              {fieldErrors.confirmPassword && (
                <Text style={authStyles.fieldError}>{fieldErrors.confirmPassword}</Text>
              )}
            </View>

            {/* Submit */}
            <Pressable
              accessibilityRole="button"
              onPress={handleComplete}
              disabled={isSubmitting}
              style={[
                authStyles.primaryButton,
                isSubmitting && authStyles.primaryButtonDisabled,
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <Text style={authStyles.primaryButtonText}>Hoàn tất thiết lập</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

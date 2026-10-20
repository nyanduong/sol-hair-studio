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
import { validateLoginForm } from '../validation/auth.validation.js'

export default function LoginScreen({ navigation, route }) {
  const { login } = useAuth()
  const initialEmail = route?.params?.email || ''
  const noticeMsg = route?.params?.notice || ''

  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [apiError, setApiError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleLogin() {
    setApiError(null)
    const validation = validateLoginForm({ email, password })
    if (!validation.isValid) {
      setFieldErrors(validation.errors)
      return
    }

    setFieldErrors({})
    setIsSubmitting(true)
    try {
      await login({
        email: validation.values.email,
        password: validation.values.password,
      })
      // Successful login
      if (route?.params?.returnTo) {
        navigation.navigate(route.params.returnTo)
      } else {
        navigation.navigate('Profile')
      }
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
            <Text style={authStyles.brandPill}>Sol Hair Studio</Text>
            <View style={{ width: 44 }} />
          </View>

          {/* Title */}
          <View style={authStyles.titleContainer}>
            <Text accessibilityRole="header" style={authStyles.title}>Đăng nhập</Text>
            <Text style={authStyles.subtitle}>
              Chào mừng bạn quay lại! Đăng nhập để trải nghiệm dịch vụ và đặt lịch hẹn.
            </Text>
          </View>

          {noticeMsg ? (
            <View style={authStyles.noticeBox}>
              <Text style={authStyles.noticeText}>{noticeMsg}</Text>
            </View>
          ) : null}

          {apiError ? (
            <View style={authStyles.errorBox}>
              <Text style={authStyles.errorText}>{apiError}</Text>
            </View>
          ) : null}

          {/* Form Card */}
          <View style={authStyles.card}>
            {/* Email field */}
            <View style={authStyles.inputGroup}>
              <Text style={authStyles.label}>Địa chỉ Email</Text>
              <View
                style={[
                  authStyles.inputWrapper,
                  fieldErrors.email && authStyles.inputWrapperError,
                ]}
              >
                <TextInput
                  value={email}
                  onChangeText={(val) => {
                    setEmail(val)
                    if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: null }))
                  }}
                  placeholder="example@gmail.com"
                  placeholderTextColor={colors.muted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isSubmitting}
                  style={authStyles.input}
                />
              </View>
              {fieldErrors.email && (
                <Text style={authStyles.fieldError}>{fieldErrors.email}</Text>
              )}
            </View>

            {/* Password field */}
            <View style={authStyles.inputGroup}>
              <Text style={authStyles.label}>Mật khẩu</Text>
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

            {/* Forgot password link */}
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.navigate('ForgotPassword', { email })}
              style={authStyles.forgotLinkContainer}
            >
              <Text style={authStyles.forgotLink}>Quên mật khẩu?</Text>
            </Pressable>

            {/* Submit button */}
            <Pressable
              accessibilityRole="button"
              onPress={handleLogin}
              disabled={isSubmitting}
              style={[
                authStyles.primaryButton,
                isSubmitting && authStyles.primaryButtonDisabled,
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <Text style={authStyles.primaryButtonText}>Đăng nhập</Text>
              )}
            </Pressable>
          </View>

          {/* Switch to Register */}
          <View style={authStyles.switchRow}>
            <Text style={authStyles.switchLabel}>Chưa có tài khoản?</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.navigate('Register')}
            >
              <Text style={authStyles.switchLink}>Đăng ký ngay</Text>
            </Pressable>
          </View>

          {/* Staff first-time activation */}
          <View style={[authStyles.switchRow, { marginTop: 12 }]}>
            <Text style={authStyles.switchLabel}>Bạn là Stylist mới?</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.navigate('OtpVerification', {
                purpose: 'activate_staff',
                title: 'Kích hoạt nhân viên',
                subtitle: 'Nhập mã OTP được gửi qua email nhân viên để thiết lập mật khẩu.',
              })}
            >
              <Text style={authStyles.switchLink}>Kích hoạt tại đây</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

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
import { validateRegisterForm } from '../validation/auth.validation.js'

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [apiError, setApiError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleRegister() {
    setApiError(null)
    const validation = validateRegisterForm({ email, password, confirmPassword })
    if (!validation.isValid) {
      setFieldErrors(validation.errors)
      return
    }

    setFieldErrors({})
    setIsSubmitting(true)
    try {
      await register({
        email: validation.values.email,
        password: validation.values.password,
      })

      // Navigate to OTP verification screen with saved credentials
      navigation.navigate('OtpVerification', {
        email: validation.values.email,
        savedPassword: validation.values.password,
        purpose: 'activate_customer',
        title: 'Xác thực tài khoản',
        subtitle: `Mã OTP gồm 6 chữ số đã được gửi tới ${validation.values.email}. Vui lòng nhập mã để kích hoạt tài khoản.`,
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
            <Text style={authStyles.brandPill}>Sol Hair Studio</Text>
            <View style={{ width: 44 }} />
          </View>

          {/* Title */}
          <View style={authStyles.titleContainer}>
            <Text accessibilityRole="header" style={authStyles.title}>Đăng ký tài khoản</Text>
            <Text style={authStyles.subtitle}>
              Tạo tài khoản để dễ dàng đặt lịch và theo dõi lịch hẹn chăm sóc tóc tại Sol.
            </Text>
          </View>

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
              <Text style={authStyles.label}>Mật khẩu (ít nhất 8 ký tự)</Text>
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

            {/* Confirm Password field */}
            <View style={authStyles.inputGroup}>
              <Text style={authStyles.label}>Xác nhận mật khẩu</Text>
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

            {/* Submit button */}
            <Pressable
              accessibilityRole="button"
              onPress={handleRegister}
              disabled={isSubmitting}
              style={[
                authStyles.primaryButton,
                isSubmitting && authStyles.primaryButtonDisabled,
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <Text style={authStyles.primaryButtonText}>Đăng ký tài khoản</Text>
              )}
            </Pressable>
          </View>

          {/* Switch to Login */}
          <View style={authStyles.switchRow}>
            <Text style={authStyles.switchLabel}>Đã có tài khoản?</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.navigate('Login')}
            >
              <Text style={authStyles.switchLink}>Đăng nhập</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

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
import { validateEmail } from '../validation/auth.validation.js'

export default function ForgotPasswordScreen({ navigation, route }) {
  const { requestOtpForPurpose } = useAuth()
  const initialEmail = route?.params?.email || ''

  const [email, setEmail] = useState(initialEmail)
  const [fieldErrors, setFieldErrors] = useState({})
  const [apiError, setApiError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleRequest() {
    setApiError(null)
    const emailRes = validateEmail(email)
    if (!emailRes.isValid) {
      setFieldErrors({ email: emailRes.message })
      return
    }

    setFieldErrors({})
    setIsSubmitting(true)

    try {
      await requestOtpForPurpose({ email: emailRes.value, purpose: 'reset_password' })
      navigation.navigate('OtpVerification', {
        email: emailRes.value,
        purpose: 'reset_password',
        title: 'Đặt lại mật khẩu',
        subtitle: `Nếu email ${emailRes.value} tồn tại trong hệ thống, mã OTP đã được gửi tới hộp thư của bạn.`,
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
            <Text style={authStyles.brandPill}>Quên mật khẩu</Text>
            <View style={{ width: 44 }} />
          </View>

          {/* Title */}
          <View style={authStyles.titleContainer}>
            <Text accessibilityRole="header" style={authStyles.title}>Khôi phục mật khẩu</Text>
            <Text style={authStyles.subtitle}>
              Nhập email tài khoản của bạn để nhận mã xác thực OTP 6 chữ số khôi phục mật khẩu.
            </Text>
          </View>

          {apiError ? (
            <View style={authStyles.errorBox}>
              <Text style={authStyles.errorText}>{apiError}</Text>
            </View>
          ) : null}

          {/* Form Card */}
          <View style={authStyles.card}>
            <View style={authStyles.inputGroup}>
              <Text style={authStyles.label}>Địa chỉ Email tài khoản</Text>
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
                  editable={!isSubmitting}
                  style={authStyles.input}
                />
              </View>
              {fieldErrors.email && (
                <Text style={authStyles.fieldError}>{fieldErrors.email}</Text>
              )}
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={handleRequest}
              disabled={isSubmitting}
              style={[
                authStyles.primaryButton,
                isSubmitting && authStyles.primaryButtonDisabled,
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <Text style={authStyles.primaryButtonText}>Gửi mã xác thực</Text>
              )}
            </Pressable>
          </View>

          <View style={authStyles.switchRow}>
            <Text style={authStyles.switchLabel}>Nhớ lại mật khẩu?</Text>
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

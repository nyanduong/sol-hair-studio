import { useEffect, useRef, useState } from 'react'
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
import { validateEmail, validateOtpCode } from '../validation/auth.validation.js'

export default function OtpVerificationScreen({ navigation, route }) {
  const {
    activate,
    resendActivation,
    requestOtpForPurpose,
    verifyOtpForPurpose,
  } = useAuth()

  const initialEmail = route?.params?.email || ''
  const savedPassword = route?.params?.savedPassword || ''
  const purpose = route?.params?.purpose || 'activate_customer'
  const screenTitle = route?.params?.title || (
    purpose === 'activate_staff'
      ? 'Kích hoạt nhân viên'
      : purpose === 'reset_password'
        ? 'Xác nhận mã đặt lại mật khẩu'
        : 'Kích hoạt tài khoản'
  )
  const screenSubtitle = route?.params?.subtitle || (
    initialEmail
      ? `Mã xác thực gồm 6 chữ số đã được gửi tới ${initialEmail}.`
      : 'Vui lòng nhập địa chỉ email và mã xác thực 6 chữ số.'
  )

  const [email, setEmail] = useState(initialEmail)
  const [otpCode, setOtpCode] = useState('')
  const [isFocused, setIsFocused] = useState(true)
  const [fieldErrors, setFieldErrors] = useState({})
  const [apiError, setApiError] = useState(null)
  const [successNotice, setSuccessNotice] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(60)

  const inputRef = useRef(null)

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [resendCooldown])

  async function handleVerify() {
    setApiError(null)
    setSuccessNotice(null)

    // Validate email if not provided earlier
    const emailRes = validateEmail(email)
    if (!emailRes.isValid) {
      setFieldErrors({ email: emailRes.message })
      return
    }

    const otpRes = validateOtpCode(otpCode)
    if (!otpRes.isValid) {
      setFieldErrors({ otpCode: otpRes.message })
      return
    }

    setFieldErrors({})
    setIsSubmitting(true)

    try {
      if (purpose === 'activate_customer') {
        // Customer activation: activate and auto-login
        await activate({
          email: emailRes.value,
          code: otpRes.value,
          savedPassword,
        })
        // Once activated, session is active; navigate to Profile
        navigation.reset({
          index: 0,
          routes: [{ name: 'Home' }, { name: 'Profile' }],
        })
      } else {
        // Staff activation or Reset Password: verify OTP to get one-time proof grant
        const result = await verifyOtpForPurpose({
          email: emailRes.value,
          purpose,
          code: otpRes.value,
        })

        if (!result?.grant) {
          throw new Error('Không nhận được mã xác thực tiếp tục (grant). Vui lòng thử lại.')
        }

        // Navigate to password complete screen with the grant
        navigation.navigate('ResetPassword', {
          email: emailRes.value,
          purpose,
          grant: result.grant,
          isStaff: purpose === 'activate_staff',
        })
      }
    } catch (err) {
      setApiError(getAuthErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || isSubmitting) return
    setApiError(null)
    setSuccessNotice(null)

    const emailRes = validateEmail(email)
    if (!emailRes.isValid) {
      setFieldErrors({ email: emailRes.message })
      return
    }

    setIsSubmitting(true)
    try {
      if (purpose === 'activate_customer') {
        await resendActivation({ email: emailRes.value })
      } else {
        await requestOtpForPurpose({ email: emailRes.value, purpose })
      }
      setResendCooldown(60)
      setSuccessNotice(`Mã OTP mới đã được gửi lại tới ${emailRes.value}.`)
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
            <Text style={authStyles.brandPill}>Xác thực OTP</Text>
            <View style={{ width: 44 }} />
          </View>

          {/* Title */}
          <View style={authStyles.titleContainer}>
            <Text accessibilityRole="header" style={authStyles.title}>{screenTitle}</Text>
            <Text style={authStyles.subtitle}>{screenSubtitle}</Text>
          </View>

          {successNotice ? (
            <View style={authStyles.successBox}>
              <Text style={authStyles.successText}>{successNotice}</Text>
            </View>
          ) : null}

          {apiError ? (
            <View style={authStyles.errorBox}>
              <Text style={authStyles.errorText}>{apiError}</Text>
            </View>
          ) : null}

          {/* Card */}
          <View style={authStyles.card}>
            {/* If email wasn't passed in params, allow entering it */}
            {!initialEmail ? (
              <View style={authStyles.inputGroup}>
                <Text style={authStyles.label}>Email của bạn</Text>
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
            ) : null}

            {/* OTP Code Input matching the requested design */}
            <View style={authStyles.inputGroup}>
              <Text style={authStyles.otpLabel}>
                Nhập mã OTP <Text style={{ color: colors.copper }}>*</Text>
              </Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Nhập mã OTP"
                onPress={() => inputRef.current?.focus()}
                style={[
                  authStyles.otpOuterRing,
                  isFocused && authStyles.otpOuterRingFocused,
                  fieldErrors.otpCode && authStyles.otpOuterRingError,
                ]}
              >
                <View
                  style={[
                    authStyles.otpInnerBox,
                    isFocused && authStyles.otpInnerBoxFocused,
                    fieldErrors.otpCode && authStyles.otpInnerBoxError,
                  ]}
                >
                  <View style={authStyles.otpSlotsRow} pointerEvents="none">
                    {Array.from({ length: 6 }).map((_, index) => {
                      const char = otpCode[index]
                      if (char) {
                        return (
                          <Text key={index} style={authStyles.otpDigit}>
                            {char}
                          </Text>
                        )
                      }
                      return <View key={index} style={authStyles.otpDot} />
                    })}
                  </View>

                  <TextInput
                    ref={inputRef}
                    value={otpCode}
                    onChangeText={(val) => {
                      const clean = val.replace(/\D/g, '').slice(0, 6)
                      setOtpCode(clean)
                      if (fieldErrors.otpCode) {
                        setFieldErrors((prev) => ({ ...prev, otpCode: null }))
                      }
                    }}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    keyboardType="number-pad"
                    maxLength={6}
                    editable={!isSubmitting}
                    caretHidden={true}
                    autoFocus={true}
                    textContentType="oneTimeCode"
                    autoComplete="sms-otp"
                    style={authStyles.otpHiddenInput}
                  />
                </View>
              </Pressable>

              {fieldErrors.otpCode && (
                <Text style={[authStyles.fieldError, { textAlign: 'center', marginTop: 8 }]}>
                  {fieldErrors.otpCode}
                </Text>
              )}
            </View>

            {/* Resend OTP button */}
            <View style={authStyles.resendRow}>
              <Text style={authStyles.resendText}>Chưa nhận được mã?</Text>
              <Pressable
                accessibilityRole="button"
                onPress={handleResend}
                disabled={resendCooldown > 0 || isSubmitting}
              >
                <Text
                  style={[
                    authStyles.resendButton,
                    resendCooldown > 0 && authStyles.resendDisabled,
                  ]}
                >
                  {resendCooldown > 0
                    ? `Gửi lại sau ${resendCooldown}s`
                    : 'Gửi lại mã'}
                </Text>
              </Pressable>
            </View>

            {/* Submit Button */}
            <Pressable
              accessibilityRole="button"
              onPress={handleVerify}
              disabled={isSubmitting}
              style={[
                authStyles.primaryButton,
                { marginTop: 24 },
                isSubmitting && authStyles.primaryButtonDisabled,
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <Text style={authStyles.primaryButtonText}>
                  {purpose === 'activate_customer'
                    ? 'Kích hoạt tài khoản'
                    : 'Xác nhận mã'}
                </Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

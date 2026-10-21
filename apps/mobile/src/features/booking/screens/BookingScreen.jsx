import { useEffect, useRef, useState } from 'react'
import { usePreventRemove } from '@react-navigation/native'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import {
  bookingPayload,
  contactInput,
  money,
  salonDate,
  slotTime,
} from '../../../../../../shared/booking.js'
import { apiBaseUrl } from '../../../config/env.js'
import BottomNav from '../../../navigation/BottomNav.jsx'
import { colors } from '../../../theme/tokens.js'
import { useAuth } from '../../auth/hooks/useAuth.js'
import { useServices } from '../../services/hooks/useServices.js'
import { updateBookingProfile } from '../api/booking.api.js'
import { useBookingQuery } from '../hooks/useBookingQuery.js'
import { useBookingSubmission } from '../hooks/useBookingSubmission.js'
import { styles } from '../styles/booking.styles.js'

export default function BookingScreen({ navigation }) {
  const { token, isAuthenticated, isLoading, account } = useAuth()
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'right', 'bottom', 'left']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          style={styles.back}
          onPress={() => navigation.goBack()}
        >
          <Feather name="arrow-left" size={23} color={colors.ink} />
        </Pressable>
        <Text style={styles.brand}>SOL HAIR STUDIO</Text>
      </View>
      {isLoading ? (
        <ActivityIndicator accessibilityLabel="Đang tải phiên" color={colors.copper} />
      ) : !isAuthenticated ? (
        <View style={styles.content}>
          <Text accessibilityRole="header" style={styles.title}>
            Một cuộc hẹn dành riêng cho bạn.
          </Text>
          <Text style={styles.copy}>Đăng nhập tài khoản khách đã kích hoạt để bắt đầu.</Text>
          <Action
            label="Đăng nhập để đặt lịch"
            onPress={() =>
              navigation.navigate('Login', {
                returnTo: 'Booking',
                notice: 'Đăng nhập để tiếp tục đặt lịch.',
              })
            }
          />
        </View>
      ) : !account?.roles?.includes('customer') ? (
        <View style={styles.content}>
          <Text accessibilityRole="alert" style={styles.copy}>
            Đặt lịch trên ứng dụng dành cho tài khoản khách hàng. Stylist xem lịch được giao trong
            khu vực Lịch hẹn.
          </Text>
        </View>
      ) : (
        <BookingForm key={token} token={token} navigation={navigation} />
      )}
      {(!isAuthenticated || !account?.roles?.includes('customer')) && (
        <BottomNav navigation={navigation} active="Booking" />
      )}
    </SafeAreaView>
  )
}

function BookingForm({ token, navigation }) {
  const catalog = useServices()
  const profile = useBookingQuery('profile', token, {})
  const active =
    profile.kind === 'success' &&
    profile.value?.status === 'active' &&
    profile.value?.roles?.includes('customer')
  const [serviceIds, setServiceIds] = useState([])
  const [localDate, setLocalDate] = useState(salonDate)
  const [staffId, setStaffId] = useState('')
  const [startAt, setStartAt] = useState('')
  const [name, setName] = useState(null)
  const [phone, setPhone] = useState(null)
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const mounted = useRef(true)
  const profileRequest = useRef(null)
  const { width, fontScale } = useWindowDimensions()
  const compact = width < 360 || fontScale > 1.3
  const submission = useBookingSubmission(token)
  const locked =
    submission.kind === 'loading' || Boolean(submission.pending) || submission.kind === 'success'
  usePreventRemove(submission.kind === 'loading' || Boolean(submission.pending), () =>
    setNotice('Chưa xác định kết quả. Hãy thử lại cùng yêu cầu trước khi rời màn hình.'),
  )
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      profileRequest.current?.abort()
    }
  }, [])
  const availability = useBookingQuery(
    'availability',
    token,
    active && serviceIds.length ? { serviceIds, localDate, mode: 'scheduled' } : null,
  )
  const data = availability.kind === 'success' ? availability.value : null
  const stylist = data?.stylists.find((item) => item.staffId === staffId)
  const slot = stylist?.slots.find((item) => item.startAt === startAt)
  const contact = profile.value?.customer
  const complete = Boolean(contact?.displayName && contact?.phone)
  const [dates] = useState(() =>
    Array.from({ length: 8 }, (_, day) => salonDate(new Date(Date.now() + day * 86400_000))),
  )
  function resetSlot() {
    setStaffId('')
    setStartAt('')
    setNotice('')
  }
  function toggle(id) {
    if (!serviceIds.includes(id) && serviceIds.length === 5) {
      setNotice('Mỗi cuộc hẹn chọn tối đa 5 dịch vụ.')
      return
    }
    setServiceIds((ids) => (ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]))
    resetSlot()
  }
  async function saveProfile() {
    try {
      const input = contactInput(name ?? contact?.displayName ?? '', phone ?? contact?.phone ?? '')
      setSaving(true)
      setNotice('')
      profileRequest.current = new AbortController()
      await updateBookingProfile(apiBaseUrl, token, input, profileRequest.current.signal)
      if (mounted.current) {
        profile.retry()
        availability.retry()
        resetSlot()
      }
    } catch (error) {
      if (mounted.current && error.name !== 'AbortError') setNotice(error.message)
    } finally {
      if (mounted.current) setSaving(false)
    }
  }
  async function confirm() {
    try {
      if (!submission.pending && (!active || !slot || !complete))
        throw new Error('Bổ sung hồ sơ và chọn giờ trống trước khi xác nhận.')
      const payload =
        submission.pending?.payload ??
        bookingPayload({
          serviceIds,
          staffId,
          startAt: slot.startAt,
          owner: false,
          mode: 'scheduled',
        })
      setNotice('')
      const result = await submission.submit(payload)
      if (mounted.current && result?.error?.status === 409) {
        resetSlot()
        availability.retry()
      }
    } catch (error) {
      if (mounted.current) setNotice(error.message)
    }
  }
  return (
    <>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Text style={styles.eyebrow}>YOUR TIME AT SOL</Text>
          <Text accessibilityRole="header" style={styles.title}>
            Hẹn một phiên bản mới.
          </Text>
          <Text style={styles.copy}>Chọn dịch vụ, người chăm sóc và giờ phù hợp với bạn.</Text>
          <RequestStatus query={profile} label="tài khoản" />
          {profile.kind === 'success' && !active && (
            <Text accessibilityRole="alert" style={styles.error}>
              Tài khoản chưa hoạt động hoặc không có quyền đặt lịch. Vui lòng đăng nhập lại.
            </Text>
          )}
          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.heading}>
              01 · Dịch vụ của bạn
            </Text>
            <Text style={styles.copy}>Chọn từ 1 đến 5 dịch vụ cùng một stylist.</Text>
            {catalog.state.kind === 'loading' && (
              <ActivityIndicator accessibilityLabel="Đang tải dịch vụ" color={colors.copper} />
            )}
            {catalog.state.kind === 'error' && (
              <>
                <Text accessibilityRole="alert" style={styles.error}>
                  {catalog.state.message}
                </Text>
                <Action secondary label="Thử lại dịch vụ" onPress={catalog.retry} />
              </>
            )}
            {catalog.state.kind === 'success' && !catalog.state.data.length && (
              <Text style={styles.copy}>Chưa có dịch vụ để đặt hẹn.</Text>
            )}
            <View style={styles.choices}>
              {catalog.state.data?.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="checkbox"
                  accessibilityLabel={`${item.name}, ${money(item.priceVnd)}`}
                  accessibilityState={{
                    checked: serviceIds.includes(item.id),
                    disabled: !active || locked,
                  }}
                  disabled={!active || locked}
                  onPress={() => toggle(item.id)}
                  style={({ pressed }) => [
                    styles.choice,
                    styles.service,
                    compact && styles.full,
                    serviceIds.includes(item.id) && styles.selected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[styles.choiceText, serviceIds.includes(item.id) && styles.selectedText]}
                  >
                    {item.name}
                  </Text>
                  <Text style={styles.muted}>{money(item.priceVnd)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          {active && !complete && (
            <View style={styles.section}>
              <Text accessibilityRole="header" style={styles.heading}>
                Thông tin liên hệ
              </Text>
              <Text style={styles.copy}>Lưu tên và số điện thoại trước khi xác nhận.</Text>
              <Text style={styles.label}>Tên khách</Text>
              <TextInput
                accessibilityLabel="Tên khách"
                value={name ?? contact?.displayName ?? ''}
                maxLength={120}
                editable={!locked && !saving}
                onChangeText={setName}
                autoComplete="name"
                style={styles.input}
              />
              <Text style={styles.label}>Số điện thoại</Text>
              <TextInput
                accessibilityLabel="Số điện thoại"
                value={phone ?? contact?.phone ?? ''}
                maxLength={16}
                editable={!locked && !saving}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
                placeholder="+84901234567"
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
              <Action
                label={saving ? 'Đang lưu…' : 'Lưu thông tin'}
                disabled={locked || saving}
                onPress={saveProfile}
              />
            </View>
          )}
          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.heading}>
              02 · Ngày đến Sol
            </Text>
            <Text style={styles.muted}>Giờ Việt Nam · Asia/Ho_Chi_Minh</Text>
            <View style={styles.choices}>
              {dates.map((date) => (
                <Choice
                  key={date}
                  label={`${date.slice(8)}/${date.slice(5, 7)}`}
                  accessibilityLabel={`Ngày ${date}`}
                  selected={date === localDate}
                  disabled={!active || locked}
                  onPress={() => {
                    setLocalDate(date)
                    resetSlot()
                  }}
                />
              ))}
            </View>
          </View>
          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.heading}>
              03 · Người chăm sóc & giờ
            </Text>
            {!serviceIds.length && (
              <Text style={styles.copy}>Chọn dịch vụ để xem stylist phù hợp.</Text>
            )}
            <RequestStatus query={availability} label="giờ trống" />
            {data && !data.stylists.length && (
              <Text style={styles.copy}>Chưa có stylist phù hợp. Hãy đổi dịch vụ hoặc ngày.</Text>
            )}
            <View style={styles.choices}>
              {data?.stylists.map((item) => (
                <Choice
                  key={item.staffId}
                  label={item.displayName}
                  selected={staffId === item.staffId}
                  disabled={locked}
                  onPress={() => {
                    setStaffId(item.staffId)
                    setStartAt('')
                  }}
                />
              ))}
            </View>
            {stylist && !stylist.slots.length && (
              <Text style={styles.copy}>Stylist đã hết giờ trống trong ngày này.</Text>
            )}
            <View style={styles.choices}>
              {stylist?.slots.map((item) => (
                <Choice
                  key={item.startAt}
                  label={slotTime(item.startAt)}
                  selected={startAt === item.startAt}
                  disabled={locked}
                  onPress={() => setStartAt(item.startAt)}
                />
              ))}
            </View>
            {data && (
              <Action
                secondary
                label="Tải lại giờ trống"
                disabled={locked}
                onPress={() => {
                  resetSlot()
                  availability.retry()
                }}
              />
            )}
          </View>
          <View style={styles.summary}>
            <Text accessibilityRole="header" style={styles.heading}>
              Cuộc hẹn của bạn
            </Text>
            {data ? (
              <>
                {data.items.map((item) => (
                  <View key={item.serviceId} style={styles.summaryRow}>
                    <Text style={styles.choiceText}>{item.name}</Text>
                    <Text style={styles.choiceText}>{money(item.priceVnd)}</Text>
                  </View>
                ))}
                <Text style={styles.copy}>{data.totalDurationMinutes} phút chăm sóc</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.total}>Tổng cộng</Text>
                  <Text style={styles.total}>{money(data.totalPriceVnd)}</Text>
                </View>
              </>
            ) : (
              <Text style={styles.copy}>
                Tổng tiền và thời lượng hiển thị sau khi tải giờ trống.
              </Text>
            )}
            {stylist && (
              <Text style={styles.copy}>
                {stylist.displayName}
                {slot ? ` · ${localDate} · ${slotTime(slot.startAt)}` : ''}
              </Text>
            )}
            <Text style={styles.muted}>
              Cuộc hẹn chỉ được xác nhận khi lưu thành công. Giờ trống có thể thay đổi trong lúc lựa
              chọn.
            </Text>
            {notice ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {notice}
              </Text>
            ) : null}
            {submission.kind === 'error' && (
              <>
                <Text accessibilityRole="alert" style={styles.error}>
                  {submission.error.message}
                </Text>
                {submission.error.uncertain ? (
                  <Text style={styles.copy}>
                    Chưa xác định kết quả. Giữ nguyên lựa chọn và thử lại cùng yêu cầu để tránh đặt
                    trùng. Không đóng ứng dụng trong lúc xác minh.
                  </Text>
                ) : (
                  <Action
                    secondary
                    label="Chọn lại giờ trống"
                    onPress={() => {
                      resetSlot()
                      availability.retry()
                    }}
                  />
                )}
              </>
            )}
            {submission.kind === 'success' ? (
              <View accessible accessibilityLiveRegion="polite">
                <Text accessibilityRole="header" style={styles.heading}>
                  Đặt lịch thành công
                </Text>
                <Text selectable style={styles.copy}>
                  Mã lịch: {submission.data.id}
                </Text>
                {submission.data.startAt && (
                  <Text style={styles.copy}>
                    {slotTime(submission.data.startAt)} · Sol đã ghi nhận cuộc hẹn của bạn.
                  </Text>
                )}
              </View>
            ) : (
              <Action
                label={
                  submission.kind === 'loading'
                    ? 'Đang xác nhận…'
                    : submission.pending
                      ? 'Thử lại cùng yêu cầu'
                      : 'Xác nhận đặt lịch'
                }
                disabled={
                  submission.kind === 'loading' ||
                  (!submission.pending && (!active || !complete || !slot))
                }
                onPress={confirm}
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {submission.kind !== 'loading' && !submission.pending ? (
        <BottomNav navigation={navigation} active="Booking" />
      ) : (
        <View style={styles.header}>
          <Text style={styles.muted}>Đang xác minh cuộc hẹn. Hãy giữ màn hình này.</Text>
        </View>
      )}
    </>
  )
}

function Choice({ label, accessibilityLabel = label, selected, disabled, onPress }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        selected && styles.selected,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.choiceText, selected && styles.selectedText]}>{label}</Text>
    </Pressable>
  )
}

function Action({ label, disabled = false, secondary = false, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        secondary ? styles.secondary : styles.primary,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={secondary ? styles.secondaryText : styles.primaryText}>{label}</Text>
    </Pressable>
  )
}

function RequestStatus({ query, label }) {
  if (query.kind === 'loading')
    return (
      <View accessible accessibilityLiveRegion="polite" accessibilityLabel={`Đang tải ${label}`}>
        <ActivityIndicator color={colors.copper} />
        <Text style={styles.copy}>Đang tải {label}…</Text>
      </View>
    )
  if (query.kind === 'error')
    return (
      <View>
        <Text accessibilityRole="alert" style={styles.error}>
          {query.error?.message || `Không tải được ${label}.`}
        </Text>
        <Action secondary label={`Thử lại ${label}`} onPress={query.retry} />
      </View>
    )
  return null
}

import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { usePreventRemove } from '@react-navigation/native'
import Feather from '@expo/vector-icons/Feather'
import { money, salonDate, slotTime } from '../../../../../../shared/booking.js'
import { colors } from '../../../theme/tokens.js'
import { useAuth } from '../../auth/hooks/useAuth.js'
import { appointmentCardText, isAppointmentCustomer } from '../appointment-presentation.js'
import { useCustomerReschedule } from '../hooks/useCustomerReschedule.js'
import { rescheduleBlockReason } from '../hooks/customer-reschedule.js'
import { styles } from '../styles/appointments.styles.js'
import { styles as form } from '../styles/reschedule.styles.js'
import { styles as dialog } from '../styles/cancellation.styles.js'

const WEEKDAYS = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']

function formatScheduleSummary(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  const time = slotTime(isoString)
  const vnTime = new Date(d.getTime() + 7 * 3600_000)
  const weekday = WEEKDAYS[vnTime.getUTCDay()]
  const day = String(vnTime.getUTCDate()).padStart(2, '0')
  const month = String(vnTime.getUTCMonth() + 1).padStart(2, '0')
  const year = vnTime.getUTCFullYear()
  return `${time} – ${weekday}, ${day}/${month}/${year}`
}

function RescheduleSuccessView({ appointment, onBackToDetail, onBackToList }) {
  const serviceNames = appointment?.items?.map(i => i.name).join(' · ') || 'Dịch vụ làm tóc'
  const duration = appointment?.totalDurationMinutes ? `${appointment.totalDurationMinutes} phút` : ''
  const price = appointment?.totalPriceVnd ? money(appointment.totalPriceVnd) : ''
  const stylist = appointment?.staffNameSnapshot || 'Stylist Sol'

  return (
    <View style={form.successContainer}>
      <View style={form.successBadge}>
        <Feather name="check" size={38} color="#059669" />
      </View>

      <View style={form.successHeader}>
        <Text style={form.successTitle}>Đổi lịch thành công!</Text>
        <Text style={form.successSubtitle}>
          Sol Hair Studio đã cập nhật và ghi nhận lịch hẹn mới của bạn.
        </Text>
      </View>

      <View style={form.successCard}>
        <View style={form.successCodeRow}>
          <Text style={form.successCodeLabel}>Mã lịch hẹn</Text>
          <Text selectable style={form.successCodeValue}>#{appointment?.id}</Text>
        </View>

        <View style={form.successItemRow}>
          <Feather name="calendar" size={18} color={colors.copper} style={form.successItemIcon} />
          <View style={form.successItemContent}>
            <Text style={form.successItemLabel}>Thời gian hẹn mới</Text>
            <Text style={form.successItemValueBold}>
              {formatScheduleSummary(appointment?.startAt)}
            </Text>
          </View>
        </View>

        <View style={form.successItemRow}>
          <Feather name="user" size={18} color={colors.muted} style={form.successItemIcon} />
          <View style={form.successItemContent}>
            <Text style={form.successItemLabel}>Chuyên viên phụ trách</Text>
            <Text style={form.successItemValue}>{stylist}</Text>
          </View>
        </View>

        <View style={form.successItemRow}>
          <Feather name="scissors" size={18} color={colors.muted} style={form.successItemIcon} />
          <View style={form.successItemContent}>
            <Text style={form.successItemLabel}>Dịch vụ đã đặt</Text>
            <Text style={form.successItemValue}>{serviceNames}</Text>
            {(duration || price) && (
              <Text style={form.sectionHint}>
                {[duration, price].filter(Boolean).join(' · ')}
              </Text>
            )}
          </View>
        </View>
      </View>

      <View style={form.successActions}>
        <Pressable
          accessibilityRole="button"
          onPress={onBackToDetail}
          style={form.primaryBtn}
        >
          <Text style={form.primaryBtnText}>Xem chi tiết lịch hẹn</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={onBackToList}
          style={form.secondaryBtn}
        >
          <Text style={form.secondaryBtnText}>Về danh sách cuộc hẹn</Text>
        </Pressable>
      </View>
    </View>
  )
}

function RescheduleForm({ navigation, token, accountId, appointmentId }) {
  const { state, command } = useCustomerReschedule(token, accountId, appointmentId)
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const busy = state.kind === 'submitting'
  const locked = busy || Boolean(state.pending)

  usePreventRemove(
    locked,
    () => Alert.alert(
      'Yêu cầu đổi lịch chưa được xác nhận',
      'Hãy chờ hoặc kiểm tra và thử lại cùng yêu cầu trước khi rời màn hình.',
    ),
  )

  const appointment = state.appointment
  const current = appointment ? appointmentCardText(appointment) : null
  const newText = state.target && appointment ? appointmentCardText({
    ...appointment,
    staffNameSnapshot: state.target.displayName,
    startAt: state.target.startAt,
    endAt: state.target.endAt,
  }) : null

  const reason = rescheduleBlockReason(appointment, now)
  const allStylists = state.options?.stylists ?? []
  const otherStylists = allStylists.filter(s => s.staffId !== appointment?.staffId)
  const selectedStaff = allStylists.find(s => s.staffId === state.staffId)
  const isKeepingCurrentStylist = state.staffId === appointment?.staffId

  // Days strip calculation (8 days)
  const baseToday = useMemo(() => salonDate(), [])
  const allUpcomingDays = useMemo(() => {
    const [y, m, d] = baseToday.split('-').map(Number)
    const list = []
    for (let i = 0; i < 8; i++) {
      const dt = new Date(Date.UTC(y, m - 1, d + i, 12, 0, 0))
      const dateStr = dt.toISOString().slice(0, 10)
      list.push({
        dateStr,
        dayNum: dt.getUTCDate(),
        weekday: WEEKDAYS[dt.getUTCDay()],
        month: dt.getUTCMonth() + 1,
        year: dt.getUTCFullYear(),
      })
    }
    return list
  }, [baseToday])

  const currentDayIdx = allUpcomingDays.findIndex(d => d.dateStr === state.localDate)
  const upcomingDays = currentDayIdx === 7 ? allUpcomingDays.slice(1) : allUpcomingDays.slice(0, 7)
  const currentDayMeta = allUpcomingDays[currentDayIdx >= 0 ? currentDayIdx : 0]
  const monthDisplay = currentDayMeta ? `Tháng ${currentDayMeta.month}, ${currentDayMeta.year}` : ''

  function handlePrevDay() {
    if (currentDayIdx > 0 && !locked) {
      command.chooseDate(allUpcomingDays[currentDayIdx - 1].dateStr)
    }
  }

  function handleNextDay() {
    if (currentDayIdx >= 0 && currentDayIdx < allUpcomingDays.length - 1 && !locked) {
      command.chooseDate(allUpcomingDays[currentDayIdx + 1].dateStr)
    }
  }

  const back = () => navigation.canGoBack()
    ? navigation.goBack()
    : navigation.navigate('CustomerAppointmentDetail', { appointmentId })

  const activeStylistDisplayName = selectedStaff?.displayName ||
    (isKeepingCurrentStylist ? appointment?.staffNameSnapshot : 'Chưa chọn chuyên viên')

  if (state.kind === 'success') {
    return (
      <ScrollView style={styles.viewport} contentContainerStyle={form.body}>
        <RescheduleSuccessView
          appointment={state.appointment}
          onBackToDetail={back}
          onBackToList={() => navigation.navigate('CustomerAppointments')}
        />
      </ScrollView>
    )
  }

  return (
    <>
      <ScrollView style={styles.viewport} contentContainerStyle={form.body}>
        {/* Service Banner */}
        {appointment && (
          <View style={form.serviceBanner}>
            <View style={form.serviceIconWrapper}>
              <Feather name="scissors" size={22} color={colors.copper} />
            </View>
            <View style={form.serviceBannerInfo}>
              <Text style={form.serviceTag}>Dịch vụ đang chọn</Text>
              <Text style={form.serviceBannerTitle} numberOfLines={1}>
                {appointment.items?.map(i => i.name).join(' · ') || 'Dịch vụ làm tóc'}
              </Text>
              <Text style={form.serviceBannerMeta}>
                <Feather name="clock" size={12} color={colors.muted} />{' '}
                {appointment.totalDurationMinutes} phút
                {appointment.totalPriceVnd ? ` · ${money(appointment.totalPriceVnd)}` : ''}
              </Text>
            </View>
          </View>
        )}

        {state.message ? (
          <Text accessibilityRole="alert" style={form.message}>{state.message}</Text>
        ) : null}

        {state.kind === 'denied' ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('CustomerAppointments')}
            style={form.primaryBtn}
          >
            <Text style={form.primaryBtnText}>Quay lại danh sách</Text>
          </Pressable>
        ) : (
          <>
            {/* 1. Chọn chuyên viên */}
            <View style={form.section}>
              <Text style={form.sectionTitle}>1. Chọn chuyên viên</Text>

              {/* Option 1: Giữ chuyên viên hiện tại */}
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: isKeepingCurrentStylist, disabled: locked }}
                disabled={locked}
                onPress={() => appointment && command.chooseStaff(appointment.staffId)}
                style={[
                  form.stylistOption,
                  isKeepingCurrentStylist && form.stylistOptionSelected,
                  locked && styles.disabled,
                ]}
              >
                <View style={form.stylistOptionHeader}>
                  <View style={[form.radioCircle, isKeepingCurrentStylist && form.radioCircleSelected]}>
                    {isKeepingCurrentStylist && <View style={form.radioInner} />}
                  </View>
                  <Text style={form.stylistOptionTitle}>Giữ chuyên viên hiện tại</Text>
                </View>

                <View style={form.stylistContent}>
                  <View style={form.avatar}>
                    <Text style={form.avatarText}>
                      {appointment?.staffNameSnapshot ? appointment.staffNameSnapshot.charAt(0) : 'S'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={form.stylistName}>{appointment?.staffNameSnapshot || 'Chuyên viên hiện tại'}</Text>
                    <Text style={form.stylistDesc}>Chuyên viên đang phụ trách lịch hẹn này.</Text>
                  </View>
                </View>
              </Pressable>

              {/* Option 2: Chọn chuyên viên khác */}
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: !isKeepingCurrentStylist, disabled: locked }}
                disabled={locked}
                onPress={() => {
                  if (otherStylists.length > 0 && isKeepingCurrentStylist) {
                    command.chooseStaff(otherStylists[0].staffId)
                  }
                }}
                style={[
                  form.stylistOption,
                  !isKeepingCurrentStylist && form.stylistOptionSelected,
                  locked && styles.disabled,
                ]}
              >
                <View style={form.stylistOptionHeader}>
                  <View style={[form.radioCircle, !isKeepingCurrentStylist && form.radioCircleSelected]}>
                    {!isKeepingCurrentStylist && <View style={form.radioInner} />}
                  </View>
                  <Text style={form.stylistOptionTitle}>Chọn chuyên viên khác</Text>
                </View>

                <View style={form.stylistContent}>
                  <View style={[form.avatar, { backgroundColor: colors.soft }]}>
                    <Feather name="user" size={18} color={colors.muted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={form.stylistDesc}>Xem lịch trống của stylist khác</Text>
                  </View>
                </View>

                {!isKeepingCurrentStylist && otherStylists.length > 0 && (
                  <View style={form.otherStylistsList}>
                    {otherStylists.map(s => {
                      const isSelected = state.staffId === s.staffId
                      return (
                        <Pressable
                          key={s.staffId}
                          accessibilityRole="button"
                          disabled={locked}
                          onPress={() => command.chooseStaff(s.staffId)}
                          style={[
                            form.otherStylistChip,
                            isSelected && form.otherStylistChipSelected,
                            locked && styles.disabled,
                          ]}
                        >
                          <Text style={[
                            form.otherStylistChipText,
                            isSelected && form.otherStylistChipTextSelected,
                          ]}>
                            {s.displayName}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                )}
                {!isKeepingCurrentStylist && otherStylists.length === 0 && (
                  <Text style={[form.sectionHint, { color: colors.copper, marginTop: 8, paddingLeft: 28 }]}>
                    Không có chuyên viên khác cho dịch vụ này
                  </Text>
                )}
              </Pressable>
            </View>

            {/* 2. Chọn thời gian mới */}
            <View style={form.section}>
              <Text style={form.sectionTitle}>2. Chọn thời gian mới</Text>

              {/* Month Navigation */}
              <View style={form.monthNav}>
                <Text style={form.monthTitle}>Ngày trong tuần</Text>
                <View style={form.navControls}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Ngày trước"
                    disabled={currentDayIdx <= 0 || locked}
                    onPress={handlePrevDay}
                    style={[form.navArrow, (currentDayIdx <= 0 || locked) && styles.disabled]}
                  >
                    <Feather name="chevron-left" size={18} color={colors.ink} />
                  </Pressable>
                  <Text style={form.monthTitle}>{monthDisplay}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Ngày sau"
                    disabled={currentDayIdx >= allUpcomingDays.length - 1 || locked}
                    onPress={handleNextDay}
                    style={[form.navArrow, (currentDayIdx >= allUpcomingDays.length - 1 || locked) && styles.disabled]}
                  >
                    <Feather name="chevron-right" size={18} color={colors.ink} />
                  </Pressable>
                </View>
              </View>

              {/* 7-day strip */}
              <View style={form.datesRow}>
                {upcomingDays.map(day => {
                  const isSelected = day.dateStr === state.localDate
                  return (
                    <Pressable
                      key={day.dateStr}
                      accessibilityRole="button"
                      disabled={locked}
                      accessibilityState={{ selected: isSelected, disabled: locked }}
                      onPress={() => command.chooseDate(day.dateStr)}
                      style={[
                        form.dateCard,
                        isSelected && form.dateCardSelected,
                        locked && styles.disabled,
                      ]}
                    >
                      <Text style={[form.dateWeekday, isSelected && form.dateWeekdaySelected]}>
                        {day.weekday}
                      </Text>
                      <Text style={[form.dateNumber, isSelected && form.dateNumberSelected]}>
                        {day.dayNum}
                      </Text>
                      {isSelected ? <View style={form.dateDot} /> : <View style={{ height: 4 }} />}
                    </Pressable>
                  )
                })}
              </View>

              {/* Slots Header & Legend */}
              <View style={form.slotsHeader}>
                <Text style={form.slotsLabel}>Khung giờ salon</Text>
                <View style={form.legend}>
                  <View style={form.legendItem}>
                    <View style={[form.legendDot, { backgroundColor: '#10b981' }]} />
                    <Text style={form.legendText}>Còn sẵn</Text>
                  </View>
                  <View style={form.legendItem}>
                    <View style={[form.legendDot, { backgroundColor: colors.copper }]} />
                    <Text style={form.legendText}>Đã chọn</Text>
                  </View>
                </View>
              </View>

              {/* Loading Slots */}
              {state.kind === 'loading' && (
                <View style={[styles.center, { paddingVertical: 18 }]}>
                  <ActivityIndicator color={colors.copper} accessibilityLabel="Đang tải giờ trống đổi lịch" />
                  <Text style={[styles.stateText, { marginTop: 8 }]}>Đang tải lịch và giờ trống…</Text>
                </View>
              )}

              {/* Error reload */}
              {['error', 'rejected'].includes(state.kind) && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => command.load()}
                  style={form.secondaryBtn}
                >
                  <Text style={form.secondaryBtnText}>Tải lại lịch và giờ trống</Text>
                </Pressable>
              )}

              {/* Slots Grid */}
              {state.options && (
                <>
                  {!selectedStaff?.slots.length ? (
                    <View style={form.emptySlotsBox}>
                      <Text style={form.emptySlotsText}>
                        {isKeepingCurrentStylist
                          ? 'Chuyên viên hiện tại không có giờ trống trong ngày này. Hãy chọn ngày khác hoặc chọn chuyên viên khác.'
                          : 'Chuyên viên được chọn không có giờ trống trong ngày này. Hãy chọn ngày hoặc chuyên viên khác.'}
                      </Text>
                    </View>
                  ) : (
                    <View style={form.slotsGrid}>
                      {selectedStaff.slots.map(slot => {
                        const isSelected = state.startAt === slot.startAt
                        const isCurrentSlot = isKeepingCurrentStylist && slot.startAt === appointment?.startAt
                        return (
                          <Pressable
                            key={slot.startAt}
                            accessibilityRole="button"
                            disabled={locked || isCurrentSlot}
                            accessibilityState={{ selected: isSelected, disabled: locked || isCurrentSlot }}
                            onPress={() => command.chooseSlot(slot.startAt)}
                            style={[
                              form.slotCard,
                              isSelected && form.slotCardSelected,
                              isCurrentSlot && form.slotCardCurrent,
                            ]}
                          >
                            <Text style={[form.slotTimeText, isSelected && form.slotTimeTextSelected]}>
                              {slotTime(slot.startAt)}
                            </Text>
                            <Text style={[form.slotStatusText, isSelected && form.slotStatusTextSelected]}>
                              {isSelected ? 'Đã chọn' : isCurrentSlot ? 'Lịch hiện tại' : 'Còn chỗ'}
                            </Text>
                          </Pressable>
                        )
                      })}
                    </View>
                  )}
                </>
              )}
            </View>

            {/* Tóm tắt thay đổi */}
            {appointment && (
              <View style={form.summaryCard}>
                <View style={form.summaryHeader}>
                  <Feather name="calendar" size={16} color={colors.copper} />
                  <Text style={form.summaryHeaderTitle}>Tóm tắt thay đổi</Text>
                </View>

                <View style={form.summaryRow}>
                  <Text style={form.summaryLabel}>Lịch cũ:</Text>
                  <Text style={form.summaryValue}>
                    {formatScheduleSummary(appointment.startAt)}
                  </Text>
                </View>

                <View style={form.summaryRow}>
                  <Text style={form.summaryLabel}>Lịch mới dự kiến:</Text>
                  <Text style={form.summaryValueHighlight}>
                    {state.startAt ? formatScheduleSummary(state.startAt) : 'Chưa chọn giờ mới'}
                  </Text>
                </View>

                <View style={form.summaryRow}>
                  <Text style={form.summaryLabel}>Chuyên viên:</Text>
                  <Text style={form.summaryValue}>{activeStylistDisplayName}</Text>
                </View>

                <Text style={form.note}>
                  Không tạo lịch mới. Dịch vụ, giá và thời lượng đã đặt được giữ nguyên.
                </Text>
              </View>
            )}

            {reason && appointment && !locked && (
              <Text accessibilityRole="alert" style={form.message}>{reason}</Text>
            )}

            {/* CTA Buttons */}
            {state.kind === 'ready' && (
              <Pressable
                accessibilityRole="button"
                onPress={command.confirm}
                disabled={!state.startAt || Boolean(reason)}
                style={[form.primaryBtn, (!state.startAt || Boolean(reason)) && form.btnDisabled]}
              >
                <Text style={form.primaryBtnText}>Kiểm tra thay đổi</Text>
              </Pressable>
            )}

            {state.kind === 'uncertain' && (
              <Pressable
                accessibilityRole="button"
                onPress={command.submit}
                style={form.primaryBtn}
              >
                <Text style={form.primaryBtnText}>Kiểm tra và thử lại cùng yêu cầu</Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>

      {/* Confirmation Modal */}
      <Modal visible={state.confirming} transparent animationType="fade" onRequestClose={command.closeConfirmation}>
        <SafeAreaView style={dialog.overlay}>
          <View style={dialog.dialog} accessibilityViewIsModal onAccessibilityEscape={command.closeConfirmation}>
            <ScrollView contentContainerStyle={dialog.content}>
              <Text accessibilityRole="header" style={dialog.title}>Xác nhận đổi lịch?</Text>
              {current && (
                <View style={dialog.summary}>
                  <Text style={dialog.label}>Lịch cũ</Text>
                  <Text style={dialog.copy}>{current.date} · {current.time}</Text>
                  <Text style={dialog.copy}>{current.stylist}</Text>
                </View>
              )}
              {newText && (
                <View style={dialog.summary}>
                  <Text style={dialog.label}>Lịch mới</Text>
                  <Text style={dialog.copy}>{newText.date} · {newText.time}</Text>
                  <Text style={dialog.copy}>Stylist: {newText.stylist}</Text>
                  <Text style={dialog.copy}>{newText.services} · {newText.price}</Text>
                </View>
              )}
              <Text style={dialog.copy}>
                Không tạo lịch mới. Dịch vụ, giá và thời lượng đã đặt được giữ nguyên.
              </Text>
              {state.message ? <Text accessibilityRole="alert" style={dialog.message}>{state.message}</Text> : null}
              {busy && <ActivityIndicator color={colors.copper} accessibilityLabel="Đang đổi lịch hẹn" />}
              <Pressable
                accessibilityRole="button"
                onPress={command.submit}
                disabled={busy || (!state.pending && Boolean(reason))}
                style={[form.primaryBtn, (busy || (!state.pending && Boolean(reason))) && form.btnDisabled]}
              >
                <Text style={form.primaryBtnText}>
                  {busy ? 'Đang xử lý…' : state.pending ? 'Kiểm tra và thử lại' : 'Xác nhận đổi lịch'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={locked}
                accessibilityState={{ disabled: locked }}
                onPress={command.closeConfirmation}
                style={[dialog.cancel, locked && styles.disabled]}
              >
                <Text style={dialog.cancelText}>Quay lại chọn</Text>
              </Pressable>
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  )
}

export default function CustomerAppointmentRescheduleScreen({ navigation, route }) {
  const { token, account, isAuthenticated, isLoading } = useAuth()
  const accountId = account?.accountId ?? account?.id
  const appointmentId = route.params?.appointmentId

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'right', 'bottom', 'left']}>
      <View style={styles.header}>
        <View style={styles.top}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại chi tiết"
            style={styles.back}
            onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('CustomerAppointmentDetail', { appointmentId })}
          >
            <Feather name="arrow-left" size={20} color={colors.ink} />
          </Pressable>
          <Text style={styles.brand}>SOL HAIR STUDIO</Text>
        </View>
        <Text accessibilityRole="header" style={styles.title}>Đổi lịch hẹn</Text>
      </View>
      {isLoading ? (
        <View style={[styles.center, styles.gate]}><ActivityIndicator color={colors.copper} /></View>
      ) : !isAuthenticated || !token || !isAppointmentCustomer(account) ? (
        <View style={[styles.center, styles.gate]}>
          <Text accessibilityRole="alert" style={styles.stateText}>
            Đăng nhập bằng tài khoản Customer đang hoạt động để đổi lịch của mình.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('Login', { returnTo: 'CustomerAppointments' })}
            style={[form.primaryBtn, { marginTop: 14 }]}
          >
            <Text style={form.primaryBtnText}>Đăng nhập</Text>
          </Pressable>
        </View>
      ) : (
        <RescheduleForm
          key={JSON.stringify([token, accountId, appointmentId, account.roles, account.status])}
          navigation={navigation}
          token={token}
          accountId={accountId}
          appointmentId={appointmentId}
        />
      )}
    </SafeAreaView>
  )
}

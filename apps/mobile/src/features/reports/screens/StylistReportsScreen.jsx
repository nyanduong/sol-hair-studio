import { useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import { salonDate, money, slotTime } from '../../../../../../shared/booking.js'
import BottomNav from '../../../navigation/BottomNav.jsx'
import { colors } from '../../../theme/tokens.js'
import { useAuth } from '../../auth/hooks/useAuth.js'
import { isAppointmentStylist } from '../../appointments/appointment-presentation.js'
import { appointmentDateLabel } from '../../staff/staff-presentation.js'
import ReportCalendar, { IconButton, ReportSheet } from '../components/ReportCalendar.jsx'
import { useStylistReport } from '../hooks/useStylistReport.js'
import { summarizeDay } from '../report-presentation.js'
import { reportColors, styles as s } from '../styles/reports.styles.js'

function ResourceState({ state, label }) {
  if (state.kind === 'success') return null
  return <View style={s.state}>
    {state.kind === 'loading' ? <><ActivityIndicator color={colors.copper} accessibilityLabel={`Đang tải ${label}`} /><Text style={s.stateText}>Đang tải {label}…</Text></>
      : <><Text accessibilityRole="alert" style={s.stateText}>{state.kind === 'denied' ? 'Phiên hoặc quyền stylist đã thay đổi. Vui lòng đăng nhập lại.' : `Không tải được ${label}. Hãy kiểm tra kết nối và thử lại.`}</Text>
        <Pressable accessibilityRole="button" style={s.button} onPress={state.retry}><Text style={s.buttonText}>Thử lại</Text></Pressable></>}
  </View>
}

function DaySummary({ items }) {
  const report = summarizeDay(items)
  return <View style={s.section}>
    <View style={s.metrics}>
      {[
        ['Đã phục vụ', report.completed, reportColors.completed],
        ['Chưa phục vụ', report.waiting, reportColors.waiting],
        ['Đang phục vụ', report.inProgress, colors.copper],
        ['Khách hủy', '—', colors.muted],
      ].map(([label, value, color]) => <View key={label} style={s.metric}>
        <Text style={[s.metricNumber, { color }]}>{value}</Text><Text style={s.metricLabel}>{label}</Text>
      </View>)}
    </View>
    <Text style={s.hint}>Tính theo lượt hẹn trong ngày. Chưa có dữ liệu khách hủy cho tài khoản stylist.</Text>
    <View style={s.income}>
      <View style={s.row}><Text style={s.incomeLabel}>Tiền đã thu cho quán</Text><Feather name="credit-card" size={20} color={colors.surface} /></View>
      <Text style={s.incomeNumber}>{money(report.serviceValueVnd)}</Text>
      <Text style={s.incomeNote}>Tổng tiền dịch vụ bạn đã hoàn tất trong ngày.</Text>
    </View>
  </View>
}

function DayShifts({ state, date }) {
  if (state.kind !== 'success') return <ResourceState state={state} label="ca làm" />
  const shifts = state.data.filter(shift => shift.localDate === date)
  return <View style={s.section}>
    <Text accessibilityRole="header" style={s.sectionTitle}>Ca làm trong ngày</Text>
    {shifts.length ? shifts.map(shift => <View key={shift.shiftId} style={s.shift}>
      <Feather name="clock" size={20} color={colors.copper} /><Text style={s.shiftText}>{slotTime(shift.startAt)} – {slotTime(shift.endAt)}</Text>
    </View>) : <Text style={s.hint}>Bạn chưa có ca làm được xếp trong ngày này.</Text>}
  </View>
}

function DayAppointments({ items, navigation }) {
  const labels = { confirmed: 'Chưa phục vụ', in_progress: 'Đang phục vụ', completed: 'Đã phục vụ' }
  const tones = { confirmed: reportColors.waiting, in_progress: colors.copper, completed: reportColors.completed }
  return <View style={s.section}>
    <View style={s.row}><Text accessibilityRole="header" style={s.sectionTitle}>Lịch khách trong ngày</Text><Text style={s.hint}>{items.length} lượt</Text></View>
    {!items.length && <View style={s.state}>
      <Feather name="coffee" size={32} color={colors.copper} /><Text style={s.stateTitle}>Chưa có lịch khách</Text>
      <Text style={s.stateText}>Ngày này chưa có lịch chờ, đang phục vụ hoặc đã hoàn tất được giao cho bạn.</Text>
    </View>}
    {items.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${slotTime(item.startAt)}, ${item.customerSnapshot.displayName}, ${labels[item.status]}. Xem chi tiết lịch hẹn`} onPress={() => navigation.navigate('StylistAppointmentDetail', { appointmentId: item.id })} style={({ pressed }) => [s.appointment, pressed && s.pressed]}>
      <View style={s.timeColumn}><Text style={s.time}>{slotTime(item.startAt)}</Text><View style={s.timeLine} /><Text style={s.timeEnd}>{slotTime(item.endAt)}</Text></View>
      <View style={s.appointmentBody}>
        <Text style={s.customer}>{item.customerSnapshot.displayName}</Text>
        <Text style={s.service}>{item.items.map(service => service.name).join(' · ')}</Text>
        <Text style={[s.status, { color: tones[item.status] }]}>{labels[item.status]}</Text>
        <Text style={s.service}>{money(item.totalPriceVnd)} · {item.totalDurationMinutes} phút</Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.muted} />
    </Pressable>)}
  </View>
}

function PersonalReport({ token, accountId, navigation }) {
  const today = salonDate()
  const [date, setDate] = useState(today)
  const [calendarDate, setCalendarDate] = useState(today)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const { day, shifts } = useStylistReport(token, accountId, date, (calendarOpen ? calendarDate : date).slice(0, 7))
  const denied = day.kind === 'denied' || shifts.kind === 'denied'
  function refresh() { void day.retry(); void shifts.retry() }
  return <>
    <View style={s.viewport}>
      <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={colors.copper} colors={[colors.copper]} />}>
        <View style={s.header}>
          <View style={s.viewport}><Text accessibilityRole="header" style={s.title}>Báo cáo của tôi</Text><Text style={s.subtitle}>Mỗi ngày tại Sol, trong tầm mắt.</Text></View>
          <IconButton label="Tải lại báo cáo" icon="refresh-cw" onPress={refresh} />
        </View>
        {denied ? <View style={s.state}>
          <Text accessibilityRole="alert" style={s.stateText}>Phiên hoặc quyền stylist đã thay đổi. Vui lòng đăng nhập lại để xem báo cáo.</Text>
          <Pressable accessibilityRole="button" style={s.button} onPress={() => navigation.navigate('Login')}><Text style={s.buttonText}>Đăng nhập</Text></Pressable>
        </View> : <>
          <View style={s.section}>
            <View style={s.row}>
              <Text accessibilityRole="header" style={s.sectionTitle}>{date === today ? 'Hôm nay' : 'Tổng quan ngày'}</Text>
              {date !== today && <Pressable accessibilityRole="button" style={s.textButton} onPress={() => setDate(today)}><Text style={s.link}>Về hôm nay</Text></Pressable>}
            </View>
            <Text accessibilityLiveRegion="polite" style={s.date}>{appointmentDateLabel(date)}</Text>
            <Text style={s.hint}>Giờ Việt Nam · Chỉ lịch được giao cho bạn</Text>
          </View>
          {day.kind === 'success' ? <DaySummary items={day.data} /> : <ResourceState state={day} label="báo cáo ngày" />}
          <DayShifts state={shifts} date={date} />
          {day.kind === 'success' && <DayAppointments items={day.data} navigation={navigation} />}
        </>}
      </ScrollView>
      {!denied && <Pressable accessibilityRole="button" accessibilityLabel="Mở lịch tháng để chọn ngày báo cáo" onPress={() => { setCalendarDate(date); setCalendarOpen(true) }} style={({ pressed }) => [s.calendarFab, pressed && s.pressed]}><Feather name="calendar" size={25} color={colors.surface} /></Pressable>}
    </View>
    {calendarOpen && !denied && <ReportSheet title="Chọn ngày báo cáo" onClose={() => setCalendarOpen(false)}>
      <ReportCalendar date={calendarDate} today={today} shifts={shifts} onChange={setCalendarDate} onSelect={value => { setDate(value); setCalendarOpen(false) }} />
      <ResourceState state={shifts} label="ca làm trong tháng" />
      {shifts.kind === 'success' && !shifts.data.length && <Text style={s.stateText}>Bạn chưa có ca làm được xếp trong tháng này. Vẫn có thể chọn ngày để xem lịch khách.</Text>}
      <Text style={s.hint}>Chạm một ngày để xem số lượt khách, giá trị dịch vụ và ca làm của ngày đó.</Text>
    </ReportSheet>}
  </>
}

export default function StylistReportsScreen({ navigation }) {
  const { token, account, isLoading, isAuthenticated } = useAuth()
  const allowed = isAuthenticated && isAppointmentStylist(account)
  return <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={s.safe}>
    {isLoading ? <View style={[s.viewport, s.state]}><ActivityIndicator color={colors.copper} accessibilityLabel="Đang kiểm tra phiên" /></View>
      : allowed ? <PersonalReport key={account.accountId ?? account.id} token={token} accountId={account.accountId ?? account.id} navigation={navigation} />
        : <View style={[s.viewport, s.state]}><Text accessibilityRole="alert" style={s.stateText}>Báo cáo này chỉ dành cho stylist đã đăng nhập.</Text><Pressable accessibilityRole="button" style={s.button} onPress={() => navigation.navigate('Login', { returnTo: 'StylistReports' })}><Text style={s.buttonText}>Đăng nhập</Text></Pressable></View>}
    <BottomNav navigation={navigation} active="StylistReports" />
  </SafeAreaView>
}

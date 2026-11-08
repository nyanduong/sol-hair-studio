import { useState } from 'react'
import { Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import { colors } from '../../../theme/tokens.js'
import { calendarWeeks, moveMonth } from '../report-presentation.js'
import { styles as s } from '../styles/reports.styles.js'

export function IconButton({ label, icon, onPress, disabled = false }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.iconButton, (pressed || disabled) && s.pressed]}>
    <Feather name={icon} size={20} color={colors.copper} />
  </Pressable>
}

export function ReportSheet({ title, onClose, children }) {
  return <Modal visible transparent animationType="slide" onRequestClose={onClose}>
    <View style={s.overlay}>
      <SafeAreaView edges={['bottom', 'left', 'right']} style={s.sheet} accessibilityViewIsModal>
        <View style={s.handle} />
        <View style={s.sheetHeader}>
          <Text accessibilityRole="header" style={s.sectionTitle}>{title}</Text>
          <IconButton label="Đóng" icon="x" onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={s.sheetContent}>{children}</ScrollView>
      </SafeAreaView>
    </View>
  </Modal>
}

function MonthPicker({ month, onChange, onClose }) {
  const [year, setYear] = useState(Number(month.slice(0, 4)))
  const [number, setNumber] = useState(Number(month.slice(5)))
  return <ReportSheet title="Chọn tháng" onClose={onClose}>
    <View style={s.row}>
      <IconButton label="Năm trước" icon="chevron-left" disabled={year <= 2000} onPress={() => setYear(year - 1)} />
      <Text accessibilityRole="header" style={s.sectionTitle}>{year}</Text>
      <IconButton label="Năm sau" icon="chevron-right" disabled={year >= 2100} onPress={() => setYear(year + 1)} />
    </View>
    <View style={s.pickerGrid}>{Array.from({ length: 12 }, (_, i) => i + 1).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: value === number }} onPress={() => setNumber(value)} style={[s.monthOption, value === number && s.selectedDay]}>
      <Text style={[s.dayText, value === number && s.selectedText]}>Tháng {value}</Text>
    </Pressable>)}</View>
    <Pressable accessibilityRole="button" style={s.button} onPress={() => { onChange(`${year}-${String(number).padStart(2, '0')}-01`); onClose() }}><Text style={s.buttonText}>Xem tháng {number}/{year}</Text></Pressable>
  </ReportSheet>
}

export default function ReportCalendar({ date, today, shifts, onChange, onSelect }) {
  const [picking, setPicking] = useState(false)
  const month = date.slice(0, 7)
  const shiftDates = new Set(shifts.kind === 'success' ? shifts.data.map(shift => shift.localDate) : [])
  return <View style={s.section}>
    <View style={s.row}>
      <Text accessibilityRole="header" style={s.sectionTitle}>Lịch làm việc</Text>
      <Pressable accessibilityRole="button" style={s.textButton} onPress={() => onChange(today)}><Text style={s.link}>Về hôm nay</Text></Pressable>
    </View>
    <View style={s.calendar}>
      <View style={s.row}>
        <IconButton label="Tháng trước" icon="chevron-left" disabled={month <= '2000-01'} onPress={() => onChange(`${moveMonth(month, -1)}-01`)} />
        <Pressable accessibilityRole="button" accessibilityLabel="Chọn tháng và năm" style={s.monthButton} onPress={() => setPicking(true)}>
          <Text style={s.monthTitle}>Tháng {Number(month.slice(5))}, {month.slice(0, 4)}</Text><Feather name="chevron-down" size={16} color={colors.copper} />
        </Pressable>
        <IconButton label="Tháng sau" icon="chevron-right" disabled={month >= '2100-12'} onPress={() => onChange(`${moveMonth(month, 1)}-01`)} />
      </View>
      <View style={s.week}>{['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(day => <Text key={day} style={s.weekday}>{day}</Text>)}</View>
      {calendarWeeks(month).map((week, i) => <View key={i} style={s.week}>{week.map((value, j) => value ? <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: value === date }} accessibilityLabel={`${Number(value.slice(-2))}/${Number(month.slice(5))}/${month.slice(0, 4)}${value === today ? ', hôm nay' : ''}${shiftDates.has(value) ? ', có ca làm' : ''}`} onPress={() => onSelect(value)} style={({ pressed }) => [s.day, value === today && s.today, value === date && s.selectedDay, pressed && s.pressed]}>
        <Text style={[s.dayText, value === today && s.todayText, value === date && s.selectedText]}>{Number(value.slice(-2))}</Text>
        <View style={[s.dot, !shiftDates.has(value) && { backgroundColor: 'transparent' }, value === date && shiftDates.has(value) && { backgroundColor: colors.surface }]} />
      </Pressable> : <View key={`blank-${j}`} style={s.day} />)}</View>)}
      <View style={s.legend}><View style={s.dot} /><Text style={s.hint}>Có ca làm</Text><Text style={s.hint}>· Khung viền: hôm nay</Text></View>
    </View>
    {picking && <MonthPicker month={month} onChange={onChange} onClose={() => setPicking(false)} />}
  </View>
}

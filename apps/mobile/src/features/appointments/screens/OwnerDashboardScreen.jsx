import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import { salonDate } from '../../../../../../shared/booking.js'
import { apiBaseUrl } from '../../../config/env.js'
import BottomNav from '../../../navigation/BottomNav.jsx'
import { colors } from '../../../theme/tokens.js'
import { useAuth } from '../../auth/hooks/useAuth.js'
import { formatPrice } from '../../services/service-presentation.js'
import { listOwnerAppointments } from '../api/owner-appointments.api.js'
import {
  appointmentCardText,
  getStatusTheme,
  isAppointmentOwner,
  moveAppointmentDay,
} from '../appointment-presentation.js'
import styles from '../styles/owner-dashboard.styles.js'

function formatRevenue(amount) {
  return new Intl.NumberFormat('vi-VN').format(Number(amount) || 0) + 'đ'
}

export default function OwnerDashboardScreen({ navigation }) {
  const auth = useAuth()
  const isOwner = isAppointmentOwner(auth.account)
  const [selectedDate, setSelectedDate] = useState(() => salonDate())
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)

  const loadData = useCallback(async () => {
    if (!auth.token || !isOwner) {
      setLoading(false)
      setRefreshing(false)
      return
    }

    try {
      setError(null)
      const res = await listOwnerAppointments(apiBaseUrl, auth.token, { localDate: selectedDate })
      setAppointments(res.items || [])
    } catch (err) {
      setError(err?.message || 'Không thể tải dữ liệu lịch hẹn.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [auth.token, isOwner, selectedDate])

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadData()
    }, 0)

    return () => clearTimeout(timer)
  }, [loadData])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    void loadData()
  }, [loadData])

  // Compute KPIs for the selected date
  const stats = useMemo(() => {
    let completedRevenue = 0 // Doanh thu thực thu (chỉ tính lịch đã hoàn tất)
    let expectedRevenue = 0 // Doanh thu dự kiến (từ các lịch đang phục vụ + chờ xác nhận)
    let todayCount = appointments.length
    let inProgressCount = 0
    let confirmedCount = 0
    let completedCount = 0

    for (const appt of appointments) {
      if (appt.status === 'completed') {
        completedRevenue += appt.totalPriceVnd || 0
        completedCount += 1
      } else if (appt.status === 'in_progress') {
        inProgressCount += 1
        expectedRevenue += appt.totalPriceVnd || 0
      } else if (appt.status === 'confirmed') {
        confirmedCount += 1
        expectedRevenue += appt.totalPriceVnd || 0
      }
    }

    return {
      completedRevenue,
      expectedRevenue,
      todayCount,
      inProgressCount,
      confirmedCount,
      completedCount,
    }
  }, [appointments])

  // Auth Guard
  if (auth.isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={colors.copper} />
          <Text style={styles.emptyTitle}>Đang tải thông tin salon…</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (!auth.isAuthenticated || !isOwner) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <View style={[styles.container, { flex: 1, justifyContent: 'center', alignItems: 'center' }]}>
          <Feather name="shield" size={52} color={colors.copper} />
          <Text style={[styles.title, { marginTop: 16, textAlign: 'center' }]}>
            Khu vực Quản trị Salon
          </Text>
          <Text style={[styles.subtitle, { textAlign: 'center', maxWidth: 280, marginTop: 8 }]}>
            Màn hình tổng quan này chỉ dành cho chủ tiệm (Owner). Vui lòng đăng nhập bằng tài khoản quản lý.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('Login', { returnTo: 'Profile' })}
            style={[styles.quickButton, { marginTop: 24, paddingHorizontal: 32, flex: 0, backgroundColor: colors.copper }]}
          >
            <Text style={[styles.quickButtonText, { color: colors.surface }]}>Đăng nhập Chủ tiệm</Text>
          </Pressable>
        </View>
        <BottomNav navigation={navigation} active="Profile" />
      </SafeAreaView>
    )
  }

  const isToday = selectedDate === salonDate()

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.copper]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Salon Header with Back Navigation */}
        <View style={styles.header}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Quay lại tài khoản"
                onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Profile'))}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name="arrow-left" size={18} color={colors.ink} />
              </Pressable>
              <Text style={[styles.eyebrow, { marginBottom: 0 }]}>SOL ATELIER MANAGEMENT</Text>
            </View>
            <Text style={styles.title}>Tổng quan Salon</Text>
            <Text style={styles.subtitle}>
              {isToday ? `Hôm nay (${selectedDate})` : `Ngày ${selectedDate}`} · Giờ Việt Nam
            </Text>

            {/* Quick Date Switcher */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ngày trước"
                onPress={() => setSelectedDate((d) => moveAppointmentDay(d, -1) || d)}
                style={{ padding: 6, borderRadius: 8, backgroundColor: colors.soft }}
              >
                <Feather name="chevron-left" size={16} color={colors.ink} />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => setSelectedDate(salonDate())}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 8,
                  backgroundColor: isToday ? colors.copper : colors.soft,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: isToday ? colors.surface : colors.ink,
                  }}
                >
                  {isToday ? 'Đang xem hôm nay' : 'Về hôm nay'}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ngày sau"
                onPress={() => setSelectedDate((d) => moveAppointmentDay(d, 1) || d)}
                style={{ padding: 6, borderRadius: 8, backgroundColor: colors.soft }}
              >
                <Feather name="chevron-right" size={16} color={colors.ink} />
              </Pressable>
            </View>
          </View>
          <View style={styles.ownerBadge}>
            <Text style={styles.ownerBadgeText}>CHỦ SALON</Text>
          </View>
        </View>

        {/* 4 KPI Cards */}
        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <View style={styles.kpiTop}>
              <Text style={styles.kpiLabel}>Doanh thu thực thu</Text>
              <Feather name="dollar-sign" size={16} color={colors.copper} />
            </View>
            <Text style={styles.kpiValue}>{formatRevenue(stats.completedRevenue)}</Text>
            <Text style={styles.kpiSubtext}>
              {stats.completedCount > 0
                ? `${stats.completedCount} lịch đã hoàn tất`
                : stats.expectedRevenue > 0
                  ? `Dự kiến: ${formatRevenue(stats.expectedRevenue)}`
                  : 'Chưa có lịch hoàn tất'}
            </Text>
          </View>

          <View style={styles.kpiCard}>
            <View style={styles.kpiTop}>
              <Text style={styles.kpiLabel}>Lịch hẹn {isToday ? 'hôm nay' : 'trong ngày'}</Text>
              <Feather name="calendar" size={16} color={colors.copper} />
            </View>
            <Text style={styles.kpiValue}>{stats.todayCount}</Text>
            <Text style={styles.kpiSubtext}>Lượt đặt trong ngày</Text>
          </View>

          <View style={styles.kpiCard}>
            <View style={styles.kpiTop}>
              <Text style={styles.kpiLabel}>Đang phục vụ</Text>
              <Feather name="scissors" size={16} color="#3b82f6" />
            </View>
            <Text style={[styles.kpiValue, { color: '#1e40af' }]}>{stats.inProgressCount}</Text>
            <Text style={styles.kpiSubtext}>Khách đang làm tóc</Text>
          </View>

          <View style={styles.kpiCard}>
            <View style={styles.kpiTop}>
              <Text style={styles.kpiLabel}>Chờ phục vụ</Text>
              <Feather name="clock" size={16} color="#10b981" />
            </View>
            <Text style={[styles.kpiValue, { color: '#065f46' }]}>{stats.confirmedCount}</Text>
            <Text style={styles.kpiSubtext}>Đã xác nhận</Text>
          </View>
        </View>

        {/* Quick Management Shortcuts */}
        <Text style={styles.quickActionsTitle}>Lối tắt quản lý</Text>
        <View style={[styles.quickRow, { marginBottom: 24 }]}>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('Services')}
            style={styles.quickButton}
          >
            <Feather name="grid" size={20} color={colors.copper} />
            <Text style={styles.quickButtonText}>Dịch vụ Salon</Text>
            <Text style={styles.quickButtonSub}>Xem danh mục bảng giá</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('StylistAppointments')}
            style={styles.quickButton}
          >
            <Feather name="users" size={20} color={colors.copper} />
            <Text style={styles.quickButtonText}>Lịch Stylist</Text>
            <Text style={styles.quickButtonSub}>Theo dõi ca & thợ</Text>
          </Pressable>
        </View>

        {/* Live Queue Header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Hàng đợi lịch hẹn</Text>
          <Text style={styles.sectionCount}>{appointments.length} lịch hẹn</Text>
        </View>

        {/* Live Queue Cards */}
        {loading ? (
          <View style={[styles.emptyContainer, { padding: 40 }]}>
            <ActivityIndicator size="small" color={colors.copper} />
            <Text style={[styles.emptyText, { marginTop: 10 }]}>Đang cập nhật lịch hẹn…</Text>
          </View>
        ) : error ? (
          <View style={styles.emptyContainer}>
            <Feather name="alert-triangle" size={32} color={colors.copper} />
            <Text style={styles.emptyTitle}>Không thể tải lịch hẹn</Text>
            <Text style={styles.emptyText}>{error}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={loadData}
              style={[styles.quickButton, { marginTop: 14, flex: 0, paddingHorizontal: 20 }]}
            >
              <Text style={styles.quickButtonText}>Thử lại</Text>
            </Pressable>
          </View>
        ) : appointments.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Feather name="calendar" size={36} color={colors.muted} />
            <Text style={styles.emptyTitle}>Chưa có lịch hẹn nào</Text>
            <Text style={styles.emptyText}>
              Salon chưa có lượt đặt chỗ trong ngày {selectedDate}. Kéo xuống để cập nhật lại.
            </Text>
          </View>
        ) : (
          <View style={styles.queueList}>
            {appointments.map((item) => {
              const cardText = appointmentCardText(item)
              const theme = getStatusTheme(item.status)

              return (
                <View key={item.id} style={styles.queueCard}>
                  {/* Top: Time and Status Badge */}
                  <View style={styles.cardTop}>
                    <Text style={styles.timeRange}>{cardText.time}</Text>
                    <View style={[styles.badge, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                      <View style={[styles.badgeDot, { backgroundColor: theme.dot }]} />
                      <Text style={[styles.badgeText, { color: theme.text }]}>{theme.label}</Text>
                    </View>
                  </View>

                  {/* Customer Information */}
                  <View style={styles.customerRow}>
                    <Text style={styles.customerName}>
                      {item.customerSnapshot?.displayName || 'Khách vãng lai'}
                    </Text>
                    {item.customerSnapshot?.phone ? (
                      <Text style={styles.customerPhone}>SĐT: {item.customerSnapshot.phone}</Text>
                    ) : null}
                  </View>

                  {/* Service & Total Price */}
                  <View style={styles.serviceRow}>
                    <Text style={styles.serviceName} numberOfLines={1}>
                      {cardText.services || 'Dịch vụ Salon'}
                    </Text>
                    <Text style={styles.priceValue}>{formatPrice(item.totalPriceVnd)}</Text>
                  </View>

                  {/* Assigned Stylist */}
                  <View style={styles.staffRow}>
                    <Feather name="user-check" size={13} color={colors.copper} />
                    <Text style={styles.staffName}>
                      Thợ phụ trách: {item.staffNameSnapshot || 'Chưa chỉ định'}
                    </Text>
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>

      {/* Global Bottom Navigation */}
      <BottomNav navigation={navigation} active="Profile" />
    </SafeAreaView>
  )
}

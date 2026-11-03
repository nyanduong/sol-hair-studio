import { ActivityIndicator, FlatList, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import { useAuth } from '../../auth/hooks/useAuth.js'
import { colors } from '../../../theme/tokens.js'
import { isAppointmentStylist } from '../appointment-presentation.js'
import { useStylistServiceHistory } from '../hooks/useStylistServiceHistory.js'
import { StylistAction, StylistGate, StylistHeader } from '../components/StylistAppointmentView.jsx'
import { styles } from '../styles/appointments.styles.js'
import { styles as local } from '../styles/stylist-appointments.styles.js'

const performedAt = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })

function HistoryCard({ item }) {
  return (
    <View style={local.historyCard}>
      {/* Top Header */}
      <View style={local.historyCardTop}>
        <Text selectable style={local.historyCardCode}>Mã: #{item.id}</Text>
        <View style={local.completedBadge}>
          <View style={local.completedBadgeDot} />
          <Text style={local.completedBadgeText}>Đã hoàn tất</Text>
        </View>
      </View>

      {/* Completion Time & Stylist */}
      <View style={local.historyInfoBox}>
        <View style={local.historyInfoRow}>
          <Feather name="calendar" size={14} color={colors.copper} />
          <Text style={local.historyTimeText}>
            {performedAt.format(new Date(item.completedAt))} (Giờ VN)
          </Text>
        </View>
        <View style={local.historyInfoRow}>
          <Feather name="user" size={14} color={colors.muted} />
          <Text style={local.historyStylistText}>
            Stylist thực hiện: {item.staffNameSnapshot || 'Stylist Sol'}
          </Text>
        </View>
      </View>

      {/* Services List */}
      <View style={{ marginTop: 2 }}>
        <View style={local.historyServicesHeader}>
          <Feather name="scissors" size={13} color={colors.copper} />
          <Text style={local.historyServicesTitle}>Dịch vụ đã thực hiện</Text>
        </View>

        {item.items.map((service, index) => (
          <View style={styles.serviceItemRow} key={service.serviceId + ':' + index}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.serviceItemName}>{service.name}</Text>
              <Text style={styles.serviceItemMeta}>{service.durationMinutes} phút</Text>
            </View>
            <Text style={styles.serviceItemPrice}>{money.format(service.priceVnd)}</Text>
          </View>
        ))}

        <View style={[styles.total, { marginTop: 6, paddingTop: 10 }]}>
          <Text style={styles.totalLabel}>Tổng chi phí</Text>
          <Text style={styles.price}>{money.format(item.totalPriceVnd)}</Text>
        </View>
      </View>
    </View>
  )
}

function HistoryError({ state }) {
  const message = state.kind === 'denied'
    ? state.error?.status === 404
      ? 'Lịch ngữ cảnh không còn khả dụng hoặc không được giao cho bạn.'
      : 'Phiên hoặc quyền xem lịch sử đã thay đổi. Dữ liệu cũ đã được xóa.'
    : state.error?.status === 400
      ? 'Mã lịch hoặc phân trang không hợp lệ. Hãy quay lại lịch hẹn hoặc tải lại.'
      : state.restartRequired
        ? 'Phân trang đã thay đổi. Hãy tải lại lịch sử.'
        : 'Không tải được lịch sử dịch vụ. Bạn vẫn có thể quay lại và phục vụ lịch hiện tại.'

  return (
    <View style={styles.center}>
      <Text accessibilityRole="alert" style={styles.stateText}>{message}</Text>
      <StylistAction label={state.restartRequired ? 'Tải lại lịch sử' : 'Thử lại'} onPress={state.retry} />
    </View>
  )
}

function PersonalHistory({ token, accountId, appointmentId }) {
  const state = useStylistServiceHistory(token, accountId, appointmentId)

  return (
    <FlatList
      style={styles.viewport}
      contentContainerStyle={styles.list}
      data={state.kind === 'denied' ? [] : state.items}
      keyExtractor={item => item.id}
      renderItem={({ item }) => <HistoryCard item={item} />}
      refreshing={state.refreshing}
      onRefresh={state.refresh}
      alwaysBounceVertical
      ListHeaderComponent={
        <View style={local.historyContextBanner}>
          <View style={local.historyContextIconBox}>
            <Feather name="clock" size={18} color={colors.copper} />
          </View>
          <View style={local.historyContextContent}>
            <Text style={local.historyContextTitle}>Lịch sử dịch vụ của khách hàng</Text>
            <Text style={local.historyContextDesc}>
              Các lượt làm đẹp đã hoàn tất trước đây của khách. Giúp stylist nắm rõ thói quen và dịch vụ khách ưa chuộng.
            </Text>
          </View>
        </View>
      }
      ListEmptyComponent={
        state.kind === 'loading' ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.copper} accessibilityLabel="Đang tải lịch sử dịch vụ" />
            <Text style={styles.stateText}>Đang tải lịch sử dịch vụ…</Text>
          </View>
        ) : state.kind === 'success' && !state.hasNextPage ? (
          <View style={[styles.center, { marginTop: 20 }]}>
            <View style={[styles.back, { width: 52, height: 52, borderRadius: 26, backgroundColor: '#f5ebe6' }]}>
              <Feather name="scissors" size={22} color={colors.copper} />
            </View>
            <Text style={styles.stateTitle}>Chưa có dịch vụ đã hoàn tất</Text>
            <Text style={styles.stateText}>
              Khách hàng này chưa có lượt hoàn tất dịch vụ trước đây được ghi nhận trong hệ thống.
            </Text>
          </View>
        ) : null
      }
      ListFooterComponent={
        <View style={styles.footer}>
          {['error', 'denied'].includes(state.kind) ? (
            <HistoryError state={state} />
          ) : state.hasNextPage ? (
            <>
              {state.kind === 'loadingMore' && (
                <ActivityIndicator color={colors.copper} accessibilityLabel="Đang tải thêm lịch sử" />
              )}
              <StylistAction
                label="Tải thêm lịch sử"
                disabled={state.kind === 'loadingMore'}
                onPress={state.loadMore}
              />
            </>
          ) : null}
        </View>
      }
    />
  )
}

export default function StylistServiceHistoryScreen({ navigation, route }) {
  const auth = useAuth()
  const accountId = auth.account?.accountId ?? auth.account?.id
  const appointmentId = route.params?.appointmentId ?? null

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'right', 'bottom', 'left']}>
      <StylistHeader navigation={navigation} detail title="Lịch sử dịch vụ" />
      {!auth.isLoading && auth.isAuthenticated && auth.token && isAppointmentStylist(auth.account) ? (
        <PersonalHistory
          key={JSON.stringify([auth.token, accountId, appointmentId, auth.account.roles, auth.account.status])}
          token={auth.token}
          accountId={accountId}
          appointmentId={appointmentId}
        />
      ) : (
        <StylistGate isLoading={auth.isLoading} navigation={navigation} />
      )}
    </SafeAreaView>
  )
}

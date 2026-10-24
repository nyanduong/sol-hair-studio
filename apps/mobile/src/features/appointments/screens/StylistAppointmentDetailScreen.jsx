import { useCallback, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import { colors } from '../../../theme/tokens.js'
import { useAuth } from '../../auth/hooks/useAuth.js'
import { isAppointmentStylist } from '../appointment-presentation.js'
import { selectStylistEtaSummary } from '../appointment-eta.js'
import { useStylistAppointments } from '../hooks/useStylistAppointments.js'
import StylistServiceActions from '../components/StylistServiceActions.jsx'
import StylistEtaManagement, { StylistEtaSummary } from '../components/StylistEtaManagement.jsx'
import { StylistAppointmentCard, StylistGate, StylistHeader, StylistLoading, StylistReadError } from '../components/StylistAppointmentView.jsx'
import { styles } from '../styles/appointments.styles.js'
import { styles as local } from '../styles/stylist-appointments.styles.js'

function DetailContent({ state, etaResult, appointmentId, navigation }) {
  const summary = selectStylistEtaSummary(state, etaResult, appointmentId)

  if (state.kind !== 'success') {
    return (
      <>
        {state.kind === 'loading' ? <StylistLoading /> : <StylistReadError state={state} />}
        {summary && (
          <ScrollView style={styles.viewport} contentContainerStyle={styles.list}>
            <StylistEtaSummary appointment={summary} previousRead />
          </ScrollView>
        )}
      </>
    )
  }

  return (
    <ScrollView style={styles.viewport} contentContainerStyle={styles.list}>
      <StylistAppointmentCard appointment={state.appointment} detail />
      <StylistEtaSummary appointment={summary} />

      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('StylistServiceHistory', { appointmentId })}
        style={local.historyNavBtn}
      >
        <View style={local.historyNavBtnLeft}>
          <View style={local.historyNavBtnIconBox}>
            <Feather name="clock" size={18} color={colors.copper} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={local.historyNavBtnTitle}>Lịch sử dịch vụ của khách</Text>
            <Text style={local.historyNavBtnSub}>Xem các lượt làm tóc đã hoàn tất trước đây</Text>
          </View>
        </View>
        <Feather name="chevron-right" size={18} color={colors.copper} />
      </Pressable>
    </ScrollView>
  )
}

function PersonalDetail({ token, accountId, appointmentId, navigation }) {
  const state = useStylistAppointments(token, accountId, undefined, appointmentId)
  const [etaResult, setEtaResult] = useState(null)
  const refresh = state.refresh
  const onEtaChanged = useCallback(value => { setEtaResult(value ?? null); void refresh() }, [refresh])
  const onServiceChanged = useCallback(() => { setEtaResult(null); void refresh() }, [refresh])

  return (
    <>
      <DetailContent state={state} etaResult={etaResult} appointmentId={appointmentId} navigation={navigation} />
      <StylistEtaManagement
        token={token}
        accountId={accountId}
        appointmentId={appointmentId}
        appointment={state.kind === 'success' ? state.appointment : null}
        onChanged={onEtaChanged}
      />
      <StylistServiceActions
        token={token}
        accountId={accountId}
        appointmentId={appointmentId}
        appointment={state.kind === 'success' ? state.appointment : null}
        onChanged={onServiceChanged}
      />
    </>
  )
}

export default function StylistAppointmentDetailScreen({ navigation, route }) {
  const auth = useAuth()
  const accountId = auth.account?.accountId ?? auth.account?.id
  const appointmentId = route.params?.appointmentId ?? null

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'right', 'bottom', 'left']}>
      <StylistHeader navigation={navigation} detail />
      {!auth.isLoading && auth.isAuthenticated && auth.token && isAppointmentStylist(auth.account) ? (
        <PersonalDetail
          key={JSON.stringify([auth.token, accountId, appointmentId, auth.account.roles, auth.account.status])}
          token={auth.token}
          accountId={accountId}
          appointmentId={appointmentId}
          navigation={navigation}
        />
      ) : (
        <StylistGate isLoading={auth.isLoading} navigation={navigation} />
      )}
    </SafeAreaView>
  )
}

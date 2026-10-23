import { useCallback, useState } from 'react'
import StylistServiceActions from '../components/StylistServiceActions.jsx'
import StylistEtaManagement, { StylistEtaSummary } from '../components/StylistEtaManagement.jsx'
import { ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../../auth/hooks/useAuth.js'
import { isAppointmentStylist } from '../appointment-presentation.js'
import { selectStylistEtaSummary } from '../appointment-eta.js'
import { useStylistAppointments } from '../hooks/useStylistAppointments.js'
import { StylistAppointmentCard, StylistGate, StylistHeader, StylistLoading, StylistReadError } from '../components/StylistAppointmentView.jsx'
import { styles } from '../styles/appointments.styles.js'

function DetailContent({ state, etaResult, appointmentId }) {
  const summary = selectStylistEtaSummary(state, etaResult, appointmentId)
  if (state.kind !== 'success') return <>
    {state.kind === 'loading' ? <StylistLoading /> : <StylistReadError state={state} />}
    {summary && <ScrollView style={styles.viewport} contentContainerStyle={styles.list}>
      <StylistEtaSummary appointment={summary} previousRead />
    </ScrollView>}
  </>
  return <ScrollView style={styles.viewport} contentContainerStyle={styles.list}>
    <StylistAppointmentCard appointment={state.appointment} detail />
    <StylistEtaSummary appointment={summary} />
  </ScrollView>
}

function PersonalDetail({ token, accountId, appointmentId }) {
  const state = useStylistAppointments(token, accountId, undefined, appointmentId)
  const [etaResult, setEtaResult] = useState(null)
  const refresh = state.refresh
  const onEtaChanged = useCallback(value => { setEtaResult(value ?? null); void refresh() }, [refresh])
  const onServiceChanged = useCallback(() => { setEtaResult(null); void refresh() }, [refresh])
  return <>
    <DetailContent state={state} etaResult={etaResult} appointmentId={appointmentId} />
    <StylistEtaManagement token={token} accountId={accountId} appointmentId={appointmentId}
      appointment={state.kind === 'success' ? state.appointment : null} onChanged={onEtaChanged} />
    <StylistServiceActions token={token} accountId={accountId} appointmentId={appointmentId}
      appointment={state.kind === 'success' ? state.appointment : null} onChanged={onServiceChanged} />
  </>
}

export default function StylistAppointmentDetailScreen({ navigation, route }) {
  const auth = useAuth(), accountId = auth.account?.accountId ?? auth.account?.id
  // null giữ nhánh detail khi params thiếu, để validator báo lỗi và không gọi list.
  const appointmentId = route.params?.appointmentId ?? null
  return <SafeAreaView style={styles.safe} edges={['top', 'right', 'bottom', 'left']}>
    <StylistHeader navigation={navigation} detail />
    {!auth.isLoading && auth.isAuthenticated && auth.token && isAppointmentStylist(auth.account)
      ? <PersonalDetail key={JSON.stringify([auth.token, accountId, appointmentId, auth.account.roles, auth.account.status])}
        token={auth.token} accountId={accountId} appointmentId={appointmentId} />
      : <StylistGate isLoading={auth.isLoading} navigation={navigation} />}
  </SafeAreaView>
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createLatestRequest } from '../../../lib/latest-request.js'
import { addDays } from '../demo.js'

// Đọc dữ liệu theo phiên và tuần hiện tại; request cũ không được cập nhật UI.
export function useStaff(client, week) {
  const [peopleState, setPeopleState] = useState({ kind: 'loading' })
  const [shiftState, setShiftState] = useState({ kind: 'loading' })
  const [selected, setSelected] = useState(null)
  const [actionState, setActionState] = useState({ kind: 'idle' })
  const peopleRequest = useMemo(() => createLatestRequest(), [])
  const shiftRequest = useMemo(() => createLatestRequest(), [])
  const mutationRequest = useMemo(() => createLatestRequest(), [])
  const busy = useRef(false)
  const mounted = useRef(false)
  const people = peopleState.kind === 'success' ? peopleState.people : []
  const current = people.find((person) => person.staffId === selected) || people[0]
  const currentId = current?.staffId
  const shiftKey = `${currentId || ''}:${week}`

  const loadPeople = useCallback(async () => {
    setPeopleState({ kind: 'loading' })
    const result = await peopleRequest.run((signal) => Promise.all([client.listStaff(signal), client.listServices(signal)]))
    if (result.kind === 'success') setPeopleState({ kind: 'success', people: result.value[0], services: result.value[1] })
    if (result.kind === 'error') setPeopleState({ kind: 'error', error: result.error })
  }, [client, peopleRequest])

  const loadShifts = useCallback(async () => {
    if (!currentId) return
    setShiftState({ kind: 'loading', key: shiftKey })
    const result = await shiftRequest.run((signal) => client.listShifts(currentId, week, addDays(week, 6), signal))
    if (result.kind === 'success') setShiftState({ kind: 'success', data: result.value, key: shiftKey })
    if (result.kind === 'error') setShiftState({ kind: 'error', error: result.error, key: shiftKey })
  }, [client, currentId, shiftKey, shiftRequest, week])

  useEffect(() => {
    const timer = setTimeout(() => { void loadPeople() }, 0)
    return () => { clearTimeout(timer); peopleRequest.cancel() }
  }, [loadPeople, peopleRequest])
  useEffect(() => {
    const timer = setTimeout(() => { void loadShifts() }, 0)
    return () => { clearTimeout(timer); shiftRequest.cancel() }
  }, [loadShifts, shiftRequest])
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; mutationRequest.cancel() }
  }, [mutationRequest])

  // Không gửi trùng thao tác ghi; thành công mới tải lại dữ liệu từ nguồn.
  const mutate = useCallback(async (operation, refresh) => {
    if (busy.current) return false
    busy.current = true
    setActionState({ kind: 'loading' })
    const result = await mutationRequest.run(operation)
    if (result.kind === 'ignored') { busy.current = false; return false }
    if (result.kind === 'error') { busy.current = false; setActionState({ kind: 'error', error: result.error }); return false }
    if (refresh === 'people') await loadPeople()
    else await loadShifts()
    busy.current = false
    if (!mounted.current) return false
    setActionState({ kind: 'success' })
    return result.value || true
  }, [loadPeople, loadShifts, mutationRequest])

  return {
    peopleState, people, current, selected: currentId, setSelected,
    services: peopleState.services || [],
    shiftState: shiftState.key === shiftKey ? shiftState : { kind: 'loading' },
    actionState, clearAction: () => setActionState({ kind: 'idle' }),
    reloadPeople: loadPeople, reloadShifts: loadShifts, mutate,
  }
}

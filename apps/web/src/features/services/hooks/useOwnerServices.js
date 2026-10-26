import { useCallback, useEffect, useMemo, useState } from 'react'
import { createLatestRequest } from '../../../lib/latest-request.js'
import {
  createService,
  fetchManageServices,
  getServiceActionErrorMessage,
  getServicesErrorMessage,
  updateService,
} from '../api/services.api.js'

export function useOwnerServices(apiBaseUrl, token) {
  const [services, setServices] = useState([])
  const [state, setState] = useState({ kind: 'loading', error: null })
  const [actionState, setActionState] = useState({ kind: 'idle', message: '', error: null })

  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const [modalService, setModalService] = useState(null) // null = closed, {} = create new, { ...service } = edit
  const isModalOpen = Boolean(modalService)

  const requestManager = useMemo(() => createLatestRequest(), [])

  const loadServices = useCallback(async () => {
    setState((prev) => ({ ...prev, kind: 'loading' }))
    const result = await requestManager.run((signal) =>
      fetchManageServices(apiBaseUrl, token, { signal }),
    )

    if (result.kind === 'ignored') return

    if (result.kind === 'error') {
      setState({ kind: 'error', error: result.error })
    } else {
      setServices(result.value || [])
      setState({ kind: 'success', error: null })
    }
  }, [apiBaseUrl, token, requestManager])

  useEffect(() => {
    if (!token) return
    const timer = setTimeout(() => {
      void loadServices()
    }, 0)

    return () => {
      clearTimeout(timer)
      requestManager.cancel()
    }
  }, [token, loadServices, requestManager])

  const clearAction = useCallback(() => {
    setActionState({ kind: 'idle', message: '', error: null })
  }, [])

  const openCreateModal = useCallback(() => {
    clearAction()
    setModalService({})
  }, [clearAction])

  const openEditModal = useCallback(
    (service) => {
      clearAction()
      setModalService({ ...service })
    },
    [clearAction],
  )

  const closeModal = useCallback(() => {
    setModalService(null)
    clearAction()
  }, [clearAction])

  const toggleServiceActive = useCallback(
    async (serviceId) => {
      const target = services.find((s) => s.id === serviceId)
      if (!target) return

      const nextActive = !target.isActive

      // Optimistic update
      setServices((prev) =>
        prev.map((s) => (s.id === serviceId ? { ...s, isActive: nextActive } : s)),
      )
      setActionState({ kind: 'loading', message: 'Đang cập nhật trạng thái…', error: null })

      try {
        await updateService(apiBaseUrl, token, serviceId, { isActive: nextActive })
        setActionState({
          kind: 'success',
          message: nextActive
            ? `Đã bật hiển thị dịch vụ "${target.name}".`
            : `Đã ẩn dịch vụ "${target.name}".`,
          error: null,
        })
      } catch (err) {
        // Rollback
        setServices((prev) =>
          prev.map((s) => (s.id === serviceId ? { ...s, isActive: target.isActive } : s)),
        )
        setActionState({
          kind: 'error',
          message: getServiceActionErrorMessage(err),
          error: err,
        })
      }
    },
    [apiBaseUrl, token, services],
  )

  const saveService = useCallback(
    async (formData, isUpdate) => {
      setActionState({ kind: 'loading', message: 'Đang lưu dịch vụ…', error: null })
      try {
        if (isUpdate) {
          const updated = await updateService(apiBaseUrl, token, formData.id, formData)
          setServices((prev) => prev.map((s) => (s.id === formData.id ? updated : s)))
          setActionState({
            kind: 'success',
            message: `Đã cập nhật dịch vụ "${formData.name}".`,
            error: null,
          })
        } else {
          const created = await createService(apiBaseUrl, token, formData)
          setServices((prev) => [created, ...prev])
          setActionState({
            kind: 'success',
            message: `Đã thêm mới dịch vụ "${formData.name}".`,
            error: null,
          })
        }
        setModalService(null)
        return true
      } catch (err) {
        setActionState({
          kind: 'error',
          message: getServiceActionErrorMessage(err),
          error: err,
        })
        return false
      }
    },
    [apiBaseUrl, token],
  )

  // Danh mục duy nhất
  const categories = useMemo(() => {
    const set = new Set()
    for (const s of services) {
      if (s.category) set.add(s.category.trim())
    }
    return Array.from(set).sort()
  }, [services])

  // Lọc danh sách
  const filteredServices = useMemo(() => {
    return services.filter((item) => {
      // Tìm kiếm
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchName = item.name?.toLowerCase().includes(q)
        const matchCat = item.category?.toLowerCase().includes(q)
        const matchDesc = item.description?.toLowerCase().includes(q)
        const matchId = item.id?.toLowerCase().includes(q)
        if (!matchName && !matchCat && !matchDesc && !matchId) return false
      }
      // Danh mục
      if (categoryFilter !== 'all' && item.category !== categoryFilter) {
        return false
      }
      // Trạng thái
      if (statusFilter === 'active' && !item.isActive) return false
      if (statusFilter === 'inactive' && item.isActive) return false

      return true
    })
  }, [services, searchQuery, categoryFilter, statusFilter])

  return {
    services,
    filteredServices,
    categories,
    state,
    actionState,
    searchQuery,
    categoryFilter,
    statusFilter,
    modalService,
    isModalOpen,
    setSearchQuery,
    setCategoryFilter,
    setStatusFilter,
    loadServices,
    toggleServiceActive,
    saveService,
    openCreateModal,
    openEditModal,
    closeModal,
    clearAction,
    errorMessage: state.error ? getServicesErrorMessage(state.error) : '',
  }
}

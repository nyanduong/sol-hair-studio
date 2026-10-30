import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiBaseUrl } from '../../../config/env.js'
import { createLatestRequest } from '../../../lib/latest-request.js'
import {
  createService,
  fetchManageServices,
  getServiceActionErrorMessage,
  getServicesErrorMessage,
  updateService,
} from '../api/services.api.js'

export function useOwnerServices(token) {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState('Tất cả')
  const [searchQuery, setSearchQuery] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [actionSuccess, setActionSuccess] = useState(null)

  const requestManager = useMemo(() => createLatestRequest(), [])

  const loadServices = useCallback(async (isPullRefresh = false) => {
    if (!token) {
      setLoading(false)
      setError('Cần đăng nhập tài khoản chủ tiệm.')
      return
    }

    if (isPullRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError(null)

    const result = await requestManager.run((signal) =>
      fetchManageServices(apiBaseUrl, token, { signal }),
    )

    if (result.kind === 'success') {
      setServices(result.value || [])
      setError(null)
    } else if (result.kind === 'error') {
      setError(getServicesErrorMessage(result.error))
    }

    setLoading(false)
    setRefreshing(false)
  }, [token, requestManager])

  useEffect(() => {
    const initialRequest = setTimeout(() => {
      void loadServices()
    }, 0)

    return () => {
      clearTimeout(initialRequest)
      requestManager.cancel()
    }
  }, [loadServices, requestManager])

  const reload = useCallback(() => {
    void loadServices(false)
  }, [loadServices])

  const refresh = useCallback(() => {
    void loadServices(true)
  }, [loadServices])

  const clearActionFeedback = useCallback(() => {
    setActionError(null)
    setActionSuccess(null)
  }, [])

  // Toggle ẩn / hiển thị dịch vụ
  const toggleActive = useCallback(async (service) => {
    if (!token || !service?.id) return
    setActionLoading(true)
    setActionError(null)
    setActionSuccess(null)

    try {
      const updated = await updateService(apiBaseUrl, token, service.id, {
        isActive: !service.isActive,
      })

      setServices((prev) =>
        prev.map((item) => (item.id === service.id ? { ...item, ...updated } : item)),
      )
      setActionSuccess(
        `Đã ${updated.isActive ? 'hiển thị' : 'ẩn'} dịch vụ "${service.name}".`,
      )
    } catch (err) {
      setActionError(getServiceActionErrorMessage(err))
    } finally {
      setActionLoading(false)
    }
  }, [token])

  // Tạo mới hoặc sửa dịch vụ
  const saveService = useCallback(async (servicePayload, isUpdate = false) => {
    if (!token) return { success: false, error: 'Chưa đăng nhập' }
    setActionLoading(true)
    setActionError(null)
    setActionSuccess(null)

    try {
      let saved
      if (isUpdate) {
        const { id, ...updates } = servicePayload
        saved = await updateService(apiBaseUrl, token, id, updates)
        setServices((prev) =>
          prev.map((item) => (item.id === id ? { ...item, ...saved } : item)),
        )
        setActionSuccess(`Cập nhật dịch vụ "${saved.name}" thành công!`)
      } else {
        saved = await createService(apiBaseUrl, token, servicePayload)
        setServices((prev) => [saved, ...prev])
        setActionSuccess(`Tạo mới dịch vụ "${saved.name}" thành công!`)
      }
      return { success: true, data: saved }
    } catch (err) {
      const msg = getServiceActionErrorMessage(err)
      setActionError(msg)
      return { success: false, error: msg }
    } finally {
      setActionLoading(false)
    }
  }, [token])

  // Danh sách danh mục độc nhất
  const categories = useMemo(() => {
    const set = new Set()
    for (const s of services) {
      if (s.category) set.add(s.category.trim())
    }
    return ['Tất cả', ...Array.from(set)]
  }, [services])

  // Lọc theo danh mục và tìm kiếm
  const filteredServices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return services.filter((s) => {
      const matchCat =
        selectedCategory === 'Tất cả' || s.category?.toLowerCase() === selectedCategory.toLowerCase()
      if (!matchCat) return false
      if (!q) return true
      return (
        s.name?.toLowerCase().includes(q) ||
        s.id?.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q)
      )
    })
  }, [services, selectedCategory, searchQuery])

  // Thống kê
  const stats = useMemo(() => {
    const total = services.length
    const activeCount = services.filter((s) => s.isActive).length
    const inactiveCount = total - activeCount
    return { total, activeCount, inactiveCount }
  }, [services])

  return {
    services,
    filteredServices,
    loading,
    refreshing,
    error,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    categories,
    stats,
    actionLoading,
    actionError,
    actionSuccess,
    clearActionFeedback,
    reload,
    refresh,
    toggleActive,
    saveService,
  }
}


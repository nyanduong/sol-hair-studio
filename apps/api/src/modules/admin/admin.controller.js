import * as authService from '../auth/auth.service.js'
import * as servicesService from '../services/services.service.js'
import { getAdminTokenFromRequest } from './admin.middleware.js'

export async function renderLogin(req, res) {
  const token = getAdminTokenFromRequest(req)
  if (token) {
    try {
      const identity = await authService.authenticate(token)
      if (identity?.roles?.includes('owner')) {
        return res.redirect('/admin/services')
      }
    } catch {
      // Token invalid or expired, continue to login page
    }
  }

  let errorMessage = null
  if (req.query.error === 'forbidden') {
    errorMessage = 'Tài khoản không có quyền Quản trị viên (Chủ tiệm).'
  } else if (req.query.error === 'session_expired') {
    errorMessage = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
  }

  return res.render('admin/login', {
    title: 'Đăng nhập Quản trị viên — Sol Hair Studio',
    errorMessage,
    email: '',
  })
}

export async function handleLogin(req, res) {
  const { email, password } = req.body || {}

  if (!email || !password) {
    return res.render('admin/login', {
      title: 'Đăng nhập Quản trị viên — Sol Hair Studio',
      errorMessage: 'Vui lòng nhập đầy đủ email và mật khẩu.',
      email: email || '',
    })
  }

  try {
    const result = await authService.login({ email, password, ip: req.ip })
    const roles = result.account?.roles || []
    if (!roles.includes('owner')) {
      return res.render('admin/login', {
        title: 'Đăng nhập Quản trị viên — Sol Hair Studio',
        errorMessage: 'Tài khoản này không có quyền Quản trị viên (Chủ tiệm).',
        email,
      })
    }

    res.cookie('sol_admin_token', result.token, {
      httpOnly: true,
      path: '/',
      maxAge: 8 * 60 * 60 * 1000,
      sameSite: 'lax',
    })

    return res.redirect('/admin/services')
  } catch (error) {
    return res.render('admin/login', {
      title: 'Đăng nhập Quản trị viên — Sol Hair Studio',
      errorMessage: error.message || 'Email hoặc mật khẩu không chính xác.',
      email,
    })
  }
}

export async function handleLogout(req, res) {
  if (req.identity) {
    try {
      await authService.logout(req.identity)
    } catch {
      // Best-effort logout
    }
  }

  res.clearCookie('sol_admin_token', { path: '/' })
  return res.redirect('/admin/login')
}

export async function renderServices(req, res) {
  try {
    const allServices = await servicesService.listManageServices(req.identity)

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : 'all'
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : 'all'

    let filtered = [...allServices]

    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter((s) =>
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.id && s.id.toLowerCase().includes(q)) ||
        (s.slug && s.slug.toLowerCase().includes(q)),
      )
    }

    if (category && category !== 'all') {
      filtered = filtered.filter((s) => s.category === category)
    }

    if (status === 'active') {
      filtered = filtered.filter((s) => s.isActive)
    } else if (status === 'inactive') {
      filtered = filtered.filter((s) => !s.isActive)
    }

    const categories = Array.from(new Set(allServices.map((s) => s.category).filter(Boolean)))

    const stats = {
      total: allServices.length,
      activeCount: allServices.filter((s) => s.isActive).length,
      inactiveCount: allServices.filter((s) => !s.isActive).length,
    }

    return res.render('admin/services', {
      title: 'Quản lý Dịch vụ — Sol Hair Studio Admin',
      services: filtered,
      allServices,
      stats,
      categories,
      currentCategory: category,
      currentSearch: search,
      currentStatus: status,
      success: req.query.success || null,
      error: req.query.error || null,
      identity: req.identity,
    })
  } catch (error) {
    return res.status(500).send(`Lỗi hệ thống: ${error.message}`)
  }
}

export async function createServiceAction(req, res) {
  try {
    const {
      id,
      name,
      category,
      description,
      priceVnd,
      durationMin,
      durationMax,
      bookingDurationMinutes,
      imageUrl,
      imageDataUrl,
      isActive,
      displayOrder,
    } = req.body || {}

    let finalImageUrl = (imageUrl || '').trim()
    let coverImageId

    if (imageDataUrl && imageDataUrl.startsWith('data:image/')) {
      const uploadRes = await servicesService.uploadOrRegisterImage(req.identity, {
        payload: imageDataUrl,
        alt: name,
        category: category || 'services',
      })
      finalImageUrl = uploadRes.url
      coverImageId = uploadRes.id
    } else if (finalImageUrl && !finalImageUrl.startsWith('https://res.cloudinary.com/')) {
      try {
        const uploadRes = await servicesService.uploadOrRegisterImage(req.identity, {
          payload: finalImageUrl,
          alt: name,
          category: category || 'services',
        })
        finalImageUrl = uploadRes.url
        coverImageId = uploadRes.id
      } catch {
        throw new Error('Không thể tải ảnh này lên salon. Bạn vui lòng bấm "Chọn ảnh từ thiết bị" để tải ảnh trực tiếp.')
      }
    }

    if (!finalImageUrl) {
      throw new Error('Vui lòng chọn hình ảnh dịch vụ từ thiết bị của bạn.')
    }

    const input = {
      id: id ? id.trim() : undefined,
      name: name ? name.trim() : '',
      category: category ? category.trim() : '',
      description: description ? description.trim() : '',
      priceVnd: priceVnd !== undefined && priceVnd !== '' ? Number(priceVnd) : undefined,
      durationMinutes: {
        min: Number(durationMin),
        max: Number(durationMax || durationMin),
      },
      bookingDurationMinutes: bookingDurationMinutes
        ? Number(bookingDurationMinutes)
        : Number(durationMax || durationMin),
      imageUrl: finalImageUrl || undefined,
      coverImageId: coverImageId || undefined,
      isActive: isActive === 'true' || isActive === 'on' || isActive === true,
      displayOrder: displayOrder !== undefined && displayOrder !== '' ? Number(displayOrder) : 0,
    }

    await servicesService.createService(req.identity, input)
    return res.redirect('/admin/services?success=created')
  } catch (error) {
    let msg = error.message || 'Không thể tạo dịch vụ.'
    if (error.code === 'INVALID_IMAGE_URL' || msg.includes('cloudinary') || msg.includes('res.cloudinary.com')) {
      msg = 'Hình ảnh dịch vụ không hợp lệ. Vui lòng bấm "Chọn ảnh từ thiết bị" để tải ảnh lên.'
    }
    return res.redirect(`/admin/services?error=${encodeURIComponent(msg)}`)
  }
}

export async function updateServiceAction(req, res) {
  try {
    const { id } = req.params
    const {
      name,
      category,
      description,
      priceVnd,
      durationMin,
      durationMax,
      bookingDurationMinutes,
      imageUrl,
      imageDataUrl,
      isActive,
      displayOrder,
    } = req.body || {}

    let finalImageUrl = imageUrl ? imageUrl.trim() : undefined
    let coverImageId

    if (imageDataUrl && imageDataUrl.startsWith('data:image/')) {
      const uploadRes = await servicesService.uploadOrRegisterImage(req.identity, {
        payload: imageDataUrl,
        alt: name,
        category: category || 'services',
      })
      finalImageUrl = uploadRes.url
      coverImageId = uploadRes.id
    } else if (finalImageUrl && !finalImageUrl.startsWith('https://res.cloudinary.com/')) {
      try {
        const uploadRes = await servicesService.uploadOrRegisterImage(req.identity, {
          payload: finalImageUrl,
          alt: name,
          category: category || 'services',
        })
        finalImageUrl = uploadRes.url
        coverImageId = uploadRes.id
      } catch {
        throw new Error('Không thể tải ảnh này lên salon. Bạn vui lòng bấm "Thay ảnh từ thiết bị" để tải ảnh mới.')
      }
    }

    const updates = {}
    if (name !== undefined) updates.name = name.trim()
    if (category !== undefined) updates.category = category.trim()
    if (description !== undefined) updates.description = description.trim()
    if (priceVnd !== undefined && priceVnd !== '') updates.priceVnd = Number(priceVnd)
    if (durationMin !== undefined && durationMin !== '') {
      updates.durationMinutes = {
        min: Number(durationMin),
        max: Number(durationMax || durationMin),
      }
    }
    if (bookingDurationMinutes !== undefined && bookingDurationMinutes !== '') {
      updates.bookingDurationMinutes = Number(bookingDurationMinutes)
    }
    if (finalImageUrl) updates.imageUrl = finalImageUrl
    if (coverImageId) updates.coverImageId = coverImageId
    if (isActive !== undefined) {
      updates.isActive = isActive === 'true' || isActive === 'on' || isActive === true
    }
    if (displayOrder !== undefined && displayOrder !== '') {
      updates.displayOrder = Number(displayOrder)
    }

    await servicesService.updateService(req.identity, id, updates)
    return res.redirect('/admin/services?success=updated')
  } catch (error) {
    let msg = error.message || 'Không thể cập nhật dịch vụ.'
    if (error.code === 'INVALID_IMAGE_URL' || msg.includes('cloudinary') || msg.includes('res.cloudinary.com')) {
      msg = 'Hình ảnh dịch vụ không hợp lệ. Vui lòng bấm "Thay ảnh từ thiết bị" để tải ảnh mới.'
    }
    return res.redirect(`/admin/services?error=${encodeURIComponent(msg)}`)
  }
}

export async function toggleServiceStatusAction(req, res) {
  try {
    const { id } = req.params
    let targetActive

    if (req.body && req.body.isActive !== undefined) {
      targetActive = req.body.isActive === 'true' || req.body.isActive === '1'
    } else {
      const existing = await servicesService.getServiceDetail(id)
      targetActive = !existing.isActive
    }

    await servicesService.updateService(req.identity, id, { isActive: targetActive })
    return res.redirect('/admin/services?success=toggled')
  } catch (error) {
    return res.redirect(`/admin/services?error=${encodeURIComponent(error.message)}`)
  }
}


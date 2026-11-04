import { listCategoryManagement, createCategory, updateCategory } from '../services/categories.service.js'
export async function renderCategories(req, res, next) {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
    const status = ['active', 'inactive'].includes(req.query.status) ? req.query.status : 'all'
    const allCategories = await listCategoryManagement(req.identity)
    const stats = {
      all: allCategories.length,
      active: allCategories.filter(category => category.isActive).length,
      inactive: allCategories.filter(category => !category.isActive).length,
    }
    const searchKey = search.toLocaleLowerCase('vi-VN')
    const filtered = allCategories
      .filter(category => !searchKey || category.name.toLocaleLowerCase('vi-VN').includes(searchKey))
      .filter(category => status === 'all' || (status === 'active' ? category.isActive : !category.isActive))
    const pageSize = [5, 10, 20].includes(Number(req.query.pageSize)) ? Number(req.query.pageSize) : 5
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
    const requestedPage = Number(req.query.page)
    const page = Math.min(totalPages, Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1)
    const pages = []
    for (let number = 1; number <= totalPages; number++) {
      if (number === 1 || number === totalPages || Math.abs(number - page) <= 1) {
        if (pages.length && number - pages.at(-1) > 1) pages.push('…')
        pages.push(number)
      }
    }
    const pagination = { page, totalPages, pages, total: filtered.length, start: filtered.length ? (page - 1) * pageSize + 1 : 0, end: Math.min(page * pageSize, filtered.length) }
    pagination.pageSize = pageSize
    const pageUrl = number => '/admin/service-categories?' + new URLSearchParams({ search, status, page: String(number), pageSize: String(pageSize) })
    const categories = filtered.slice((page - 1) * pageSize, page * pageSize)
      .map(category => ({
        ...category,
        updatedLabel: category.updatedAt
          ? new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(category.updatedAt))
          : '—',
      }))
    res.render('admin/categories', {
      title: 'Danh mục dịch vụ', activeTab: 'categories', identity: req.identity,
      categories, stats, pagination, pageUrl, currentSearch: search, currentStatus: status,
      error: req.query.error || '', success: req.query.success || '',
    })
  } catch (error) { next(error) }
}
export async function categoryAction(req, res) {
  try {
    if (req.params.id) await updateCategory(req.identity, req.params.id, { ...(req.body.name !== undefined ? { name: req.body.name } : {}), ...(req.body.isActive !== undefined ? { isActive: req.body.isActive === 'true' } : {}) })
    else await createCategory(req.identity, { name: req.body.name })
    res.redirect(303, '/admin/service-categories?success=1')
  } catch (error) { res.redirect(303, '/admin/service-categories?error=' + encodeURIComponent(error.message)) }
}

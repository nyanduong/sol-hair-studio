import { listCategories, createCategory, updateCategory, importLegacyCategories } from '../services/categories.service.js'
export async function renderCategories(req, res, next) {
  try { res.render('admin/categories', { title: 'Danh mục dịch vụ', activeTab: 'categories', identity: req.identity, categories: await listCategories(req.identity), error: req.query.error || '', success: req.query.success || '' }) } catch (error) { next(error) }
}
export async function categoryAction(req, res) {
  try {
    if (req.params.id) await updateCategory(req.identity, req.params.id, { ...(req.body.name !== undefined ? { name: req.body.name } : {}), ...(req.body.isActive !== undefined ? { isActive: req.body.isActive === 'true' } : {}) })
    else if (req.path.endsWith('/import')) await importLegacyCategories(req.identity)
    else await createCategory(req.identity, { name: req.body.name })
    res.redirect(303, '/admin/service-categories?success=1')
  } catch (error) { res.redirect(303, '/admin/service-categories?error=' + encodeURIComponent(error.message)) }
}

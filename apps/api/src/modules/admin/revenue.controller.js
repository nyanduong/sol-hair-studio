import { getRevenueFilters, getRevenueReport } from './revenue.service.js'

export async function renderRevenue(req, res, next) {
  let filters
  try {
    filters = getRevenueFilters(req.query)
  } catch (error) {
    if (!(error instanceof RangeError)) return next(error)
    return res.status(400).render('admin/revenue', {
      title: 'Báo cáo doanh thu — Sol Hair Studio', activeTab: 'revenue',
      filters: getRevenueFilters({}), report: null, error: error.message,
    })
  }
  try {
    const report = await getRevenueReport(filters)
    return res.render('admin/revenue', {
      title: 'Báo cáo doanh thu — Sol Hair Studio', activeTab: 'revenue', filters, report, error: null,
    })
  } catch (error) {
    // Log only error type; never expose database details in the page.
    console.error('Không thể tải báo cáo doanh thu:', error.name)
    return res.status(503).render('admin/revenue', {
      title: 'Báo cáo doanh thu — Sol Hair Studio', activeTab: 'revenue', filters, report: null,
      error: 'Chưa thể tải báo cáo doanh thu. Vui lòng thử lại sau.',
    })
  }
}

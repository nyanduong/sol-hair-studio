import { AppointmentModel } from '../appointments/appointments.model.js'
import { getSalonTodayDate } from './admin.service.js'

const DAY = 86_400_000
const dateAtUtc = value => new Date(value + 'T00:00:00.000Z')
const isoDate = value => value.toISOString().slice(0, 10)

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(dateAtUtc(value).getTime()) && isoDate(dateAtUtc(value)) === value
    && value >= '2000-01-01' && value <= '2100-12-31'
}

export function getRevenueFilters(query, today = getSalonTodayDate()) {
  const range = query.range ?? 'week'
  const group = query.group ?? 'day'
  if (!['today', 'week', 'month', 'custom'].includes(range) || !['day', 'month'].includes(group)) {
    throw new RangeError('Bộ lọc thời gian không hợp lệ.')
  }
  let from = today
  let to = today
  if (range === 'week') from = isoDate(new Date(dateAtUtc(today).getTime() - 6 * DAY))
  if (range === 'month') from = today.slice(0, 8) + '01'
  if (range === 'custom') {
    from = query.from
    to = query.to
  }
  if (!validDate(from) || !validDate(to) || from > to) {
    throw new RangeError('Vui lòng chọn ngày bắt đầu và kết thúc hợp lệ, theo đúng thứ tự.')
  }
  if ((dateAtUtc(to) - dateAtUtc(from)) / DAY >= 366) {
    throw new RangeError('Vui lòng chọn khoảng thời gian tối đa 366 ngày.')
  }
  return { range, group, from, to }
}

export async function getRevenueReport(filters) {
  const [result] = await AppointmentModel.aggregate([
    { $match: { status: 'completed', localDate: { $gte: filters.from, $lte: filters.to } } },
    { $facet: {
      summary: [{ $group: { _id: null, revenueVnd: { $sum: '$totalPriceVnd' }, count: { $sum: 1 } } }],
      periods: [
        { $group: { _id: filters.group === 'month' ? { $substrBytes: ['$localDate', 0, 7] } : '$localDate', revenueVnd: { $sum: '$totalPriceVnd' }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ],
      services: [
        { $unwind: '$items' },
        { $group: { _id: '$items.serviceId', name: { $last: '$items.name' }, count: { $sum: 1 }, revenueVnd: { $sum: '$items.priceVnd' } } },
        { $sort: { revenueVnd: -1, _id: 1 } },
      ],
    } },
  ])
  const summary = result?.summary[0] ?? { revenueVnd: 0, count: 0 }
  const periodMap = new Map((result?.periods ?? []).map(item => [item._id, item]))
  const periods = []
  for (let cursor = dateAtUtc(filters.from); isoDate(cursor) <= filters.to; cursor = new Date(cursor.getTime() + DAY)) {
    const key = isoDate(cursor).slice(0, filters.group === 'month' ? 7 : 10)
    if (periods.at(-1)?.key === key) continue
    periods.push({ key, revenueVnd: periodMap.get(key)?.revenueVnd ?? 0, count: periodMap.get(key)?.count ?? 0 })
  }
  return {
    revenueVnd: summary.revenueVnd,
    count: summary.count,
    averageVnd: summary.count ? Math.round(summary.revenueVnd / summary.count) : 0,
    periods,
    services: (result?.services ?? []).map(item => ({ ...item, share: summary.revenueVnd ? item.revenueVnd / summary.revenueVnd * 100 : 0 })),
  }
}

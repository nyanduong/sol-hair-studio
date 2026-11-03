import { AppointmentModel } from '../appointments/appointments.model.js'
import { ServiceModel } from '../services/services.model.js'
import { StaffModel } from '../staff/staff.model.js'

const localDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function getSalonTodayDate() {
  const parts = Object.fromEntries(
    localDateFormatter.formatToParts(new Date()).map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

export async function getDashboardData() {
  const todayStr = getSalonTodayDate()

  // 1. Lấy danh sách lịch hẹn hôm nay
  const todayAppointments = await AppointmentModel.find({ localDate: todayStr })
    .sort({ startAt: 1 })
    .lean()

  // 2. Chạy đồng thời các truy vấn thống kê
  const [
    statusAgg,
    revenueAgg,
    topServicesAgg,
    activeServicesCount,
    totalServicesCount,
    activeStaffCount,
  ] = await Promise.all([
    // Thống kê theo trạng thái toàn thời gian
    AppointmentModel.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    // Tổng doanh thu từ các lịch hoàn thành
    AppointmentModel.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, totalRevenue: { $sum: '$totalPriceVnd' } } },
    ]),
    // Top 5 dịch vụ được đặt nhiều nhất
    AppointmentModel.aggregate([
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.name',
          serviceId: { $first: '$items.serviceId' },
          count: { $sum: 1 },
          totalRevenue: { $sum: '$items.priceVnd' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]),
    // Số dịch vụ đang kích hoạt
    ServiceModel.countDocuments({ isActive: true }),
    // Tổng số dịch vụ
    ServiceModel.countDocuments(),
    // Số nhân viên đang làm việc
    StaffModel.countDocuments({ isActive: true }),
  ])

  // Chuẩn hóa status map
  const statusMap = {
    confirmed: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
    no_show: 0,
  }

  let totalAppointments = 0
  for (const item of statusAgg) {
    if (statusMap[item._id] !== undefined) {
      statusMap[item._id] = item.count
    }
    totalAppointments += item.count
  }

  const totalRevenueVnd = revenueAgg[0]?.totalRevenue || 0

  // Thống kê riêng cho ngày hôm nay
  const todayStats = {
    total: todayAppointments.length,
    completed: todayAppointments.filter((a) => a.status === 'completed').length,
    confirmed: todayAppointments.filter((a) => a.status === 'confirmed').length,
    inProgress: todayAppointments.filter((a) => a.status === 'in_progress').length,
    cancelled: todayAppointments.filter((a) => a.status === 'cancelled' || a.status === 'no_show').length,
    revenueVnd: todayAppointments
      .filter((a) => a.status === 'completed')
      .reduce((sum, a) => sum + (a.totalPriceVnd || 0), 0),
  }

  return {
    todayStr,
    todayStats,
    todayAppointments,
    totalRevenueVnd,
    totalAppointments,
    statusMap,
    topServices: topServicesAgg,
    activeServicesCount,
    totalServicesCount,
    activeStaffCount,
  }
}


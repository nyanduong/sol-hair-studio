import { fetchServices } from '../../services/api/services.api.js'
import * as api from './staff.api.js'

// SOL-018 sẽ cung cấp token; client không tự lưu hay tạo phiên.
export function createStaffClient(baseUrl, token, { fetchImpl } = {}) {
  return {
    listStaff: (signal) => api.listStaff(baseUrl, token, { signal, fetchImpl }),
    listServices: (signal) => fetchServices(baseUrl, { signal, fetchImpl }),
    listShifts: (staffId, fromDate, toDate, signal) => api.listShifts(baseUrl, token, staffId, { fromDate, toDate, signal, fetchImpl }),
    createStaff: (input, signal) => api.createStaff(baseUrl, token, input, { signal, fetchImpl }),
    updateStaff: (id, input, signal) => api.updateStaff(baseUrl, token, id, input, { signal, fetchImpl }),
    createShift: (id, input, signal) => api.createShift(baseUrl, token, id, input, { signal, fetchImpl }),
    updateShift: (id, shiftId, input, signal) => api.updateShift(baseUrl, token, id, shiftId, input, { signal, fetchImpl }),
    cancelShift: (id, shiftId, signal) => api.cancelShift(baseUrl, token, id, shiftId, { signal, fetchImpl }),
  }
}

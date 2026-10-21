import { HttpError } from '../../../lib/http.js'
import { initialStaff, services, weekStart } from '../demo.js'

// Bản mẫu mô phỏng DTO và lỗi API; không truy cập hoặc lưu dữ liệu thật.
export function createDemoStaffClient(today) {
  const start = weekStart(today)
  const catalog = services.map((name, index) => ({ id: String(index), name }))
  let people = initialStaff.map((item) => ({ staffId: item.id, displayName: item.name, isActive: item.active, serviceIds: item.services.map(String), email: item.email, owner: item.owner }))
  let shifts = [{ shiftId: 'sample-shift', staffId: 'owner', localDate: start, startAt: `${start}T09:00:00+07:00`, endAt: `${start}T17:00:00+07:00`, status: 'active' }]
  const appointments = [{ appointmentId: 'sample-appointment', staffId: 'owner', localDate: start, startAt: `${start}T10:00:00+07:00`, endAt: `${start}T11:00:00+07:00`, occupiedFrom: `${start}T10:00:00+07:00`, occupiedUntil: `${start}T11:10:00+07:00`, status: 'confirmed' }]
  const wait = (signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve() }, 120)
    function abort() { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }
    signal?.addEventListener('abort', abort, { once: true })
  })
  const conflict = (items) => { throw new HttpError(409, { code: 'APPOINTMENT_CONFLICT', conflicts: items }) }
  const affected = (staffId, shift, next) => appointments.filter((item) => item.staffId === staffId && (!shift || (new Date(item.occupiedFrom) >= new Date(shift.startAt) && new Date(item.occupiedUntil) <= new Date(shift.endAt))) && (!next || new Date(item.occupiedFrom) < new Date(next.startAt) || new Date(item.occupiedUntil) > new Date(next.endAt)))
  function checkOverlap(staffId, next, exclude) {
    if (shifts.some((item) => item.staffId === staffId && item.shiftId !== exclude && item.status === 'active' && new Date(next.startAt) < new Date(item.endAt) && new Date(next.endAt) > new Date(item.startAt))) {
      throw new HttpError(409, { code: 'SHIFT_OVERLAP' })
    }
  }
  return {
    async listStaff(signal) { await wait(signal); return structuredClone(people) },
    async listServices(signal) { await wait(signal); return structuredClone(catalog) },
    async listShifts(id, from, to, signal) { await wait(signal); return structuredClone(shifts.filter((item) => item.staffId === id && item.localDate >= from && item.localDate <= to)) },
    async createStaff(input, signal) {
      await wait(signal)
      if (people.some((item) => item.email?.toLowerCase() === input.email.toLowerCase())) throw new HttpError(409, { code: 'STAFF_ALREADY_EXISTS' })
      const person = { staffId: crypto.randomUUID(), displayName: input.displayName, email: input.email, serviceIds: input.serviceIds, isActive: true }
      people = [...people, person]; return structuredClone(person)
    },
    async updateStaff(id, input, signal) {
      await wait(signal)
      if (input.isActive === false) { const found = affected(id); if (found.length) conflict(found) }
      people = people.map((item) => item.staffId === id ? { ...item, ...input } : item)
      return structuredClone(people.find((item) => item.staffId === id))
    },
    async createShift(id, input, signal) {
      await wait(signal); checkOverlap(id, input)
      const shift = { ...input, staffId: id, shiftId: crypto.randomUUID(), status: 'active' }
      shifts = [...shifts, shift]; return structuredClone(shift)
    },
    async updateShift(id, shiftId, input, signal) {
      await wait(signal)
      const old = shifts.find((item) => item.staffId === id && item.shiftId === shiftId)
      const next = { ...old, ...input }; checkOverlap(id, next, shiftId)
      const found = affected(id, old, next); if (found.length) conflict(found)
      shifts = shifts.map((item) => item.shiftId === shiftId ? next : item); return structuredClone(next)
    },
    async cancelShift(id, shiftId, signal) {
      await wait(signal)
      const old = shifts.find((item) => item.staffId === id && item.shiftId === shiftId)
      const found = affected(id, old); if (found.length) conflict(found)
      shifts = shifts.map((item) => item.shiftId === shiftId ? { ...item, status: 'cancelled' } : item)
      return structuredClone(shifts.find((item) => item.shiftId === shiftId))
    },
  }
}

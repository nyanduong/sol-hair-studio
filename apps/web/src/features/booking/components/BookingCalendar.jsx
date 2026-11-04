import { useState } from 'react'

export default function BookingCalendar({ value, min, max, onChange }) {
  const [month, setMonth] = useState(value.slice(0, 7))
  const first = new Date(`${month}-01T00:00:00Z`)
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  const offset = (first.getUTCDay() + 6) % 7
  function adjacent(delta) {
    return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + delta, 1)).toISOString().slice(0, 7)
  }
  return <div className="mt-4 rounded-2xl border border-border p-4">
    <div className="mb-3 flex items-center justify-between">
      <button type="button" aria-label="Tháng trước" disabled={adjacent(-1) < min.slice(0, 7)} onClick={() => setMonth(adjacent(-1))} className="size-11 rounded-lg disabled:opacity-25">‹</button>
      <h3 className="font-semibold">Tháng {first.getUTCMonth() + 1}, {first.getUTCFullYear()}</h3>
      <button type="button" aria-label="Tháng sau" disabled={adjacent(1) > max.slice(0, 7)} onClick={() => setMonth(adjacent(1))} className="size-11 rounded-lg disabled:opacity-25">›</button>
    </div>
    <div className="grid grid-cols-7 gap-1 text-center text-sm">
      {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(day => <span key={day} className="py-2 text-xs text-muted">{day}</span>)}
      {Array.from({ length: offset }, (_, i) => <span key={`blank-${i}`} />)}
      {Array.from({ length: days }, (_, i) => {
        const date = `${month}-${String(i + 1).padStart(2, '0')}`
        return <button type="button" key={date} aria-label={date} aria-pressed={date === value} disabled={date < min || date > max} onClick={() => onChange(date)} className={`min-h-11 rounded-lg disabled:opacity-25 ${date === value ? 'bg-terracotta text-white' : 'hover:bg-soft-surface'}`}>{i + 1}</button>
      })}
    </div>
  </div>
}

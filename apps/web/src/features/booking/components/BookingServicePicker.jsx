import { useState } from 'react'
import BookingServiceCard from './BookingServiceCard.jsx'
import { filterBookingServices, serviceCategory } from '../service-catalog.js'

export default function BookingServicePicker({ services, selectedIds, onChange, onViewSelection }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const categories = [...new Set(services.map(serviceCategory))]
  const selected = services.filter((service) => selectedIds.includes(service.id))
  const visible = filterBookingServices(services, query, category)
  function clearFilters() {
    setQuery('')
    setCategory('')
  }
  return (
    <>
      <label className="relative block">
        <span className="sr-only">Tìm dịch vụ</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="pointer-events-none absolute left-3 top-3 size-5 text-muted"
        >
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm dịch vụ…"
          className="min-h-11 w-full rounded-xl border border-border bg-white py-2 pl-10 pr-3 text-sm outline-terracotta"
        />
      </label>
      <div
        role="group"
        aria-label="Nhóm dịch vụ"
        className="-mx-1 mt-3 flex gap-2 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {[['', 'Tất cả'], ...categories.map((item) => [item, item])].map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={category === value}
            onClick={() => setCategory(value)}
            className={`min-h-11 shrink-0 rounded-full border px-4 py-2 text-xs ${category === value ? 'border-terracotta bg-terracotta text-white' : 'border-border bg-white text-muted hover:border-terracotta'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="my-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-semibold" aria-live="polite">
          Đã chọn {selectedIds.length}/5
        </span>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={onViewSelection}
            className="min-h-11 text-xs text-terracotta underline underline-offset-4 lg:hidden"
          >
            Xem lựa chọn
          </button>
        )}
        <span role="status" className="ml-auto text-xs sm:order-last text-muted">
          {visible.length}
          {query || category ? ` / ${services.length}` : ''} dịch vụ
        </span>
        <div className="flex w-full flex-wrap gap-2 sm:contents">
          {selected.map((service) => (
            <button
              key={service.id}
              type="button"
              aria-label={`Bỏ chọn ${service.name}`}
              onClick={() => onChange(service.id)}
              className="flex min-h-11 max-w-full items-center gap-2 rounded-full bg-terracotta/10 px-3 py-2 text-left text-xs text-terracotta"
            >
              <span className="min-w-0 break-words">{service.name}</span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      </div>
      {visible.length === 0 && services.length > 0 && (
        <div className="rounded-xl bg-soft-surface p-5 text-sm">
          <p>Không tìm thấy dịch vụ phù hợp.</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-2 min-h-11 font-semibold text-terracotta"
          >
            Xóa bộ lọc
          </button>
        </div>
      )}
      <div className="grid gap-2.5">
        {visible.map((service) => (
          <BookingServiceCard
            key={service.id}
            service={service}
            selected={selectedIds.includes(service.id)}
            onChange={() => onChange(service.id)}
          />
        ))}
      </div>
    </>
  )
}

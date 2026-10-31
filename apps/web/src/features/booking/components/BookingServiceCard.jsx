import { useState } from 'react'
import { formatDuration, formatPrice } from '../../services/format-service.js'

export function BookingServiceImage({ service, className }) {
  const [failedUrl, setFailedUrl] = useState(null)
  return (
    <div className={`overflow-hidden bg-soft-surface ${className}`}>
      {service.imageUrl && failedUrl !== service.imageUrl ? (
        <img
          src={service.imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailedUrl(service.imageUrl)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-full items-center justify-center font-display text-2xl text-terracotta"
        >
          Sol
        </span>
      )}
    </div>
  )
}

export default function BookingServiceCard({ service, selected, onChange }) {
  return (
    <label
      className={`group flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-terracotta sm:gap-4 ${selected ? 'border-terracotta bg-terracotta/5' : 'border-border hover:border-terracotta/50'}`}
    >
      <BookingServiceImage
        service={service}
        className="h-20 w-20 shrink-0 rounded-lg sm:h-24 sm:w-32"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-2 xl:flex-row xl:items-center xl:gap-4">
        <span className="min-w-0 flex-1">
          <span className="block font-display text-xl leading-tight sm:text-2xl">
            {service.name}
          </span>
          <span className="mt-1 hidden text-xs leading-5 text-muted sm:line-clamp-2">
            {service.description}
          </span>
        </span>
        <span className="shrink-0 xl:border-l xl:border-border xl:pl-4">
          <span className="block text-sm font-semibold text-terracotta">
            {formatPrice(service.priceVnd)}
          </span>
          <span className="mt-1 block text-xs text-muted">
            {formatDuration(service.durationMinutes)}
          </span>
        </span>
      </span>
      <input
        type="checkbox"
        aria-label={service.name}
        checked={selected}
        onChange={onChange}
        className="size-5 shrink-0 accent-terracotta"
      />
    </label>
  )
}

import { useState } from 'react'
import { formatDuration, formatPrice } from '../format-service.js'

export default function ServiceCard({ service }) {
  const [failedImageUrl, setFailedImageUrl] = useState(null)

  return (
    <article className="flex h-full min-w-0 flex-col rounded-2xl border border-border/60 bg-white p-2 shadow-[0_4px_16px_rgba(71,51,39,0.04)]">
      <div className="aspect-[2.25] overflow-hidden rounded-xl bg-soft-surface">
        {failedImageUrl === service.imageUrl ? (
          <div role="img" aria-label={`Chưa tải được ảnh ${service.name}`} className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-xs text-muted">
            <span aria-hidden="true" className="font-display text-3xl text-terracotta">Sol</span>
            <span>Ảnh dịch vụ chưa khả dụng</span>
          </div>
        ) : <img src={service.imageUrl} alt={service.name} onError={() => setFailedImageUrl(service.imageUrl)} loading="lazy" decoding="async" className="h-full w-full object-cover" />}
      </div>
      <div className="flex flex-1 flex-col px-2 pb-1 pt-3">
        <h3 className="font-display text-2xl font-medium leading-tight">{service.name}</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">{service.description}</p>
        <div className="mt-auto flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pt-4">
          <p className="text-sm font-semibold text-terracotta">{formatPrice(service.priceVnd)}</p>
          <p className="text-[0.65rem] text-muted">{formatDuration(service.durationMinutes)}</p>
        </div>
      </div>
    </article>
  )
}

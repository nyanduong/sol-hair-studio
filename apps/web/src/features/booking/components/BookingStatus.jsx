export default function BookingStatus({ query, label }) {
  if (query.kind === 'loading')
    return (
      <p role="status" className="py-4 text-sm text-muted">
        Đang tải {label}…
      </p>
    )
  if (query.kind === 'error')
    return (
      <div
        role="alert"
        className="my-3 rounded-xl border border-terracotta/40 bg-white p-4 text-sm"
      >
        <p>{query.error?.message || `Không tải được ${label}.`}</p>
        <button
          type="button"
          onClick={query.retry}
          className="mt-2 min-h-11 font-semibold text-terracotta"
        >
          Thử lại
        </button>
      </div>
    )
  return null
}

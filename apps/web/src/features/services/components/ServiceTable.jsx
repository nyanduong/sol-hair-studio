import { formatDuration, formatPrice } from '../format-service.js'

export default function ServiceTable({
  services = [],
  onEdit,
  onToggleActive,
  isActionBusy = false,
}) {
  if (services.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-white p-12 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-soft-surface text-stone-400">
          <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h3 className="mt-4 font-display text-lg font-semibold text-ink">Không có dịch vụ nào phù hợp</h3>
        <p className="mt-1 text-xs text-muted">
          Thử thay đổi bộ lọc tìm kiếm hoặc thêm dịch vụ mới vào danh mục của tiệm.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-white shadow-2xs">
      {/* ── Desktop View (Table) ── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#f3eee6] bg-[#faf7f2] text-stone-500 font-semibold uppercase tracking-wider text-[11px]">
              <th scope="col" className="py-3.5 pl-6 pr-3">Dịch vụ</th>
              <th scope="col" className="px-3 py-3.5">Danh mục</th>
              <th scope="col" className="px-3 py-3.5">Thời lượng</th>
              <th scope="col" className="px-3 py-3.5">Giá niêm yết</th>
              <th scope="col" className="px-3 py-3.5 text-center">Hiển thị</th>
              <th scope="col" className="py-3.5 pl-3 pr-6 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f3eee6]">
            {services.map((item) => (
              <tr
                key={item.id}
                className="hover:bg-soft-surface/50 transition-colors group"
              >
                {/* Cột 1: Ảnh + Tên + Mô tả */}
                <td className="py-4 pl-6 pr-3">
                  <div className="flex items-center gap-3.5">
                    <div className="size-12 shrink-0 overflow-hidden rounded-xl border border-border bg-[#faf7f2]">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="grid size-full place-items-center text-stone-300 text-xs font-bold">
                          SOL
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 max-w-xs">
                      <p className="font-semibold text-sm text-ink truncate">{item.name}</p>
                      <p className="font-mono text-[11px] text-muted truncate">ID: {item.id}</p>
                      {item.description && (
                        <p className="mt-0.5 text-stone-500 text-[11px] line-clamp-1">{item.description}</p>
                      )}
                    </div>
                  </div>
                </td>

                {/* Cột 2: Danh mục */}
                <td className="px-3 py-4 whitespace-nowrap">
                  <span className="inline-flex items-center rounded-full border border-border bg-[#faf7f2] px-2.5 py-1 text-[11px] font-medium text-stone-700">
                    {item.category || 'Mặc định'}
                  </span>
                </td>

                {/* Cột 3: Thời lượng */}
                <td className="px-3 py-4 whitespace-nowrap">
                  <p className="font-medium text-ink">{formatDuration(item.durationMinutes)}</p>
                  {item.bookingDurationMinutes && (
                    <p className="text-[10px] text-muted">Lịch: {item.bookingDurationMinutes} phút</p>
                  )}
                </td>

                {/* Cột 4: Giá tiền */}
                <td className="px-3 py-4 whitespace-nowrap font-sans font-bold text-sm text-terracotta">
                  {formatPrice(item.priceVnd)}
                </td>

                {/* Cột 5: Trạng thái & Toggle */}
                <td className="px-3 py-4 whitespace-nowrap text-center">
                  <div className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={item.isActive}
                      aria-label={`Bật hoặc ẩn dịch vụ ${item.name}`}
                      disabled={isActionBusy}
                      onClick={() => onToggleActive(item.id)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-terracotta disabled:opacity-50 ${
                        item.isActive ? 'bg-emerald-600' : 'bg-stone-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          item.isActive ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                        item.isActive
                          ? 'border-emerald-200/60 bg-emerald-50 text-emerald-800'
                          : 'border-stone-200/80 bg-stone-100 text-stone-600'
                      }`}
                    >
                      <span
                        className={`size-1.5 rounded-full ${item.isActive ? 'bg-emerald-500' : 'bg-stone-400'}`}
                      />
                      {item.isActive ? 'Hiển thị' : 'Đã ẩn'}
                    </span>
                  </div>
                </td>

                {/* Cột 6: Nút sửa */}
                <td className="py-4 pl-3 pr-6 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => onEdit(item)}
                    disabled={isActionBusy}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-white px-3 py-1.5 text-xs font-semibold text-ink shadow-2xs hover:bg-soft-surface hover:border-terracotta/40 transition-all disabled:opacity-50"
                  >
                    <svg className="size-3.5 text-terracotta" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                    Sửa
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mobile View (Cards) ── */}
      <div className="md:hidden divide-y divide-[#f3eee6]">
        {services.map((item) => (
          <div key={item.id} className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="size-16 shrink-0 overflow-hidden rounded-xl border border-border bg-[#faf7f2]">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.name} className="size-full object-cover" loading="lazy" />
                ) : (
                  <div className="grid size-full place-items-center text-stone-300 text-xs font-bold">SOL</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full border border-border bg-[#faf7f2] px-2 py-0.5 text-[10px] font-medium text-stone-600">
                    {item.category || 'Mặc định'}
                  </span>
                  <span className="font-sans font-bold text-sm text-terracotta">{formatPrice(item.priceVnd)}</span>
                </div>
                <h4 className="mt-1 font-semibold text-sm text-ink truncate">{item.name}</h4>
                <p className="font-mono text-[10px] text-muted">ID: {item.id}</p>
                {item.description && (
                  <p className="mt-1 text-stone-500 text-xs line-clamp-2">{item.description}</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#f3eee6] text-xs">
              <div className="text-muted">
                <span>{formatDuration(item.durationMinutes)}</span>
                {item.bookingDurationMinutes && <span> · Lịch {item.bookingDurationMinutes}p</span>}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={item.isActive}
                  aria-label={`Bật hoặc ẩn ${item.name}`}
                  disabled={isActionBusy}
                  onClick={() => onToggleActive(item.id)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-terracotta disabled:opacity-50 ${
                    item.isActive ? 'bg-emerald-600' : 'bg-stone-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      item.isActive ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>

                <button
                  type="button"
                  onClick={() => onEdit(item)}
                  disabled={isActionBusy}
                  className="rounded-xl border border-border bg-white px-3 py-1 text-xs font-semibold text-ink shadow-2xs hover:bg-soft-surface transition-colors"
                >
                  Sửa
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

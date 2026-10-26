import { useState } from 'react'
import { slugify } from '../format-service.js'
import ServiceImageUploader from './ServiceImageUploader.jsx'

const COMMON_CATEGORIES = [
  'Cắt & Tạo kiểu',
  'Uốn & Nhuộm',
  'Chăm sóc & Phục hồi',
  'Gội đầu & Massage',
  'Combo dịch vụ',
]

export default function ServiceFormModal({
  isOpen,
  service,
  categories = [],
  onClose,
  onSave,
  apiBaseUrl,
  token,
  isSubmitting = false,
}) {
  const isUpdate = Boolean(service?.id)

  const [id, setId] = useState(() => service?.id || '')
  const [name, setName] = useState(() => service?.name || '')
  const [category, setCategory] = useState(() => service?.category || categories[0] || COMMON_CATEGORIES[0])
  const [priceVnd, setPriceVnd] = useState(() => service?.priceVnd ?? 150000)
  const [durationMin, setDurationMin] = useState(() => {
    const dur = service?.durationMinutes
    if (typeof dur === 'object' && dur !== null) return dur.min ?? 30
    if (typeof dur === 'number') return dur
    return 30
  })
  const [durationMax, setDurationMax] = useState(() => {
    const dur = service?.durationMinutes
    if (typeof dur === 'object' && dur !== null) return dur.max ?? 45
    if (typeof dur === 'number') return dur
    return 45
  })
  const [bookingDurationMinutes, setBookingDurationMinutes] = useState(() => service?.bookingDurationMinutes ?? 45)
  const [description, setDescription] = useState(() => service?.description || '')
  const [isActive, setIsActive] = useState(() => service?.isActive ?? true)
  const [imageUrl, setImageUrl] = useState(() => service?.imageUrl || '')
  const [coverImageId, setCoverImageId] = useState(() => service?.coverImageId || null)

  const [idTouched, setIdTouched] = useState(() => Boolean(service?.id))
  const [validationError, setValidationError] = useState('')

  // Tự động gợi ý ID theo tên nếu người dùng chưa tự sửa ID
  function handleNameChange(e) {
    const val = e.target.value
    setName(val)
    if (!isUpdate && !idTouched) {
      setId(slugify(val))
    }
  }

  function handleDurationMinChange(e) {
    const val = Number(e.target.value)
    setDurationMin(val)
    if (durationMax < val) {
      setDurationMax(val)
    }
    if (bookingDurationMinutes < val) {
      setBookingDurationMinutes(val)
    }
  }

  function handleDurationMaxChange(e) {
    const val = Number(e.target.value)
    setDurationMax(val)
    if (bookingDurationMinutes > val) {
      setBookingDurationMinutes(val)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setValidationError('')

    const trimmedName = name.trim()
    const trimmedId = id.trim()
    const trimmedCat = category.trim()

    if (!trimmedName) {
      setValidationError('Vui lòng nhập tên dịch vụ.')
      return
    }

    if (!isUpdate) {
      if (!trimmedId) {
        setValidationError('Vui lòng nhập mã định danh (ID) dịch vụ.')
        return
      }
      if (!/^[a-z0-9-]+$/.test(trimmedId)) {
        setValidationError('Mã dịch vụ chỉ được chứa chữ thường không dấu, số và dấu gạch ngang (-).')
        return
      }
    }

    if (!trimmedCat) {
      setValidationError('Vui lòng chọn hoặc nhập danh mục dịch vụ.')
      return
    }

    const price = Number(priceVnd)
    if (isNaN(price) || price < 0 || price > 100_000_000) {
      setValidationError('Giá tiền phải là số hợp lệ từ 0 đến 100.000.000 VNĐ.')
      return
    }

    const dMin = Number(durationMin)
    const dMax = Number(durationMax)
    if (dMin < 1 || dMax < 1 || dMin > dMax || dMax > 480) {
      setValidationError('Thời lượng phải từ 1 đến 480 phút và thời lượng tối thiểu ≤ tối đa.')
      return
    }

    const bDur = Number(bookingDurationMinutes)
    if (bDur < dMin || bDur > dMax) {
      setValidationError(`Thời lượng đặt lịch (${bDur}p) phải nằm trong khoảng thời lượng min - max (${dMin}p - ${dMax}p).`)
      return
    }

    if (!imageUrl) {
      setValidationError('Cần cung cấp ảnh đại diện dịch vụ (tải ảnh lên hoặc dán link ảnh Cloudinary).')
      return
    }

    const payload = {
      name: trimmedName,
      category: trimmedCat,
      priceVnd: price,
      durationMinutes: { min: dMin, max: dMax },
      bookingDurationMinutes: bDur,
      description: description.trim(),
      isActive,
      imageUrl,
      coverImageId: coverImageId || null,
    }

    if (!isUpdate) {
      payload.id = trimmedId
    }

    await onSave(payload, isUpdate)
  }

  if (!isOpen) return null

  const categoryOptions = Array.from(new Set([...COMMON_CATEGORIES, ...categories]))

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="service-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-2xl rounded-3xl border border-border bg-canvas p-6 sm:p-8 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-border/70 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-terracotta">
              {isUpdate ? 'Cập nhật danh mục' : 'Thêm dịch vụ'}
            </p>
            <h2 id="service-modal-title" className="font-display text-2xl sm:text-3xl font-bold text-ink">
              {isUpdate ? `Sửa dịch vụ: ${service.name}` : 'Tạo dịch vụ mới'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="grid size-10 place-items-center rounded-full border border-border text-stone-500 hover:bg-soft-surface hover:text-ink transition-colors"
          >
            <span className="sr-only">Đóng modal</span>
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5 max-h-[75vh] overflow-y-auto px-1">
          {validationError && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-800">
              {validationError}
            </div>
          )}

          {/* Tên & Mã dịch vụ */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="service-name" className="block text-xs font-semibold uppercase tracking-wider text-muted">
                Tên dịch vụ <span className="text-rose-500">*</span>
              </label>
              <input
                id="service-name"
                type="text"
                required
                maxLength={120}
                placeholder="Ví dụ: Cắt tạo kiểu cao cấp"
                value={name}
                onChange={handleNameChange}
                disabled={isSubmitting}
                className="mt-1.5 w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm font-medium focus:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/15 transition-all"
              />
            </div>

            <div>
              <label htmlFor="service-id" className="block text-xs font-semibold uppercase tracking-wider text-muted">
                Mã định danh (ID) {isUpdate ? '(Cố định)' : <span className="text-rose-500">*</span>}
              </label>
              <input
                id="service-id"
                type="text"
                required
                disabled={isUpdate || isSubmitting}
                maxLength={80}
                placeholder="cat-tao-kieu-cao-cap"
                value={id}
                onChange={(e) => {
                  setId(e.target.value)
                  setIdTouched(true)
                }}
                className={`mt-1.5 w-full rounded-xl border border-border px-3.5 py-2.5 text-sm font-mono transition-all ${
                  isUpdate
                    ? 'bg-stone-100 text-stone-500 cursor-not-allowed'
                    : 'bg-white font-medium focus:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/15'
                }`}
              />
            </div>
          </div>

          {/* Danh mục & Giá */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="service-category" className="block text-xs font-semibold uppercase tracking-wider text-muted">
                Danh mục <span className="text-rose-500">*</span>
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id="service-category"
                  type="text"
                  required
                  list="category-suggestions"
                  placeholder="Chọn hoặc nhập danh mục"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm font-medium focus:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/15 transition-all"
                />
                <datalist id="category-suggestions">
                  {categoryOptions.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>
            </div>

            <div>
              <label htmlFor="service-price" className="block text-xs font-semibold uppercase tracking-wider text-muted">
                Giá dịch vụ (VNĐ) <span className="text-rose-500">*</span>
              </label>
              <input
                id="service-price"
                type="number"
                min="0"
                max="100000000"
                step="10000"
                required
                placeholder="150000"
                value={priceVnd}
                onChange={(e) => setPriceVnd(e.target.value)}
                disabled={isSubmitting}
                className="mt-1.5 w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm font-medium focus:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/15 transition-all"
              />
            </div>
          </div>

          {/* Thời lượng */}
          <div className="rounded-2xl border border-border bg-white p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Cấu hình thời lượng thực hiện (Phút)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="duration-min" className="block text-[11px] text-stone-600 font-medium">
                  Thời lượng tối thiểu
                </label>
                <input
                  id="duration-min"
                  type="number"
                  min="1"
                  max="480"
                  step="5"
                  required
                  value={durationMin}
                  onChange={handleDurationMinChange}
                  disabled={isSubmitting}
                  className="mt-1 w-full rounded-lg border border-border bg-[#faf7f2] px-3 py-1.5 text-xs font-medium focus:border-terracotta focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="duration-max" className="block text-[11px] text-stone-600 font-medium">
                  Thời lượng tối đa
                </label>
                <input
                  id="duration-max"
                  type="number"
                  min="1"
                  max="480"
                  step="5"
                  required
                  value={durationMax}
                  onChange={handleDurationMaxChange}
                  disabled={isSubmitting}
                  className="mt-1 w-full rounded-lg border border-border bg-[#faf7f2] px-3 py-1.5 text-xs font-medium focus:border-terracotta focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="booking-duration" className="block text-[11px] text-stone-600 font-medium">
                  Tính vào lịch hẹn
                </label>
                <input
                  id="booking-duration"
                  type="number"
                  min={durationMin}
                  max={durationMax}
                  step="5"
                  required
                  value={bookingDurationMinutes}
                  onChange={(e) => setBookingDurationMinutes(Number(e.target.value))}
                  disabled={isSubmitting}
                  className="mt-1 w-full rounded-lg border border-border bg-[#faf7f2] px-3 py-1.5 text-xs font-medium focus:border-terracotta focus:outline-none"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted">
              Thời lượng đặt lịch ({bookingDurationMinutes}p) là thời gian hệ thống sẽ chiếm chỗ trên lịch của Stylist khi khách đặt.
            </p>
          </div>

          {/* Mô tả */}
          <div>
            <label htmlFor="service-description" className="block text-xs font-semibold uppercase tracking-wider text-muted">
              Mô tả chi tiết dịch vụ
            </label>
            <textarea
              id="service-description"
              rows={3}
              maxLength={2000}
              placeholder="Quy trình gồm gội, tạo kiểu chuẩn form, tư vấn sản phẩm chăm sóc phù hợp…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
              className="mt-1.5 w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm font-medium focus:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/15 transition-all"
            />
          </div>

          {/* Uploader ảnh */}
          <ServiceImageUploader
            apiBaseUrl={apiBaseUrl}
            token={token}
            currentImageUrl={imageUrl}
            currentCoverImageId={coverImageId}
            disabled={isSubmitting}
            onImageUploaded={({ coverImageId: id, imageUrl: url }) => {
              setCoverImageId(id)
              setImageUrl(url)
            }}
          />

          {/* Công tắc hiển thị */}
          <div className="flex items-center justify-between rounded-2xl border border-border bg-[#faf7f2] p-4">
            <div>
              <p className="text-sm font-semibold text-ink">Hiển thị cho khách hàng</p>
              <p className="text-xs text-muted">
                {isActive
                  ? 'Dịch vụ đang xuất hiện công khai trên bảng giá và trang đặt lịch.'
                  : 'Dịch vụ đang ẩn đối với khách hàng (chỉ quản trị viên thấy).'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isActive}
              onClick={() => setIsActive((prev) => !prev)}
              disabled={isSubmitting}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-terracotta focus:ring-offset-2 ${
                isActive ? 'bg-emerald-600' : 'bg-stone-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  isActive ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Nút hành động */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-full border border-border px-5 py-2.5 text-xs font-semibold text-ink hover:bg-soft-surface transition-colors disabled:opacity-50"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-full bg-terracotta px-6 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-terracotta-dark transition-[transform,background-color] duration-200 motion-safe:hover:-translate-y-0.5 disabled:opacity-50"
            >
              {isSubmitting ? 'Đang lưu…' : isUpdate ? 'Cập nhật dịch vụ' : 'Thêm dịch vụ mới'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

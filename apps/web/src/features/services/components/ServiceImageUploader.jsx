import { useRef, useState } from 'react'
import { uploadServiceImage } from '../api/services.api.js'

export default function ServiceImageUploader({
  apiBaseUrl,
  token,
  currentImageUrl,
  onImageUploaded,
  disabled = false,
}) {
  const [previewUrl, setPreviewUrl] = useState(currentImageUrl || '')
  const [selectedFile, setSelectedFile] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadSuccess, setUploadSuccess] = useState('')
  const [mode, setMode] = useState('upload') // 'upload' | 'url'
  const [directUrl, setDirectUrl] = useState('')

  const fileInputRef = useRef(null)

  async function uploadFile(file) {
    if (!file) return
    setIsUploading(true)
    setUploadError('')
    setUploadSuccess('')

    try {
      const reader = new FileReader()
      const dataUrl = await new Promise((resolve, reject) => {
        reader.onload = (e) => resolve(e.target?.result)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const res = await uploadServiceImage(apiBaseUrl, token, {
        dataUrl,
        originalName: file.name,
      })

      const finalUrl = res.secureUrl || res.url
      setPreviewUrl(finalUrl)
      setUploadSuccess('Tải ảnh lên Cloudinary thành công!')
      setSelectedFile(null)

      onImageUploaded({
        coverImageId: res.id,
        imageUrl: finalUrl,
      })
    } catch (err) {
      setUploadError(err?.message || 'Không thể tải ảnh lên. Vui lòng kiểm tra lại.')
    } finally {
      setIsUploading(false)
    }
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadError('')
    setUploadSuccess('')

    // Kiểm tra định dạng
    if (!file.type.startsWith('image/')) {
      setUploadError('Chỉ chấp nhận file hình ảnh (JPG, PNG, WebP).')
      return
    }

    // Giới hạn 10MB
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('Kích thước ảnh tối đa là 10MB.')
      return
    }

    setSelectedFile(file)
    const reader = new FileReader()
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result || '')
    }
    reader.readAsDataURL(file)

    // Tự động tải lên Cloudinary ngay sau khi chọn file
    uploadFile(file)
  }

  function handleUpload() {
    if (selectedFile) {
      uploadFile(selectedFile)
    }
  }

  function handleApplyDirectUrl() {
    if (!directUrl.trim()) return
    setUploadError('')
    if (!/^https:\/\/res\.cloudinary\.com\//.test(directUrl.trim())) {
      setUploadError('URL ảnh phải bắt đầu bằng https://res.cloudinary.com/')
      return
    }
    setPreviewUrl(directUrl.trim())
    setUploadSuccess('Đã áp dụng link ảnh Cloudinary.')
    onImageUploaded({
      coverImageId: null,
      imageUrl: directUrl.trim(),
    })
  }

  function handleRemoveImage() {
    setPreviewUrl('')
    setSelectedFile(null)
    setUploadError('')
    setUploadSuccess('')
    if (fileInputRef.current) fileInputRef.current.value = ''
    onImageUploaded({
      coverImageId: null,
      imageUrl: '',
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
          Ảnh đại diện dịch vụ
        </label>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setMode('upload')}
            className={`font-medium transition-colors ${
              mode === 'upload' ? 'text-terracotta underline font-semibold' : 'text-muted hover:text-ink'
            }`}
          >
            Tải ảnh từ máy
          </button>
          <span className="text-border">|</span>
          <button
            type="button"
            onClick={() => setMode('url')}
            className={`font-medium transition-colors ${
              mode === 'url' ? 'text-terracotta underline font-semibold' : 'text-muted hover:text-ink'
            }`}
          >
            Dán link ảnh
          </button>
        </div>
      </div>

      {/* Preview khu vực */}
      <div className="flex flex-col sm:flex-row items-center gap-4 rounded-2xl border border-dashed border-border bg-[#faf7f2] p-4">
        <div className="relative size-24 shrink-0 overflow-hidden rounded-xl border border-border bg-white shadow-2xs">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Xem trước ảnh dịch vụ"
              className="size-full object-cover"
              onError={() => setUploadError('Không thể tải ảnh từ URL.')}
            />
          ) : (
            <div className="flex size-full flex-col items-center justify-center text-stone-400">
              <svg className="size-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span className="text-[10px]">Chưa có ảnh</span>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
          {mode === 'upload' ? (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                disabled={disabled || isUploading}
                onChange={handleFileChange}
              />
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <button
                  type="button"
                  disabled={disabled || isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl border border-border bg-white px-3 py-1.5 text-xs font-semibold text-ink shadow-2xs hover:bg-soft-surface transition-colors disabled:opacity-50"
                >
                  Chọn file từ máy
                </button>

                {isUploading ? (
                  <span className="inline-flex items-center gap-1.5 rounded-xl bg-terracotta/10 px-3 py-1.5 text-xs font-semibold text-terracotta">
                    <svg className="size-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Đang tải lên Cloudinary…
                  </span>
                ) : selectedFile ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={handleUpload}
                    className="rounded-xl bg-terracotta px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-terracotta-dark transition-colors disabled:opacity-50"
                  >
                    Tải lên Cloudinary
                  </button>
                ) : null}

                {previewUrl && (
                  <button
                    type="button"
                    disabled={disabled || isUploading}
                    onClick={handleRemoveImage}
                    className="text-xs text-rose-600 hover:text-rose-800 transition-colors"
                  >
                    Gỡ ảnh
                  </button>
                )}
              </div>
              <p className="mt-1 text-[11px] text-muted">
                {selectedFile
                  ? `Đã chọn: ${selectedFile.name} (${(selectedFile.size / 1024).toFixed(0)} KB)`
                  : 'Hỗ trợ PNG, JPG, WebP tối đa 10MB. Ảnh sẽ được tự động tối ưu qua Cloudinary.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://res.cloudinary.com/..."
                  value={directUrl}
                  disabled={disabled}
                  onChange={(e) => setDirectUrl(e.target.value)}
                  className="w-full rounded-xl border border-border bg-white px-3 py-1.5 text-xs focus:border-terracotta focus:outline-none"
                />
                <button
                  type="button"
                  disabled={disabled || !directUrl.trim()}
                  onClick={handleApplyDirectUrl}
                  className="shrink-0 rounded-xl bg-terracotta px-3 py-1.5 text-xs font-semibold text-white hover:bg-terracotta-dark transition-colors disabled:opacity-50"
                >
                  Áp dụng
                </button>
              </div>
              <p className="text-[11px] text-muted">Dán đường dẫn ảnh Cloudinary đã tải trước đó.</p>
            </div>
          )}
        </div>
      </div>

      {uploadError && (
        <p role="alert" className="text-xs text-rose-600 font-medium animate-in fade-in duration-150">
          {uploadError}
        </p>
      )}
      {uploadSuccess && (
        <p role="status" className="text-xs text-emerald-700 font-medium animate-in fade-in duration-150">
          ✓ {uploadSuccess}
        </p>
      )}
    </div>
  )
}

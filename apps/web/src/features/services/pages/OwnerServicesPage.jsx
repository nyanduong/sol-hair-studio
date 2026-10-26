import { Link } from 'react-router-dom'
import { useOwnerServices } from '../hooks/useOwnerServices.js'
import ServiceTable from '../components/ServiceTable.jsx'
import ServiceFormModal from '../components/ServiceFormModal.jsx'

export default function OwnerServicesPage({ apiBaseUrl, token }) {
  const {
    services,
    filteredServices,
    categories,
    state,
    actionState,
    searchQuery,
    categoryFilter,
    statusFilter,
    modalService,
    isModalOpen,
    setSearchQuery,
    setCategoryFilter,
    setStatusFilter,
    loadServices,
    toggleServiceActive,
    saveService,
    openCreateModal,
    openEditModal,
    closeModal,
    clearAction,
    errorMessage,
  } = useOwnerServices(apiBaseUrl, token)

  const isWorking = state.kind === 'loading' || actionState.kind === 'loading'
  const activeCount = services.filter((s) => s.isActive).length
  const inactiveCount = services.length - activeCount

  return (
    <div className="min-h-screen bg-canvas pb-20">
      {/* ── Top Header ── */}
      <header className="sticky top-0 z-30 border-b border-border/80 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-8">
          <div className="flex items-center gap-3">
            <Link to="/" className="font-display text-lg font-bold tracking-widest text-ink hover:text-terracotta transition-colors">
              SOL HAIR STUDIO
            </Link>
            <span className="hidden sm:inline-block text-xs font-semibold uppercase tracking-widest text-terracotta bg-soft-surface px-2.5 py-1 rounded-full border border-border/60">
              Quản trị Salon
            </span>
          </div>

          <nav aria-label="Điều hướng quản lý" className="flex items-center gap-2 sm:gap-4 text-xs font-medium">
            <Link to="/quan-ly/lich-hen" className="rounded-full px-3 py-1.5 text-muted hover:text-ink hover:bg-soft-surface transition-colors">
              Lịch salon
            </Link>
            <Link to="/quan-ly/nhan-su" className="rounded-full px-3 py-1.5 text-muted hover:text-ink hover:bg-soft-surface transition-colors">
              Nhân sự & ca làm
            </Link>
            <Link to="/quan-ly/dich-vu" className="rounded-full bg-terracotta px-3.5 py-1.5 text-white font-semibold shadow-2xs">
              Dịch vụ
            </Link>
            <Link to="/" className="text-muted hover:text-terracotta transition-colors pl-2">
              ← Trang chủ
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="mx-auto max-w-7xl px-4 sm:px-8 pt-8">
        {/* Banner tiêu đề */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border/60 pb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-terracotta">
              Không gian quản lý
            </p>
            <h1 className="mt-2 font-display text-3xl sm:text-4xl font-bold text-ink">
              Danh mục dịch vụ & hình ảnh
            </h1>
            <p className="mt-2 text-sm text-muted">
              Thêm mới, cập nhật giá, điều chỉnh thời lượng và bật/tắt dịch vụ hiển thị trên hệ thống.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={isWorking}
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 rounded-full bg-terracotta px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-terracotta-dark transition-[transform,background-color] duration-200 motion-safe:hover:-translate-y-0.5 disabled:opacity-50"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Thêm dịch vụ mới
            </button>
          </div>
        </div>

        {/* ── Thẻ thống kê nhanh ── */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-2xl border border-border bg-white p-4 shadow-2xs">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Tổng dịch vụ</p>
            <p className="mt-1 font-sans text-2xl font-bold text-ink">{services.length}</p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 shadow-2xs">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">Đang hiển thị</p>
            <p className="mt-1 font-sans text-2xl font-bold text-emerald-700">{activeCount}</p>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 shadow-2xs">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-600">Đã ẩn khách</p>
            <p className="mt-1 font-sans text-2xl font-bold text-stone-600">{inactiveCount}</p>
          </div>
          <div className="rounded-2xl border border-border bg-white p-4 shadow-2xs">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Số danh mục</p>
            <p className="mt-1 font-sans text-2xl font-bold text-terracotta">{categories.length}</p>
          </div>
        </div>

        {/* ── Action Message Feedback ── */}
        {actionState.kind === 'loading' && (
          <p role="status" className="mt-4 text-xs font-medium text-stone-500 animate-pulse">
            {actionState.message || 'Đang xử lý yêu cầu…'}
          </p>
        )}
        {actionState.kind === 'success' && (
          <div
            role="status"
            className="mt-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-900 animate-in fade-in duration-200"
          >
            <span>✓ {actionState.message}</span>
            <button
              type="button"
              onClick={clearAction}
              className="text-emerald-700 hover:text-emerald-900 text-sm font-bold"
            >
              ×
            </button>
          </div>
        )}
        {actionState.kind === 'error' && (
          <div
            role="alert"
            className="mt-4 flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-900 animate-in fade-in duration-200"
          >
            <span>⚠️ {actionState.message}</span>
            <button
              type="button"
              onClick={clearAction}
              className="text-rose-700 hover:text-rose-900 text-sm font-bold"
            >
              ×
            </button>
          </div>
        )}

        {/* ── Thanh công cụ (Bộ lọc & Tìm kiếm) ── */}
        <div className="mt-6 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <svg
                className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-stone-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="search"
                placeholder="Tìm theo tên dịch vụ, ID hoặc mô tả…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-2xl border border-border bg-white pl-9 pr-4 py-2.5 text-xs font-medium text-ink focus:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/15 transition-all"
              />
            </div>

            {/* Filter Category */}
            <select
              aria-label="Lọc theo danh mục"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-2xl border border-border bg-white px-3.5 py-2.5 text-xs font-medium text-ink focus:border-terracotta focus:outline-none transition-all"
            >
              <option value="all">Tất cả danh mục ({services.length})</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Status Pills */}
          <div className="flex items-center rounded-2xl border border-border bg-white p-1 shrink-0">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === 'all'
                  ? 'bg-terracotta text-white shadow-2xs'
                  : 'text-stone-600 hover:text-ink'
              }`}
            >
              Tất cả ({services.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === 'active'
                  ? 'bg-terracotta text-white shadow-2xs'
                  : 'text-stone-600 hover:text-ink'
              }`}
            >
              Đang hiện ({activeCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('inactive')}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === 'inactive'
                  ? 'bg-terracotta text-white shadow-2xs'
                  : 'text-stone-600 hover:text-ink'
              }`}
            >
              Đã ẩn ({inactiveCount})
            </button>
          </div>
        </div>

        {/* ── Danh sách dịch vụ ── */}
        <div className="mt-6">
          {state.kind === 'loading' && services.length === 0 ? (
            <div className="rounded-3xl border border-border bg-white p-12 text-center animate-pulse">
              <div className="mx-auto size-10 rounded-full bg-soft-surface" />
              <p className="mt-4 text-xs font-medium text-muted">Đang tải danh sách dịch vụ của salon…</p>
            </div>
          ) : state.kind === 'error' && services.length === 0 ? (
            <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center text-rose-900">
              <p className="font-semibold text-sm">{errorMessage}</p>
              <button
                type="button"
                onClick={loadServices}
                className="mt-4 rounded-full bg-terracotta px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-terracotta-dark transition-colors"
              >
                Thử lại
              </button>
            </div>
          ) : (
            <ServiceTable
              services={filteredServices}
              onEdit={openEditModal}
              onToggleActive={toggleServiceActive}
              isActionBusy={isWorking}
            />
          )}
        </div>
      </main>

      {/* ── Modal Thêm / Sửa Dịch vụ ── */}
      <ServiceFormModal
        key={modalService?.id || (isModalOpen ? 'create' : 'closed')}
        isOpen={isModalOpen}
        service={modalService}
        categories={categories}
        onClose={closeModal}
        onSave={saveService}
        apiBaseUrl={apiBaseUrl}
        token={token}
        isSubmitting={actionState.kind === 'loading'}
      />
    </div>
  )
}

import RevealOnScroll from './RevealOnScroll.jsx'
import { useServices } from '../../services/hooks/useServices.js'
import ServiceCard from '../../services/components/ServiceCard.jsx'

function LoadingCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Đang tải dịch vụ">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="animate-pulse rounded-2xl border border-border/70 bg-white p-2 motion-reduce:animate-none"
          aria-hidden="true"
        >
          <div className="aspect-[2.25] rounded-xl bg-soft-surface" />
          <div className="mt-5 h-6 w-3/5 rounded bg-soft-surface" />
          <div className="mt-3 h-4 w-2/5 rounded bg-soft-surface" />
          <div className="mt-3 h-4 w-1/3 rounded bg-soft-surface" />
        </div>
      ))}
    </div>
  )
}

export default function ServicePreview() {
  const { state, retry } = useServices()

  return (
    <section
      id="services"
      tabIndex={-1}
      aria-labelledby="services-title"
      className="bg-white/50 py-7 sm:py-8"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <RevealOnScroll className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[0.6rem] font-semibold tracking-[0.24em] text-terracotta uppercase">
              Dịch vụ tại Sol
            </p>
            <h2
              id="services-title"
              className="mt-2 font-display text-3xl font-medium tracking-tight text-ink sm:text-[2.1rem]"
            >
              Dịch vụ dành cho bạn.
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Bắt đầu từ điều mái tóc bạn đang cần.
            </p>
          </div>
          <a
            href="#services-list"
            className="inline-flex min-h-11 self-start items-center gap-2 text-xs text-muted transition-colors hover:text-terracotta sm:self-auto"
          >
            Xem tất cả dịch vụ <span aria-hidden="true">→</span>
          </a>
        </RevealOnScroll>

        <div id="services-list" tabIndex={-1} aria-live="polite" aria-busy={state.kind === 'loading'}>
          {state.kind === 'loading' && <LoadingCards />}
          {state.kind === 'error' && (
            <div className="rounded-2xl border border-terracotta/20 bg-white p-6 text-center sm:p-10">
              <p className="text-ink">Chưa thể tải danh mục dịch vụ.</p>
              <p className="mt-2 text-sm text-muted">{state.message}</p>
              <button
                type="button"
                onClick={retry}
                className="mt-5 rounded-full bg-terracotta px-5 py-3 text-sm font-semibold text-white transition hover:bg-terracotta-dark"
              >
                Thử lại
              </button>
            </div>
          )}
          {state.kind === 'success' && state.data.length === 0 && (
            <div className="rounded-2xl border border-border bg-white p-8 text-center text-muted sm:p-12">
              Danh mục dịch vụ đang được cập nhật. Vui lòng quay lại sau.
            </div>
          )}
          {state.kind === 'success' && state.data.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {state.data.map((service, index) => <RevealOnScroll key={service.id} delay={(index % 3) * 80} className="h-full"><ServiceCard service={service} /></RevealOnScroll>)}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

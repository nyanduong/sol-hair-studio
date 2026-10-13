import RevealOnScroll from '../components/RevealOnScroll.jsx'
import EditorialSection from '../components/EditorialSection.jsx'
import ExperienceSection from '../components/ExperienceSection.jsx'
import HeroMedia from '../components/HeroMedia.jsx'
import ServicePreview from '../components/ServicePreview.jsx'
import SiteFooter from '../components/SiteFooter.jsx'
import SiteHeader from '../components/SiteHeader.jsx'

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1}>
        <section id="home" tabIndex={-1} aria-labelledby="home-title" className="py-8 sm:py-10 lg:py-11">
          <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_1.08fr_3.5rem] lg:gap-7 lg:px-8">
            <RevealOnScroll className="min-w-0">
              <p className="text-[0.6rem] font-semibold tracking-[0.24em] text-terracotta uppercase">Sol Hair Studio</p>
              <h1 id="home-title" className="mt-3 max-w-[28rem] font-display text-[2.65rem] font-medium leading-[1.03] tracking-tight sm:text-5xl lg:max-w-none lg:text-[2.75rem]">Một khoảng thời gian dành riêng cho mái tóc.</h1>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">Khám phá những dịch vụ, phong cách và cảm hứng dành cho mái tóc của riêng bạn.</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <a href="#services" className="inline-flex min-h-11 items-center justify-center gap-3 rounded-full bg-terracotta px-5 text-xs font-semibold text-white shadow-[0_5px_14px_rgba(161,79,61,0.15)] transition-colors hover:bg-terracotta-dark">Khám phá dịch vụ <span aria-hidden="true">→</span></a>
                <a href="#booking" className="inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-white px-5 text-xs font-medium transition-colors hover:border-terracotta">Đặt lịch</a>
              </div>
              <p className="mt-5 flex items-center gap-3 text-[0.65rem] leading-relaxed text-muted"><span aria-hidden="true" className="font-display text-lg italic text-terracotta">01</span>Chăm chút vừa vặn với nhịp sống của bạn.</p>
            </RevealOnScroll>
            <RevealOnScroll delay={100}><HeroMedia /></RevealOnScroll>
            <p className="hidden self-center border-y border-terracotta/60 py-5 font-display text-lg leading-snug text-muted lg:block">Vẻ đẹp bắt đầu từ sự chăm sóc tử tế.</p>
          </div>
        </section>
        <ServicePreview />
        <ExperienceSection />
        <EditorialSection />
        <section id="booking" tabIndex={-1} aria-labelledby="booking-title" className="mx-auto max-w-6xl px-4 pb-7 pt-4 sm:px-6 lg:px-8">
          <RevealOnScroll className="relative isolate overflow-hidden rounded-2xl bg-terracotta px-6 py-6 text-white sm:flex sm:items-center sm:justify-between sm:gap-6 sm:px-9">
            <img src="/logo/sol-logo.png" alt="" aria-hidden="true" className="pointer-events-none absolute -right-5 -top-16 -z-10 h-64 w-64 rotate-12 object-contain opacity-10 sm:right-24" />
            <div>
              <p className="text-[0.55rem] font-medium tracking-[0.23em] uppercase">Your time at Sol</p>
              <h2 id="booking-title" className="mt-2 font-display text-3xl font-medium leading-tight">Mái tóc mới bắt đầu từ một cuộc hẹn.</h2>
              <p id="booking-availability" className="mt-2 text-xs leading-relaxed">Đặt lịch trực tuyến chưa khả dụng. Sol sẽ cập nhật khi sẵn sàng.</p>
            </div>
            <button type="button" disabled aria-describedby="booking-availability" className="mt-5 inline-flex min-h-11 shrink-0 items-center justify-center gap-3 rounded-full bg-canvas px-6 text-xs font-semibold text-ink sm:mt-0">Sắp mở đặt lịch <span aria-hidden="true">→</span></button>
          </RevealOnScroll>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}

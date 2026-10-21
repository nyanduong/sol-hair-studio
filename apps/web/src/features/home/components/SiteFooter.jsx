const footerLinks = [
  { href: '/#services', label: 'Dịch vụ' },
  { href: '/#experience', label: 'Trải nghiệm' },
  { href: '/#stories', label: 'Góc Sol' },
  { href: '/booking', label: 'Thông tin đặt lịch' },
]

export default function SiteFooter() {
  return (
    <footer id="contact" tabIndex={-1} className="border-t border-border/70">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:grid-cols-[1.4fr_1fr_1fr] sm:px-6 lg:px-8">
        <div>
          <p className="font-display text-lg font-semibold tracking-[0.17em]">SOL HAIR STUDIO</p>
          <p className="mt-1 text-[0.45rem] tracking-[0.25em] text-muted">BEAUTY SHINES WITHIN</p>
          <p className="mt-3 max-w-sm text-xs leading-relaxed text-muted">Cảm hứng cho mái tóc, phong cách và một chút thời gian dành riêng cho bạn.</p>
          <p className="mt-2 font-display text-base italic text-terracotta">More than a haircut — it’s your ritual.</p>
        </div>
        <div>
          <h2 className="text-[0.6rem] font-semibold tracking-[0.16em] uppercase">Kết nối với Sol</h2>
          {/* Replace only with owner-verified salon/contact details. */}
          <p className="mt-3 max-w-xs text-xs leading-relaxed text-muted">Thông tin salon và kênh liên hệ chính thức đang được cập nhật.</p>
        </div>
        <nav aria-label="Điều hướng cuối trang">
          <h2 className="text-[0.6rem] font-semibold tracking-[0.16em] uppercase">Điều hướng</h2>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 text-xs text-muted">{footerLinks.map(({ href, label }) => <li key={href}><a href={href} className="inline-flex min-h-11 items-center hover:text-terracotta">{label}</a></li>)}</ul>
        </nav>
      </div>
      <div className="border-t border-border/70 px-4 py-3 text-center text-[0.6rem] text-muted">© {new Date().getFullYear()} Sol Hair Studio. Beauty Shines Within.</div>
    </footer>
  )
}

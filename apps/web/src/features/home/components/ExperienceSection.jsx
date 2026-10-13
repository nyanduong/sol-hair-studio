// Editorial direction only; not a claim about unverified salon facilities/staff.
const highlights = [
  { icon: 'leaf', title: 'Một nhịp sống chậm', description: 'Dành một khoảng thời gian cho chính mình.' },
  { icon: 'heart', title: 'Bắt đầu từ lắng nghe', description: 'Hiểu mái tóc và điều bạn đang tìm kiếm.' },
  { icon: 'spark', title: 'Vẻ đẹp của riêng bạn', description: 'Tìm cảm hứng phù hợp với phong cách của mình.' },
]

function HighlightIcon({ type }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="h-5 w-5">{type === 'heart' ? <path d="M12 20S3 14 3 8a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 12-9 12Z" /> : type === 'leaf' ? <><path d="M20 4C9 2 3 7 5 14c2 6 14 5 15-10Z" /><path d="M4 21 15 10" /></> : <path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />}</svg>
}

export default function ExperienceSection() {
  return (
    <section id="experience" tabIndex={-1} aria-labelledby="experience-title" className="py-7 sm:py-9">
      <div className="mx-auto grid max-w-6xl items-center gap-7 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:gap-12 lg:px-8">
        <div className="relative aspect-[1.9] overflow-hidden rounded-2xl bg-soft-surface">
          <img src="/images/experience-cut.jpg" alt="Cảm hứng tạo kiểu cho mái tóc dài" loading="lazy" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-linear-to-r from-transparent via-transparent to-ink/65" />
          <blockquote className="absolute right-5 top-1/2 max-w-[38%] -translate-y-1/2 font-display text-lg leading-snug text-white sm:right-6 sm:text-xl">“Mỗi mái tóc là một câu chuyện đẹp.”<cite className="mt-3 block font-sans text-[0.45rem] not-italic tracking-[0.2em] uppercase">— Sol Hair Studio</cite></blockquote>
        </div>
        <div>
          <p className="text-[0.6rem] font-semibold tracking-[0.24em] text-terracotta uppercase">Trải nghiệm Sol</p>
          <h2 id="experience-title" className="mt-2 font-display text-3xl font-medium leading-tight sm:text-[2.1rem]">Chăm chút trong từng điểm chạm.</h2>
          <p className="mt-2 max-w-lg text-xs leading-relaxed text-muted">Một mái tóc đẹp bắt đầu từ những điều nhỏ: cảm hứng, sự chăm sóc và một phong cách khiến bạn thấy là chính mình.</p>
          <ul className="mt-5 grid grid-cols-1 gap-4 min-[420px]:grid-cols-3">
            {highlights.map(({ icon, title, description }) => <li key={title} className="min-w-0">
              <span className="mb-2 grid h-9 w-9 place-items-center rounded-full border border-terracotta/60 text-terracotta"><HighlightIcon type={icon} /></span>
              <h3 className="text-[0.68rem] font-semibold leading-relaxed text-terracotta">{title}</h3>
              <p className="mt-1 text-[0.65rem] leading-relaxed text-muted">{description}</p>
            </li>)}
          </ul>
        </div>
      </div>
    </section>
  )
}

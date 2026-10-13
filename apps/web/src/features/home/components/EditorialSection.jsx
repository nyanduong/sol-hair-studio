// Sample editorial content, pending owner review; no CMS/detail routes exist.
const stories = [
  { image: '/images/editorial-milktea.jpg', title: 'Sắc nâu ấm trở lại đầy cuốn hút' },
  { image: '/images/experience-cut.jpg', title: 'Layer mềm mại cho mái tóc hằng ngày' },
  { image: '/images/editorial-color.jpg', title: 'Chăm sóc sau nhuộm để tóc luôn mềm bóng' },
]

export default function EditorialSection() {
  return (
    <section id="stories" tabIndex={-1} aria-labelledby="stories-title" className="py-7 sm:py-8">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.5fr] lg:items-start lg:gap-10 lg:px-8">
        <div>
          <p className="text-[0.6rem] font-semibold tracking-[0.24em] text-terracotta uppercase">Góc Sol</p>
          <h2 id="stories-title" className="mt-2 font-display text-3xl font-medium sm:text-[2.1rem]">Xu hướng & cảm hứng.</h2>
          <p className="mt-2 text-xs leading-relaxed text-muted">Những câu chuyện, kiểu tóc và gợi ý chăm sóc.</p>
          <p className="mt-2 text-[0.6rem] text-muted">Nội dung biên tập mẫu</p>
        </div>
        <div className="grid grid-cols-1 gap-5 min-[420px]:grid-cols-3 sm:gap-6">
          {stories.map(({ image, title }) => <article key={title} className="min-w-0">
            <img src={image} alt="" loading="lazy" className="aspect-[2.2] w-full rounded-xl object-cover" />
            <h3 className="mt-2 font-display text-lg font-medium leading-tight">{title}</h3>
          </article>)}
        </div>
      </div>
    </section>
  )
}

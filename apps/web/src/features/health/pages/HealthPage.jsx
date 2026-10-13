import { apiBaseUrl } from '../../../config/env.js'
import HealthStatusCard from '../components/HealthStatusCard.jsx'
import { useHealth } from '../hooks/useHealth.js'

export default function HealthPage() {
  const { state, retry } = useHealth()

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6" aria-labelledby="page-title">
      <a href="/" className="mb-6 inline-flex min-h-11 items-center text-sm text-terracotta">← Về trang chủ</a>
      <p className="mb-[18px] text-xs font-extrabold tracking-[0.18em] text-[#8d4939]">
        SOL HAIR STUDIO
      </p>
      <h1
        id="page-title"
        className="mb-[18px] max-w-[700px] font-serif text-[clamp(2.4rem,7vw,4.8rem)] font-medium leading-[0.98] tracking-[-0.045em]"
      >
        Nền tảng dùng chung đã sẵn sàng.
      </h1>
      <p className="mb-9 max-w-2xl text-[1.08rem] text-[#716d69]">
        Kiểm tra kết nối giữa website và API dùng chung. Danh mục dịch vụ
        trên trang chủ sử dụng cùng API này.
      </p>
      <HealthStatusCard
        state={state}
        endpoint={`${apiBaseUrl}/api/health`}
        onRetry={retry}
      />
    </section>
  )
}

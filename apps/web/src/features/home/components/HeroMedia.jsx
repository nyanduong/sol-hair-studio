import { useEffect, useRef, useState } from 'react'

export default function HeroMedia() {
  const videoRef = useRef(null)
  const [motionAllowed, setMotionAllowed] = useState(false)
  const [playbackFailed, setPlaybackFailed] = useState(false)

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = () => {
      setMotionAllowed(!preference.matches)
      if (preference.matches) videoRef.current?.pause()
    }
    updatePreference()
    preference.addEventListener('change', updatePreference)
    return () => preference.removeEventListener('change', updatePreference)
  }, [])

  useEffect(() => {
    if (motionAllowed) {
      videoRef.current?.play().catch(() => {
        // Autoplay can be denied by the browser; keep the poster visible.
        setPlaybackFailed(true)
      })
    }
  }, [motionAllowed])

  return (
    <div className="relative min-w-0">
      <div className="relative aspect-[1.65] overflow-hidden rounded-[1.75rem] bg-soft-surface sm:aspect-[1.7] lg:aspect-[1.65]">
        <img src="/images/hero-poster.jpg" alt="Mái tóc nâu dài trong một buổi tạo kiểu" width="1280" height="720" fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
        <video ref={videoRef} src="/video/hero.mp4" poster="/images/hero-poster.jpg" aria-label="Khoảnh khắc tạo kiểu tóc" autoPlay={motionAllowed} muted loop playsInline preload="none" onPlaying={() => setPlaybackFailed(false)} onError={() => setPlaybackFailed(true)} className="relative h-full w-full object-cover" />
        <div className="absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] rounded-xl border border-white/80 bg-canvas/95 px-4 py-2.5 sm:bottom-4 sm:left-4">
          <p className="text-[0.5rem] font-bold tracking-[0.18em] text-terracotta uppercase">Beauty shines within</p>
          <p className="mt-1 font-display text-lg leading-tight sm:text-xl">Chạm vào phiên bản tự tin hơn.</p>
        </div>
      </div>
      {playbackFailed && <p role="status" className="mt-2 text-xs text-muted">Video chưa thể phát. Bạn vẫn có thể xem ảnh và khám phá dịch vụ.</p>}
    </div>
  )
}

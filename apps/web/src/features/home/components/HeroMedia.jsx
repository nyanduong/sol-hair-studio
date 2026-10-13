import { useEffect, useRef, useState } from 'react'

export default function HeroMedia() {
  const videoRef = useRef(null)
  const [motionAllowed, setMotionAllowed] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
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
        // Autoplay can be denied; keep the poster and offer manual playback.
        setIsPlaying(false)
      })
    }
  }, [motionAllowed])

  async function togglePlayback() {
    if (isPlaying) videoRef.current?.pause()
    else {
      try {
        await videoRef.current?.play()
        setPlaybackFailed(false)
      } catch {
        setPlaybackFailed(true)
      }
    }
  }

  return (
    <div className="relative min-w-0">
      <div className="relative aspect-[1.65] overflow-hidden rounded-[1.75rem] bg-soft-surface sm:aspect-[1.7] lg:aspect-[1.65]">
        <img src="/images/hero-poster.jpg" alt="Mái tóc nâu dài trong một buổi tạo kiểu" width="1280" height="720" fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
        <video ref={videoRef} src="/video/hero.mp4" poster="/images/hero-poster.jpg" aria-label="Khoảnh khắc tạo kiểu tóc" muted loop playsInline preload="none" onPlaying={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onError={() => { setIsPlaying(false); setPlaybackFailed(true) }} className="relative h-full w-full object-cover" />
        <button type="button" onClick={togglePlayback} aria-label={isPlaying ? 'Tạm dừng video' : 'Phát video'} aria-pressed={isPlaying} className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full border border-white/70 bg-ink/70 text-white transition-colors hover:bg-ink">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">{isPlaying ? <path d="M6 4h4v16H6zm8 0h4v16h-4z" /> : <path d="m8 4 13 8-13 8z" />}</svg>
        </button>
        <div className="absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] rounded-xl border border-white/80 bg-canvas/95 px-4 py-2.5 sm:bottom-4 sm:left-4">
          <p className="text-[0.5rem] font-bold tracking-[0.18em] text-terracotta uppercase">Beauty shines within</p>
          <p className="mt-1 font-display text-lg leading-tight sm:text-xl">Chạm vào phiên bản tự tin hơn.</p>
        </div>
      </div>
      {playbackFailed && <p role="status" className="mt-2 text-xs text-muted">Video chưa thể phát. Bạn vẫn có thể xem ảnh và khám phá dịch vụ.</p>}
    </div>
  )
}

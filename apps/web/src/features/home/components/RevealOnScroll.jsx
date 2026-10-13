import { useEffect, useRef, useState } from 'react'

export default function RevealOnScroll({ children, className = '', delay = 0, as: Component = 'div' }) {
  const elementRef = useRef(null)
  const [isVisible, setIsVisible] = useState(
    () =>
      typeof window === 'undefined' ||
      typeof window.IntersectionObserver !== 'function' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const element = elementRef.current

    if (
      !element ||
      typeof window === 'undefined' ||
      typeof window.IntersectionObserver !== 'function'
    ) {
      return undefined
    }

    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (preference.matches) {
      return undefined
    }

    const observer = new window.IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.unobserve(entry.target)
        }
      },
      { threshold: 0.14, rootMargin: '0px 0px -32px 0px' },
    )

    const showWithoutMotion = () => {
      if (preference.matches) {
        setIsVisible(true)
        observer.disconnect()
      }
    }
    observer.observe(element)
    preference.addEventListener('change', showWithoutMotion)
    return () => {
      observer.disconnect()
      preference.removeEventListener('change', showWithoutMotion)
    }
  }, [])

  return (
    <Component
      data-reveal=""
      onFocusCapture={() => setIsVisible(true)}
      ref={elementRef}
      className={`transition-[opacity,translate] duration-[650ms] ease-[cubic-bezier(0.2,0.65,0.3,1)] focus-within:translate-y-0 focus-within:opacity-100 focus-within:transition-none motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-[18px] opacity-0'} ${className}`}
      style={isVisible && delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Component>
  )
}

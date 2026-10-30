const currency = new Intl.NumberFormat('vi-VN')

export const formatPrice = (value) => {
  if (value === undefined || value === null) return '0đ'
  return value === 0 ? 'Miễn phí' : `${currency.format(value)}đ`
}

export const formatDuration = (duration) => {
  if (!duration) return '—'
  if (typeof duration === 'number') return `${duration} phút`
  const { min, max } = duration
  if (min === undefined || max === undefined) return '—'
  return `${min === max ? min : `${min}–${max}`} phút`
}

export function serviceColumns(width, fontScale = 1) {
  // Each card needs 160 logical pixels at the current text scale.
  return (Math.min(width, 720) - 44) / 2 >= 160 * fontScale ? 2 : 1
}

export function slugify(name) {
  if (!name) return ''
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

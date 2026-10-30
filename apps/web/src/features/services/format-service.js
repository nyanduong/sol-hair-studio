const currencyFormatter = new Intl.NumberFormat('vi-VN')

export function formatPrice(priceVnd) {
  if (priceVnd === undefined || priceVnd === null) return '0đ'
  return priceVnd === 0 ? 'Miễn phí' : `${currencyFormatter.format(priceVnd)}đ`
}

export function formatDuration(duration) {
  if (!duration) return '—'
  if (typeof duration === 'number') return `${duration} phút`
  const { min, max } = duration
  if (min === undefined || max === undefined) return '—'
  return `${min === max ? min : `${min}–${max}`} phút`
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

const currencyFormatter = new Intl.NumberFormat('vi-VN')

export function formatPrice(priceVnd) {
  return priceVnd === 0 ? 'Miễn phí' : `${currencyFormatter.format(priceVnd)}đ`
}

export function formatDuration({ min, max }) {
  return `${min === max ? min : `${min}–${max}`} phút`
}

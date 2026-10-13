const currency = new Intl.NumberFormat('vi-VN')
export const formatPrice = (value) => value === 0 ? 'Miễn phí' : `${currency.format(value)}đ`
export const formatDuration = ({ min, max }) => `${min === max ? min : `${min}–${max}`} phút`

export function serviceColumns(width, fontScale = 1) {
  // Each card needs 160 logical pixels at the current text scale.
  return (Math.min(width, 720) - 44) / 2 >= 160 * fontScale ? 2 : 1
}

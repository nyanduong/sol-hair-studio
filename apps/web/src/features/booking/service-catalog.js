const searchText = (value) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim()
export const serviceCategory = (service) => service.category?.trim() || 'Khác'

export function filterBookingServices(services, query, category) {
  const terms = searchText(query).split(/\s+/).filter(Boolean)
  return services.filter((service) => {
    const text = searchText(`${service.name} ${serviceCategory(service)}`)
    return (
      (!category || serviceCategory(service) === category) &&
      terms.every((term) => text.includes(term))
    )
  })
}

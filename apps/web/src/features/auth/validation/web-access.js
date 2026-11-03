export const STYLIST_APP_NOTICE = 'Vui lòng sử dụng ứng dụng Sol Hair Studio dành cho stylist'

export function isStylistOnly(account) {
  const roles = account?.roles
  return Array.isArray(roles) && roles.includes('stylist') &&
    !roles.includes('customer') && !roles.includes('owner')
}

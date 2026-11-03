export function notFound(request, response) {
  const isApiOrAsset = /^\/(?:api|admin-assets)(?:\/|$)/.test(request.path)
    || /^\/admin\/assets(?:\/|$)/.test(request.path)

  if (['GET', 'HEAD'].includes(request.method) && !isApiOrAsset) {
    response.set('Cache-Control', 'no-store')
    return response.redirect(302, '/admin/dashboard')
  }

  response.status(404).json({
    status: 'error',
    code: 'NOT_FOUND',
    message: 'Không tìm thấy đường dẫn.',
  })
}

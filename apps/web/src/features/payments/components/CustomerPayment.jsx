import { useEffect, useRef, useState } from 'react'
import { apiBaseUrl } from '../../../config/env.js'
import { usePayment } from '../hooks/usePayment.js'
const money = value => new Intl.NumberFormat('vi-VN').format(value) + ' đ'
export function PaymentView({ state, dialogRef, qrError, onQrError }) {
  const value = state.value
  const [checking, setChecking] = useState(false)
  const [copied, setCopied] = useState('')
  async function openQr() {
    setChecking(true)
    const fresh = await state.refresh()
    setChecking(false)
    if (fresh?.status === 'unpaid' && fresh.appointmentStatus === 'completed' && fresh.qrPath) dialogRef.current?.showModal()
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(String(text)); setCopied('Đã sao chép.') }
    catch { setCopied('Không sao chép được. Hãy chọn và sao chép nội dung bên dưới.') }
  }
  useEffect(() => {
    if (state.kind !== 'success' || value?.status === 'paid' || value?.appointmentStatus !== 'completed') dialogRef.current?.close()
  }, [state.kind, value?.status, value?.appointmentStatus, dialogRef])
  return <section className="mt-6 rounded-3xl border border-border bg-white p-6 sm:p-8" aria-labelledby="customer-payment-title">
    <h2 id="customer-payment-title" className="text-xl font-bold">Thanh toán tại salon</h2>
    {state.kind === 'loading' ? <p role="status" className="mt-3 text-sm text-muted">Đang kiểm tra thanh toán…</p> : state.kind === 'error' ? <p role="alert" className="mt-3 text-sm text-terracotta">Chưa đọc được trạng thái thanh toán. Vui lòng thử lại hoặc đăng nhập lại.</p> : <>
      <p className="mt-3 font-semibold">{value.status === 'paid' ? 'Đã thanh toán' : value.appointmentStatus === 'completed' ? 'Chưa thanh toán' : ['cancelled', 'no_show'].includes(value.appointmentStatus) ? 'Không có yêu cầu thanh toán' : 'Chưa đến bước thanh toán'}</p>
      <p className="mt-2 text-xl font-bold">{money(value.amountVnd)}</p>
      {value.status === 'paid' ? <p className="mt-2 text-sm text-muted">Salon xác nhận nhận tiền lúc {new Date(value.receivedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.</p> : <p className="mt-2 text-sm text-muted">{['cancelled', 'no_show'].includes(value.appointmentStatus) ? 'Lịch đã hủy hoặc khách không đến; salon không thu tiền dịch vụ cho lịch này.' : 'Chuyển khoản vào QR chủ tiệm sau khi làm tóc xong. Salon kiểm tra và xác nhận đã nhận tiền.'}</p>}
      {value.status === 'unpaid' && value.appointmentStatus === 'completed' && value.qrPath && <>
        <button type="button" disabled={checking || state.refreshing} onClick={openQr} className="mt-4 min-h-11 rounded-xl bg-terracotta px-5 py-2 text-sm font-semibold text-white">{checking ? 'Đang kiểm tra…' : 'Xem QR chuyển khoản'}</button>
        <dialog ref={dialogRef} aria-labelledby="customer-qr-title" className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl p-6 text-ink backdrop:bg-black/40">
          <div className="flex items-center justify-between gap-3"><h3 id="customer-qr-title" className="text-xl font-bold">Chuyển khoản cho salon</h3><button type="button" aria-label="Đóng QR" onClick={() => dialogRef.current.close()} className="min-h-11 rounded-xl border border-border px-4">✕</button></div>
          <p className="my-4 text-2xl font-bold">{money(value.amountVnd)}</p>
          {qrError ? <p role="alert">Không tải được ảnh QR. Vui lòng liên hệ nhân viên salon.</p> : <img src={apiBaseUrl + value.qrPath} alt="QR chuyển khoản tài khoản chủ tiệm" onError={onQrError} className="max-h-72 w-full object-contain" />}
          <p className="mt-4 text-sm">Nội dung chuyển khoản: <strong className="break-all">{value.transferContent}</strong></p>
          <div className="mt-4 flex flex-wrap gap-3"><button type="button" className="min-h-11 rounded-xl border border-border px-4" onClick={() => copy(value.amountVnd)}>Sao chép số tiền</button><button type="button" className="min-h-11 rounded-xl border border-border px-4" onClick={() => copy(value.transferContent)}>Sao chép nội dung</button></div><p role="status" className="mt-2 text-sm">{copied}</p>
          <p className="mt-3 rounded-xl bg-soft-surface p-3 text-sm">Đã chuyển khoản? Vui lòng chờ salon xác nhận, không chuyển thêm. Trạng thái tự cập nhật mỗi 15 giây.</p>
          <p className="mt-3 text-sm text-muted">Nhập đúng số tiền và nội dung trên. Sau khi chuyển, nhờ nhân viên kiểm tra tiền vào tài khoản chủ tiệm. Quét QR không tự thay đổi trạng thái thanh toán.</p>
        </dialog>
      </>}
    </>}
    <button type="button" disabled={state.kind === 'loading'} onClick={state.refresh} className="mt-4 ml-2 min-h-11 rounded-xl border border-border px-4 py-2 text-sm disabled:opacity-50">Cập nhật trạng thái</button>
  </section>
}
export default function CustomerPayment({ token, appointmentId }) {
  const state = usePayment(token, appointmentId), dialogRef = useRef(null)
  const [qrError, setQrError] = useState(false)
  return <PaymentView state={state} dialogRef={dialogRef} qrError={qrError} onQrError={() => setQrError(true)} />
}

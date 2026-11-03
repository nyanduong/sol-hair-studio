import { useState } from 'react'
import { apiBaseUrl } from '../../../config/env.js'
import { completeStaffPassword, getAuthErrorMessage, requestStaffActivationOtp, verifyStaffActivationOtp } from '../api/auth.api.js'
import { validateConfirmPassword, validateEmail, validateOtpCode, validatePassword } from '../validation/auth.validation.js'

export default function StaffActivationModal({ onClose }) {
  const [step, setStep] = useState('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [grant, setGrant] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [working, setWorking] = useState(false)

  async function submit(event) {
    event.preventDefault(); setError('')
    if (step === 'email') { const result = validateEmail(email); if (!result.isValid) return setError(result.message); setEmail(result.value); setStep('otp'); setNotice('Nhập mã 6 số đã gửi tới email của bạn.'); return }
    if (step === 'otp') {
      const result = validateOtpCode(code); if (!result.isValid) return setError(result.message)
      setWorking(true)
      try { const data = await verifyStaffActivationOtp(apiBaseUrl, { email, code: result.value }); setGrant(data.grant); setPassword(''); setConfirmPassword(''); setStep('password'); setNotice('Mã hợp lệ. Hãy đặt mật khẩu mới.') } catch (caught) { setError(getAuthErrorMessage(caught)) } finally { setWorking(false) }
      return
    }
    const passwordResult = validatePassword(password); const confirmResult = validateConfirmPassword(confirmPassword, password)
    if (!passwordResult.isValid) return setError(passwordResult.message)
    if (!confirmResult.isValid) return setError(confirmResult.message)
    setWorking(true)
    try { await completeStaffPassword(apiBaseUrl, { email, grant, password: passwordResult.value }); setStep('done'); setNotice('Đã đặt mật khẩu. Bây giờ bạn có thể đăng nhập.') } catch (caught) { setError(getAuthErrorMessage(caught)) } finally { setWorking(false) }
  }

  async function resend() { setWorking(true); setError(''); try { await requestStaffActivationOtp(apiBaseUrl, { email }); setNotice('Đã gửi mã OTP mới.'); setCode('') } catch (caught) { setError(getAuthErrorMessage(caught)) } finally { setWorking(false) } }
  const label = step === 'email' ? 'Kích hoạt tài khoản nhân viên' : step === 'otp' ? 'Nhập mã kích hoạt' : step === 'password' ? 'Đặt mật khẩu mới' : 'Hoàn tất kích hoạt'
  return <div role="dialog" aria-modal="true" aria-labelledby="staff-activation-title" className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-3xl border border-border/80 bg-canvas p-6 shadow-2xl sm:p-8"><button type="button" onClick={onClose} className="float-right text-muted hover:text-ink" aria-label="Đóng">✕</button><h1 id="staff-activation-title" className="pr-8 font-display text-3xl">{label}</h1><p className="mt-2 text-sm text-muted">{step === 'email' ? 'Dùng email Owner đã gửi lời mời.' : `Tài khoản: ${email}`}</p>{notice && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}{error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-900">{error}</p>}{step === 'done' ? <button onClick={onClose} className="mt-6 w-full rounded-full bg-terracotta px-5 py-3 font-semibold text-white">Về đăng nhập</button> : <form onSubmit={submit} className="mt-6 space-y-4">{step === 'email' && <label className="block text-sm font-semibold">Email nhân viên<input autoFocus className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-2.5" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>}{step === 'otp' && <><label className="block text-sm font-semibold">Mã OTP 6 số<input autoFocus inputMode="numeric" maxLength={6} className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-center font-mono text-xl tracking-[0.3em]" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} /></label><button type="button" disabled={working} onClick={resend} className="text-sm font-semibold text-terracotta hover:underline">Gửi lại mã</button></>}{step === 'password' && <><label className="block text-sm font-semibold">Mật khẩu mới<input autoFocus className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-2.5" type="password" autoComplete="new-password" placeholder="Ít nhất 8 ký tự" value={password} onChange={(event) => setPassword(event.target.value)} /></label><label className="block text-sm font-semibold">Xác nhận mật khẩu<input className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-2.5" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label></>}<button disabled={working} className="w-full rounded-full bg-terracotta px-5 py-3 font-semibold text-white disabled:opacity-60">{working ? 'Đang xử lý…' : step === 'email' ? 'Tiếp tục' : step === 'otp' ? 'Xác minh mã' : 'Lưu mật khẩu'}</button></form>}</div></div>
}

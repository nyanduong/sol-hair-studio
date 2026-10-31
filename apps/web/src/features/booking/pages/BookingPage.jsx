import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiBaseUrl } from '../../../config/env.js'
import { useAuth } from '../../auth/hooks/useAuth.js'
import SiteHeader from '../../home/components/SiteHeader.jsx'
import SiteFooter from '../../home/components/SiteFooter.jsx'
import { formatDuration } from '../../services/format-service.js'
import BookingServiceCard, { BookingServiceImage } from '../components/BookingServiceCard.jsx'
import { useServices } from '../../services/hooks/useServices.js'
import { updateBookingProfile } from '../api/booking.api.js'
import {
  bookingPayload,
  contactInput,
  money,
  salonDate,
  slotTime,
} from '../../../../../../shared/booking.js'
import BookingStatus from '../components/BookingStatus.jsx'
import { useBookingQuery } from '../hooks/useBookingQuery.js'
import { useBookingSubmission } from '../hooks/useBookingSubmission.js'

const field =
  'mt-2 min-h-11 w-full rounded-xl border border-border bg-white px-3 py-2 text-base focus:outline-2 focus:outline-terracotta'
const button =
  'min-h-11 rounded-full bg-terracotta px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50'

export default function BookingPage() {
  const { token, account, isAuthenticated, openLoginModal } = useAuth()
  const [searchParams] = useSearchParams()
  const initialServiceId = searchParams.get('serviceId') ?? ''
  // Remount all private draft/request state when the session changes.
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Link to="/" className="inline-flex min-h-11 items-center text-sm text-muted">
          ← Về trang chủ
        </Link>
        <h1 className="mt-4 font-display text-4xl sm:text-5xl">Đặt lịch tại Sol</h1>
        <p className="mt-3 text-sm leading-6 text-muted sm:text-base">
          Chọn dịch vụ phù hợp, Sol chăm chút phần còn lại.
        </p>
        {!isAuthenticated ? (
          <section className="mt-8 rounded-2xl border border-border bg-white p-6">
            <h2 className="font-display text-2xl">Bắt đầu bằng tài khoản của bạn</h2>
            <p className="my-4 text-sm text-muted">
              Đăng nhập tài khoản đã kích hoạt để chọn giờ và đặt hẹn.
            </p>
            <button
              className={button}
              onClick={() => openLoginModal('Đăng nhập để tiếp tục đặt lịch.')}
            >
              Đăng nhập để đặt lịch
            </button>
          </section>
        ) : !account?.roles?.some((role) => ['customer', 'owner'].includes(role)) ? (
          <p role="alert" className="mt-8">
            Tài khoản stylist không có quyền đặt lịch. Vui lòng dùng tài khoản khách hàng.
          </p>
        ) : (
          <BookingForm
            key={`${token}:${initialServiceId}`}
            token={token}
            initialServiceId={initialServiceId}
          />
        )}
      </main>
      <SiteFooter />
    </>
  )
}

function BookingForm({ token, initialServiceId }) {
  const [step, setStep] = useState(1)
  const stepHeading = useRef(null)
  const catalog = useServices()
  const profile = useBookingQuery('profile', token, {})
  const owner = profile.value?.roles?.includes('owner') ?? false
  const active =
    profile.kind === 'success' &&
    profile.value?.status === 'active' &&
    profile.value?.roles?.some((role) => ['customer', 'owner'].includes(role))
  const [chosenServiceIds, setServiceIds] = useState(null)
  // Apply the homepage choice once the public catalog loads, until the user edits it.
  // Stale links must not select services absent from the current catalog.
  const serviceIds =
    chosenServiceIds ??
    catalog.state.data
      ?.filter((service) => service.id === initialServiceId)
      .map((service) => service.id) ??
    []
  const [localDate, setLocalDate] = useState(salonDate)
  const [mode, setMode] = useState('scheduled')
  const [staffId, setStaffId] = useState('')
  const [startAt, setStartAt] = useState('')
  const [phoneSearch, setPhoneSearch] = useState('')
  const [search, setSearch] = useState(null)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [guest, setGuest] = useState(false)
  const [name, setName] = useState(null)
  const [phone, setPhone] = useState(null)
  const [notice, setNotice] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const mounted = useRef(true)
  const profileRequest = useRef(null)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      profileRequest.current?.abort()
    }
  }, [])
  const submission = useBookingSubmission(token)
  const locked =
    submission.kind === 'loading' || Boolean(submission.pending) || submission.kind === 'success'
  const customers = useBookingQuery('customers', token, owner && search ? { phone: search } : null)
  const params =
    active && serviceIds.length
      ? {
          serviceIds,
          localDate: mode === 'owner_walkin' ? salonDate() : localDate,
          mode,
          ...(owner && selectedCustomer ? { customerId: selectedCustomer.id } : {}),
        }
      : null
  const availability = useBookingQuery('availability', token, params)
  const data = availability.kind === 'success' ? availability.value : null
  const stylist = data?.stylists.find((item) => item.staffId === staffId)
  const slot = stylist?.slots.find((item) => item.startAt === startAt)
  const contact = profile.value?.customer
  const profileComplete = Boolean(contact?.displayName && contact?.phone)
  const selectedServices =
    catalog.state.data?.filter((service) => serviceIds.includes(service.id)) ?? []
  function goToStep(next) {
    setStep(next)
    requestAnimationFrame(() => {
      stepHeading.current?.focus({ preventScroll: true })
      stepHeading.current?.scrollIntoView({
        behavior: 'instant',
        block: 'start',
      })
    })
  }
  const resetSlot = () => {
    setStaffId('')
    setStartAt('')
    setNotice('')
  }
  function changeServices(id) {
    if (!serviceIds.includes(id) && serviceIds.length === 5) {
      setNotice('Mỗi lịch hẹn chọn tối đa 5 dịch vụ.')
      return
    }
    setServiceIds(
      serviceIds.includes(id) ? serviceIds.filter((value) => value !== id) : [...serviceIds, id],
    )
    resetSlot()
  }
  async function saveProfile() {
    try {
      const input = contactInput(name ?? contact?.displayName ?? '', phone ?? contact?.phone ?? '')
      setSavingProfile(true)
      setNotice('')
      profileRequest.current = new AbortController()
      await updateBookingProfile(apiBaseUrl, token, input, profileRequest.current.signal)
      if (mounted.current) {
        profile.retry()
        availability.retry()
        resetSlot()
        if (!owner) goToStep(2)
      }
    } catch (error) {
      if (mounted.current && error.name !== 'AbortError') setNotice(error.message)
    } finally {
      if (mounted.current) setSavingProfile(false)
    }
  }
  async function submitIntent(payload) {
    const result = await submission.submit(payload)
    if (mounted.current && result?.error?.status === 409) {
      if (!owner) goToStep(2)
      resetSlot()
      availability.retry()
    }
  }
  function confirm() {
    try {
      if (submission.pending) {
        void submitIntent(submission.pending.payload)
        return
      }
      if (!active || !slot || (!owner && !profileComplete))
        throw new Error('Kiểm tra hồ sơ và chọn lại giờ trống trước khi xác nhận.')
      const payload = bookingPayload({
        serviceIds,
        staffId,
        startAt: slot.startAt,
        mode,
        owner,
        customerId: selectedCustomer?.id,
        guestCustomer: owner && guest ? contactInput(name ?? '', phone ?? '') : undefined,
      })
      setNotice('')
      void submitIntent(payload)
    } catch (error) {
      setNotice(error.message)
    }
  }
  return (
    <>
      {!owner && (
        <nav aria-label="Các bước đặt lịch" className="mt-7">
          <ol className="flex items-center gap-2 sm:gap-5">
            {['Dịch vụ', 'Stylist & thời gian', 'Xác nhận'].map((label, index) => (
              <li key={label} className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
                <button
                  type="button"
                  aria-current={step === index + 1 ? 'step' : undefined}
                  disabled={locked || index + 1 > step}
                  onClick={() => goToStep(index + 1)}
                  className={`flex min-h-12 items-center gap-2 rounded-lg text-left text-xs focus-visible:outline-2 focus-visible:outline-terracotta sm:gap-3 sm:text-sm ${step === index + 1 ? 'font-semibold text-terracotta' : 'text-muted'} disabled:cursor-default`}
                >
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-full border sm:size-11 ${step === index + 1 ? 'border-terracotta bg-terracotta text-white' : 'border-border'}`}
                  >
                    0{index + 1}
                  </span>
                  {label}
                </button>
                {index < 2 && (
                  <span aria-hidden="true" className="hidden h-px flex-1 bg-border sm:block" />
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div
        ref={stepHeading}
        tabIndex={-1}
        className="mt-6 grid scroll-mt-28 items-start gap-5 outline-none lg:grid-cols-[minmax(0,1fr)_22rem]"
      >
        <div className="min-w-0 space-y-5">
          <BookingStatus query={profile} label="tài khoản" />
          {profile.kind === 'success' && !active && (
            <p role="alert">Tài khoản chưa hoạt động. Vui lòng kích hoạt hoặc đăng nhập lại.</p>
          )}
          <fieldset disabled={!active || locked} className="min-w-0 space-y-5 disabled:opacity-70">
            <section
              hidden={!owner && step !== 1}
              className="rounded-2xl border border-border bg-white p-4 sm:p-6"
            >
              <h2 className="font-display text-2xl sm:text-3xl">Bạn muốn chăm sóc tóc thế nào?</h2>
              <p className="mb-4 mt-2 text-sm text-muted">
                Chọn từ 1 đến 5 dịch vụ trong cùng một cuộc hẹn.
              </p>
              {catalog.state.kind === 'loading' && <p role="status">Đang tải dịch vụ…</p>}
              {catalog.state.kind === 'error' && (
                <div role="alert">
                  <p>{catalog.state.message}</p>
                  <button
                    type="button"
                    onClick={catalog.retry}
                    className="min-h-11 text-terracotta"
                  >
                    Thử lại
                  </button>
                </div>
              )}
              {catalog.state.kind === 'success' && !catalog.state.data.length && (
                <p>Chưa có dịch vụ để đặt hẹn.</p>
              )}
              <div className="grid gap-3">
                {catalog.state.data?.map((service) => (
                  <BookingServiceCard
                    key={service.id}
                    service={service}
                    selected={serviceIds.includes(service.id)}
                    onChange={() => changeServices(service.id)}
                  />
                ))}
              </div>
            </section>
            {owner ? (
              <section className="rounded-2xl border border-border bg-white p-5 sm:p-6">
                <h2 className="font-display text-2xl">Khách được đặt hộ</h2>
                <label className="mt-4 block text-sm">
                  Tìm theo số điện thoại
                  <input
                    type="tel"
                    value={phoneSearch}
                    onChange={(event) => {
                      setPhoneSearch(event.target.value)
                      setSelectedCustomer(null)
                      setGuest(false)
                      setSearch(null)
                      resetSlot()
                    }}
                    placeholder="0912345678"
                    className={field}
                  />
                </label>
                <button
                  type="button"
                  className="mt-3 min-h-11 font-semibold text-terracotta"
                  onClick={() => {
                    try {
                      const input = contactInput('Tìm khách', phoneSearch)
                      setSearch(input.phone)
                      setSelectedCustomer(null)
                      setGuest(false)
                      setName(null)
                      setPhone(null)
                      resetSlot()
                      customers.retry()
                    } catch (error) {
                      setNotice(error.message)
                    }
                  }}
                >
                  Tìm hồ sơ
                </button>
                <BookingStatus query={customers} label="hồ sơ khách" />
                {customers.kind === 'success' && (
                  <>
                    <p className="mb-2 text-sm text-muted">
                      Chọn đúng mã hồ sơ, kể cả khi trùng số điện thoại.
                    </p>
                    {customers.value.items.map((item) => (
                      <label
                        key={item.id}
                        className="my-2 flex min-h-11 items-start gap-3 rounded-xl border border-border p-3"
                      >
                        <input
                          type="radio"
                          name="customer"
                          checked={selectedCustomer?.id === item.id}
                          onChange={() => {
                            setSelectedCustomer(item)
                            setGuest(false)
                            resetSlot()
                          }}
                        />
                        <span>
                          {item.displayName} · {item.phone}
                          <small className="block break-all text-muted">Mã hồ sơ: {item.id}</small>
                        </span>
                      </label>
                    ))}
                    {!customers.value.items.length && (
                      <>
                        <p className="my-2 text-sm">Chưa có hồ sơ cho số điện thoại này.</p>
                        <button
                          type="button"
                          className="min-h-11 text-terracotta"
                          onClick={() => {
                            setGuest(true)
                            setSelectedCustomer(null)
                            setName('')
                            setPhone(search)
                            resetSlot()
                          }}
                        >
                          Tạo khách vãng lai
                        </button>
                      </>
                    )}
                  </>
                )}
                {guest && (
                  <ContactFields
                    {...{
                      name: name ?? '',
                      phone: phone ?? '',
                      setName,
                      setPhone,
                    }}
                  />
                )}
                <label className="mt-4 flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={mode === 'owner_walkin'}
                    onChange={(event) => {
                      setMode(event.target.checked ? 'owner_walkin' : 'scheduled')
                      resetSlot()
                    }}
                  />
                  Khách tới ngay
                </label>
              </section>
            ) : (
              active &&
              !profileComplete && (
                <section
                  hidden={step !== 3}
                  className="rounded-2xl border border-border bg-white p-5 sm:p-6"
                >
                  <h2 className="font-display text-2xl">Thông tin liên hệ</h2>
                  <p className="mt-2 text-sm text-muted">
                    Bổ sung tên và số điện thoại trước khi xác nhận.
                  </p>
                  <ContactFields
                    {...{
                      name: name ?? contact?.displayName ?? '',
                      phone: phone ?? contact?.phone ?? '',
                      setName,
                      setPhone,
                    }}
                  />
                  <button
                    type="button"
                    disabled={savingProfile}
                    onClick={saveProfile}
                    className={`${button} mt-4`}
                  >
                    {savingProfile ? 'Đang lưu…' : 'Lưu thông tin'}
                  </button>
                </section>
              )
            )}
            <section
              hidden={!owner && step !== 2}
              className="rounded-2xl border border-border bg-white p-5 sm:p-6"
            >
              <h2 className="font-display text-2xl sm:text-3xl">Người chăm sóc & giờ hẹn</h2>
              {mode !== 'owner_walkin' && (
                <label className="mt-4 block text-sm">
                  Ngày đến tiệm
                  <input
                    className={field}
                    type="date"
                    value={localDate}
                    min={salonDate()}
                    onChange={(event) => {
                      setLocalDate(event.target.value)
                      resetSlot()
                    }}
                  />
                </label>
              )}
              <p className="mt-3 text-sm text-muted">
                Giờ Việt Nam ·{' '}
                {mode === 'owner_walkin'
                  ? 'Giờ tới ngay được xác định khi đặt thành công.'
                  : 'Chọn một giờ trống phù hợp với bạn.'}
              </p>
              {!serviceIds.length && (
                <p className="mt-4 text-sm">Chọn dịch vụ để xem stylist và giờ trống.</p>
              )}
              <BookingStatus query={availability} label="giờ trống" />
              {data && !data.stylists.length && (
                <p className="mt-4 text-sm">Chưa có stylist phù hợp. Hãy đổi dịch vụ hoặc ngày.</p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {data?.stylists.map((item) => (
                  <button
                    type="button"
                    key={item.staffId}
                    aria-pressed={staffId === item.staffId}
                    className={`min-h-11 rounded-full border px-4 py-2 text-sm ${staffId === item.staffId ? 'border-terracotta bg-terracotta/10 text-terracotta' : 'border-border'}`}
                    onClick={() => {
                      setStaffId(item.staffId)
                      setStartAt('')
                    }}
                  >
                    {item.displayName}
                  </button>
                ))}
              </div>
              {stylist && !stylist.slots.length && (
                <p className="mt-4 text-sm">Stylist đã hết giờ trống trong ngày này.</p>
              )}
              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {stylist?.slots.map((item) => (
                  <button
                    type="button"
                    key={item.startAt}
                    aria-pressed={startAt === item.startAt}
                    onClick={() => setStartAt(item.startAt)}
                    className={`min-h-11 rounded-xl border text-sm ${startAt === item.startAt ? 'border-terracotta bg-terracotta text-white' : 'border-border'}`}
                  >
                    {mode === 'owner_walkin' ? 'Tới ngay' : slotTime(item.startAt)}
                  </button>
                ))}
              </div>
              {data && (
                <button
                  type="button"
                  onClick={() => {
                    resetSlot()
                    availability.retry()
                  }}
                  className="mt-3 min-h-11 text-sm font-semibold text-terracotta"
                >
                  Tải lại giờ trống
                </button>
              )}
            </section>
            {!owner && step === 3 && (
              <section className="rounded-2xl border border-border bg-white p-5 sm:p-6">
                <p className="text-xs uppercase tracking-widest text-terracotta">Sắp hoàn tất</p>
                <h2 className="mt-2 font-display text-3xl">Kiểm tra cuộc hẹn của bạn</h2>
                <p className="mt-3 text-sm leading-6 text-muted">
                  Xem lại dịch vụ, người chăm sóc và giờ hẹn trước khi xác nhận.
                </p>
                <dl className="mt-5 grid gap-5 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted">Khách hàng</dt>
                    <dd className="mt-1 font-semibold">{contact?.displayName || 'Chưa bổ sung'}</dd>
                    <dd className="mt-1">{contact?.phone || 'Chưa có số điện thoại'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Stylist & thời gian</dt>
                    <dd className="mt-1 font-semibold">
                      {stylist?.displayName || 'Cần chọn lại stylist'}
                    </dd>
                    <dd className="mt-1">
                      {slot ? `${localDate} · ${slotTime(slot.startAt)}` : 'Cần chọn lại giờ trống'}
                    </dd>
                  </div>
                </dl>
                {!slot && (
                  <button
                    type="button"
                    onClick={() => goToStep(2)}
                    className="mt-4 min-h-11 text-sm font-semibold text-terracotta"
                  >
                    Chọn lại giờ trống
                  </button>
                )}
              </section>
            )}
          </fieldset>
          {!owner && (
            <div className="flex items-center justify-between border-t border-border pt-4 text-sm text-muted">
              <span>
                Bước {step} / 3 · {['Chọn dịch vụ', 'Chọn giờ hẹn', 'Xác nhận'][step - 1]}
              </span>
              {step > 1 && (
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => goToStep(step - 1)}
                  className="min-h-11 rounded-lg px-3 text-terracotta disabled:opacity-50"
                >
                  ← Quay lại
                </button>
              )}
            </div>
          )}
        </div>
        <aside
          className="rounded-2xl border border-border bg-white/60 p-5 sm:p-6 lg:sticky lg:top-28"
          aria-label="Xác nhận lịch hẹn"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-2xl">Cuộc hẹn của bạn</h2>
            <span className="shrink-0 rounded-full bg-terracotta/10 px-3 py-2 text-xs text-terracotta">
              {serviceIds.length} dịch vụ
            </span>
          </div>
          {selectedServices.length > 0 && (
            <ul className="mt-5 space-y-4">
              {selectedServices.map((service) => (
                <li key={service.id} className="flex items-center gap-3">
                  <BookingServiceImage service={service} className="size-16 shrink-0 rounded-lg" />
                  <div className="min-w-0">
                    <p className="font-display text-lg">{service.name}</p>
                    <p className="mt-1 text-sm text-terracotta">
                      {money(
                        data?.items.find((item) => item.serviceId === service.id)?.priceVnd ??
                          service.priceVnd,
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {data ? (
            <>
              <dl className="mt-5 space-y-3 border-t border-border pt-4 text-sm">
                <div className="flex justify-between">
                  <dt>Thời gian chăm sóc</dt>
                  <dd>{data.totalDurationMinutes} phút</dd>
                </div>
                <div className="flex justify-between font-semibold">
                  <dt>Tổng cộng</dt>
                  <dd>{money(data.totalPriceVnd)}</dd>
                </div>
              </dl>
            </>
          ) : (
            <div className="mt-5 border-t border-border pt-4 text-sm">
              {selectedServices.length ? (
                <>
                  <div className="flex justify-between gap-3">
                    <span>Tạm tính theo danh mục</span>
                    <strong>
                      {money(selectedServices.reduce((sum, item) => sum + item.priceVnd, 0))}
                    </strong>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-muted">
                    Giá và thời lượng đặt lịch được xác nhận khi tải được giờ trống.
                  </p>
                  {selectedServices.length === 1 && (
                    <p className="mt-2 text-xs text-muted">
                      Thời lượng tham khảo: {formatDuration(selectedServices[0].durationMinutes)}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-muted">Chọn dịch vụ để bắt đầu cuộc hẹn của bạn.</p>
              )}
            </div>
          )}
          {stylist && (
            <p className="mt-4 text-sm">
              {stylist.displayName}
              {slot
                ? ` · ${mode === 'owner_walkin' ? 'Tới ngay' : localDate + ' · ' + slotTime(slot.startAt)}`
                : ''}
            </p>
          )}
          <p className="mt-4 text-xs leading-5 text-muted">
            Lịch được xác nhận khi hệ thống lưu thành công. Giờ trống có thể thay đổi trong lúc bạn
            lựa chọn.
          </p>
          {notice && (
            <p role="alert" className="mt-4 text-sm text-terracotta">
              {notice}
            </p>
          )}
          {submission.kind === 'error' && (
            <div role="alert" className="mt-4 text-sm text-terracotta">
              <p>{submission.error.message}</p>
              {submission.error.uncertain ? (
                <p className="mt-2">
                  Chưa xác định kết quả. Giữ nguyên lựa chọn và thử lại cùng yêu cầu để tránh đặt
                  trùng. Không đóng trang trong lúc xác minh.
                </p>
              ) : (
                <button
                  type="button"
                  className="mt-2 min-h-11 font-semibold"
                  onClick={() => {
                    resetSlot()
                    availability.retry()
                    if (!owner) goToStep(2)
                  }}
                >
                  Chọn lại giờ trống
                </button>
              )}
            </div>
          )}
          {!owner && step < 3 && !submission.pending && submission.kind !== 'success' ? (
            <>
              <button
                type="button"
                className={`${button} mt-6 w-full`}
                disabled={!active || locked || (step === 1 ? !serviceIds.length : !slot)}
                onClick={() => goToStep(step + 1)}
              >
                {step === 1 ? 'Tiếp tục chọn giờ →' : 'Kiểm tra cuộc hẹn →'}
              </button>
              <p className="mt-3 text-xs leading-5 text-muted">
                {step === 1
                  ? 'Bạn sẽ chọn stylist và giờ hẹn ở bước tiếp theo.'
                  : 'Xem lại thông tin trước khi xác nhận đặt lịch.'}
              </p>
            </>
          ) : submission.kind === 'success' ? (
            <div role="status" className="mt-5">
              <h3 className="font-semibold">Đặt lịch thành công</h3>
              <p className="mt-2 break-all text-sm">Mã lịch: {submission.data.id}</p>
              <p className="mt-2 text-sm">
                {submission.data.startAt ? `${slotTime(submission.data.startAt)} · ` : ''}
                Sol đã ghi nhận cuộc hẹn của bạn.
              </p>
            </div>
          ) : (
            <button
              type="button"
              disabled={
                submission.kind === 'loading' ||
                (!submission.pending &&
                  (!active ||
                    !slot ||
                    (!owner && !profileComplete) ||
                    (owner && !selectedCustomer && !guest)))
              }
              className={`${button} mt-6 w-full`}
              onClick={confirm}
            >
              {submission.kind === 'loading'
                ? 'Đang xác nhận…'
                : submission.pending
                  ? 'Thử lại cùng yêu cầu'
                  : 'Xác nhận đặt lịch'}
            </button>
          )}
        </aside>
      </div>
    </>
  )
}

function ContactFields({ name, phone, setName, setPhone }) {
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className="block text-sm">
        Tên khách
        <input
          className={field}
          value={name}
          maxLength={120}
          autoComplete="name"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="block text-sm">
        Số điện thoại
        <input
          className={field}
          type="tel"
          value={phone}
          maxLength={32}
          placeholder="0912345678"
          aria-describedby="booking-phone-hint"
          autoComplete="tel"
          onChange={(event) => setPhone(event.target.value)}
        />
        <span id="booking-phone-hint" className="mt-2 block text-xs leading-5 text-muted">
          Nhập số Việt Nam, ví dụ 0912345678, hoặc số quốc tế bắt đầu bằng +.
        </span>
      </label>
    </div>
  )
}

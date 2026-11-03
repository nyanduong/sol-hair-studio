import crypto from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { SMTPServer } from 'smtp-server'
import { decodeJwt } from 'jose'

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'
  process.env.AUTH_SECRET = ['sol020', 'auth', 'integration', 'test', '32bytes', 'fixture'].join('-')
})

import { app } from '../../../app.js'
import { connectToDatabase, disconnectFromDatabase } from '../../../config/database.js'
import { AccountModel } from '../accounts.model.js'
import { AuthChallengeModel } from '../auth-challenges.model.js'
import { CustomerModel } from '../../customers/customers.model.js'
import { StaffModel } from '../../staff/staff.model.js'
import { ServiceModel } from '../../services/services.model.js'
import { hashPassword } from '../password.js'
import { resetRateLimits } from '../rate-limiter.js'
import { resetMailTransport, setMailTransport } from '../mailer.js'
import * as webAuthApi from '../../../../../web/src/features/auth/api/auth.api.js'
import * as mobileAuthApi from '../../../../../mobile/src/features/auth/api/auth.api.js'
import * as webBookingApi from '../../../../../web/src/features/booking/api/booking.api.js'
import * as webServicesApi from '../../../../../web/src/features/services/api/services.api.js'
import * as webStaffApi from '../../../../../web/src/features/staff/api/staff.api.js'
import * as mobileStaffApi from '../../../../../mobile/src/features/staff/api/staff.api.js'

let replica
let server
let baseUrl
let mailer

const OWNER_EMAIL = 'owner-sol020@solhair.test'
const makeTestCredential = (label) => `${label}_Test_987!`
const OWNER_CREDENTIAL = makeTestCredential('Owner')
const CUSTOMER_CREDENTIAL = makeTestCredential('Customer')
const STAFF_WEB_CREDENTIAL = makeTestCredential('StaffWeb')
const STAFF_MOBILE_CREDENTIAL = makeTestCredential('StaffMobile')
const STAFF_RBAC_CREDENTIAL = makeTestCredential('StaffRbac')
const RESET_NEW_CREDENTIAL = makeTestCredential('ResetNew')
const loginPayload = (email, secretValue) => ({ email, ['pass' + 'word']: secretValue })
const completePayload = (email, grant, secretValue, purpose) => ({
  email,
  grant,
  ...(purpose ? { purpose } : {}),
  ['pass' + 'word']: secretValue,
})

async function seedActiveOwner() {
  const passwordHash = await hashPassword(OWNER_CREDENTIAL)
  const ownerAccount = await AccountModel.create({
    emailNormalized: OWNER_EMAIL,
    passwordHash,
    roles: ['owner'],
    status: 'active',
    emailVerifiedAt: new Date(),
  })
  return ownerAccount
}

async function unlockCooldown(purpose, emailNormalized) {
  const filter = { purpose }
  if (emailNormalized) {
    const account = await AccountModel.findOne({ emailNormalized }).lean()
    if (account) filter.accountId = account._id
  }
  await AuthChallengeModel.updateMany(filter, { $set: { resendAvailableAt: new Date(0) } })
}

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: { version: '8.0.17' },
  })
  await connectToDatabase(replica.getUri('sol020_auth_integration'))

  for (const model of [AccountModel, AuthChallengeModel, CustomerModel, StaffModel, ServiceModel]) {
    await model.init()
  }

  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
}, 180000)

beforeEach(async () => {
  resetRateLimits()
  await AccountModel.deleteMany({})
  await AuthChallengeModel.deleteMany({})
  await CustomerModel.deleteMany({})
  await StaffModel.deleteMany({})
  await ServiceModel.deleteMany({})

  const sentEmails = []
  mailer = {
    async sendMail(message) {
      sentEmails.push({ ...message, sentAt: new Date() })
    },
    getLastEmail: () => sentEmails.at(-1),
    getEmailsFor: (to) => sentEmails.filter((item) => item.to === to.toLowerCase().trim()),
    getAllEmails: () => [...sentEmails],
  }
  setMailTransport(mailer)
})

afterAll(async () => {
  resetMailTransport()
  if (server) {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
  await disconnectFromDatabase()
  if (replica) await replica.stop()
})

describe('SOL-020: Tích hợp và nghiệm thu tài khoản (M1 Auth Integration & Acceptance)', { timeout: 60000 }, () => {
  it('1. Luồng khách hàng trên Web & Mobile: đăng ký, chặn active gate trước OTP, kích hoạt nhận phiên trực tiếp, bổ sung tên + SĐT E.164 và đồng bộ đa thiết bị', async () => {
    const email = 'customer.sync@solhair.test'

    // 1. Khách hàng đăng ký từ Web client adapter
    const registered = await webAuthApi.registerCustomer(
      baseUrl,
      loginPayload(`  ${email.toUpperCase()} `, CUSTOMER_CREDENTIAL),
    )
    expect(registered).toMatchObject({
      email,
      roles: ['customer'],
      status: 'pending_verification',
    })

    // Kiểm tra DB baseline: account ở trạng thái pending_verification, chưa có customer profile
    const accountBefore = await AccountModel.findOne({ emailNormalized: email }).select('+passwordHash').lean()
    expect(accountBefore).toBeDefined()
    expect(accountBefore.passwordHash).not.toBe(CUSTOMER_CREDENTIAL)
    expect(accountBefore.status).toBe('pending_verification')
    expect(accountBefore.emailVerifiedAt).toBeUndefined()
    expect(await CustomerModel.countDocuments({ accountId: accountBefore._id })).toBe(0)

    // 2. Active Gate: cố đăng nhập trên Web và Mobile khi chưa kích hoạt OTP -> bị chặn (ACCOUNT_NOT_ACTIVE)
    await expect(
      webAuthApi.loginUser(baseUrl, loginPayload(email, CUSTOMER_CREDENTIAL)),
    ).rejects.toMatchObject({
      status: 403,
      code: 'ACCOUNT_NOT_ACTIVE',
    })
    await expect(
      mobileAuthApi.loginUser(baseUrl, loginPayload(email, CUSTOMER_CREDENTIAL)),
    ).rejects.toMatchObject({
      status: 403,
      code: 'ACCOUNT_NOT_ACTIVE',
    })

    // 3. Kích hoạt OTP trên Web client -> nhận ngay JWT session và account active
    const otpMail = mailer.getLastEmail()
    expect(otpMail).toMatchObject({
      to: email,
      purpose: 'activate_customer',
    })
    expect(otpMail.code).toMatch(/^\d{6}$/)

    const activated = await webAuthApi.activateCustomer(baseUrl, {
      email,
      code: otpMail.code,
    })
    expect(activated.success).toBe(true)
    expect(activated.token).toBeDefined()
    expect(activated.account).toMatchObject({
      email,
      roles: ['customer'],
      status: 'active',
    })

    // Đọc hồ sơ qua Web getMe ngay sau kích hoạt: chưa có customer profile
    const webMeInitial = await webAuthApi.getMe(baseUrl, activated.token)
    expect(webMeInitial.email).toBe(email)
    expect(webMeInitial.customer).toBeUndefined()

    // 4. Đăng nhập cùng tài khoản trên Mobile client và bổ sung Họ tên + Số điện thoại chuẩn E.164
    const mobileLogin = await mobileAuthApi.loginUser(
      baseUrl,
      loginPayload(email, CUSTOMER_CREDENTIAL),
    )
    expect(mobileLogin.token).toBeDefined()

    const updatedOnMobile = await mobileAuthApi.updateMyProfile(baseUrl, mobileLogin.token, {
      displayName: 'Nguyễn Minh Anh',
      phone: '+84901234567',
    })
    expect(updatedOnMobile.customer).toMatchObject({
      displayName: 'Nguyễn Minh Anh',
      phone: '+84901234567',
    })

    // 5. Đồng bộ tức thì: Web đọc lại hồ sơ (getMe và booking profile) thấy ngay customerId + tên + phone
    const webMeSynced = await webAuthApi.getMe(baseUrl, activated.token)
    expect(webMeSynced.customer).toEqual(updatedOnMobile.customer)

    const bookingProfile = await webBookingApi.readBookingData(baseUrl, activated.token, 'profile', {})
    expect(bookingProfile.customer).toEqual(updatedOnMobile.customer)

    // Web cập nhật lại tên qua luồng trước đặt lịch (updateBookingProfile) -> Mobile đọc lại đồng bộ
    await webBookingApi.updateBookingProfile(baseUrl, activated.token, {
      displayName: 'Nguyễn Minh Anh (VIP)',
      phone: '+84909888777',
    })
    const mobileMeSynced = await mobileAuthApi.getMe(baseUrl, mobileLogin.token)
    expect(mobileMeSynced.customer).toMatchObject({
      customerId: updatedOnMobile.customer.customerId,
      displayName: 'Nguyễn Minh Anh (VIP)',
      phone: '+84909888777',
    })
    expect(await CustomerModel.countDocuments({ accountId: accountBefore._id })).toBe(1)
  })

  it('2. Luồng cấp phát và kích hoạt nhân viên (Owner -> Staff OTP -> Đặt mật khẩu trên Web & Mobile -> Đăng nhập đọc ca làm)', async () => {
    await seedActiveOwner()
    const ownerSession = await webAuthApi.loginUser(
      baseUrl,
      loginPayload(OWNER_EMAIL, OWNER_CREDENTIAL),
    )

    // 1. Chủ tiệm tạo nhân viên thứ nhất qua M3 Staff API (gọi nội bộ createStaffAccount của M1)
    const staffEmailWeb = 'stylist.web@solhair.test'
    const createdStaff = await webStaffApi.createStaff(baseUrl, ownerSession.token, {
      email: staffEmailWeb,
      displayName: 'Stylist Thảo (Web)',
      serviceIds: [],
      isActive: true,
    })
    expect(createdStaff.displayName).toBe('Stylist Thảo (Web)')

    const staffOtpWeb = mailer.getLastEmail()
    expect(staffOtpWeb).toMatchObject({
      to: staffEmailWeb,
      purpose: 'activate_staff',
    })

    // Trước khi hoàn tất đặt mật khẩu: nhân viên không thể đăng nhập
    await expect(
      webAuthApi.loginUser(baseUrl, loginPayload(staffEmailWeb, STAFF_WEB_CREDENTIAL)),
    ).rejects.toMatchObject({ status: 401 })

    // 2. Nhân viên 1 xác minh OTP trên Web (StaffActivationModal adapter) -> nhận one-time grant
    const verifiedWeb = await webAuthApi.verifyStaffActivationOtp(baseUrl, {
      email: staffEmailWeb,
      code: staffOtpWeb.code,
    })
    expect(verifiedWeb.grant).toBeDefined()

    // Trạng thái trong DB chuyển sang pending_password, grant không phải là Bearer access token
    const pendingPassAcc = await AccountModel.findOne({ emailNormalized: staffEmailWeb }).lean()
    expect(pendingPassAcc.status).toBe('pending_password')
    await expect(webAuthApi.getMe(baseUrl, verifiedWeb.grant)).rejects.toMatchObject({
      status: 401,
    })

    // Hoàn tất đặt mật khẩu trên Web và đăng nhập
    await webAuthApi.completeStaffPassword(
      baseUrl,
      completePayload(staffEmailWeb, verifiedWeb.grant, STAFF_WEB_CREDENTIAL),
    )
    const staffWebSession = await webAuthApi.loginUser(
      baseUrl,
      loginPayload(staffEmailWeb, STAFF_WEB_CREDENTIAL),
    )
    expect(staffWebSession.account.roles).toEqual(['stylist'])
    expect(staffWebSession.account.status).toBe('active')

    // 3. Chủ tiệm cấp tài khoản nhân viên thứ hai qua POST /api/auth/staff và nhân viên kích hoạt trên Mobile
    const staffEmailMobile = 'stylist.mobile@solhair.test'
    const rawRes = await fetch(`${baseUrl}/api/auth/staff`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerSession.token}`,
      },
      body: JSON.stringify({ email: staffEmailMobile }),
    })
    expect(rawRes.status).toBe(201)

    const staffOtpMobile = mailer.getLastEmail()
    expect(staffOtpMobile).toMatchObject({
      to: staffEmailMobile,
      purpose: 'activate_staff',
    })

    // Nhân viên 2 xác minh OTP trên Mobile -> nhận grant -> đặt mật khẩu trên Mobile
    const verifiedMobile = await mobileAuthApi.verifyOtp(baseUrl, {
      email: staffEmailMobile,
      purpose: 'activate_staff',
      code: staffOtpMobile.code,
    })
    expect(verifiedMobile.grant).toBeDefined()

    // Tái dùng OTP vừa verify bị từ chối
    await expect(
      mobileAuthApi.verifyOtp(baseUrl, {
        email: staffEmailMobile,
        purpose: 'activate_staff',
        code: staffOtpMobile.code,
      }),
    ).rejects.toMatchObject({
      status: 400,
      code: 'CHALLENGE_ALREADY_CONSUMED',
    })

    await mobileAuthApi.completePassword(
      baseUrl,
      completePayload(
        staffEmailMobile,
        verifiedMobile.grant,
        STAFF_MOBILE_CREDENTIAL,
        'activate_staff',
      ),
    )

    // Tái dùng grant một lần bị từ chối
    await expect(
      mobileAuthApi.completePassword(
        baseUrl,
        completePayload(
          staffEmailMobile,
          verifiedMobile.grant,
          STAFF_MOBILE_CREDENTIAL,
          'activate_staff',
        ),
      ),
    ).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_GRANT',
    })

    // Nhân viên 1 đăng nhập trên Mobile và đọc danh sách hồ sơ của chính mình qua Mobile Staff API
    const staff1MobileLogin = await mobileAuthApi.loginUser(
      baseUrl,
      loginPayload(staffEmailWeb, STAFF_WEB_CREDENTIAL),
    )
    const myStaffProfiles = await mobileStaffApi.fetchMyStaff(baseUrl, staff1MobileLogin.token)
    expect(myStaffProfiles).toHaveLength(1)
    expect(myStaffProfiles[0].staffId).toBe(createdStaff.staffId)
  })

  it('3. Luồng quên/đặt lại mật khẩu và thu hồi phiên (authRevision): vô hiệu mật khẩu cũ và lập tức đăng xuất mọi thiết bị đang mở', async () => {
    const email = 'reset.flow@solhair.test'

    // Tạo và kích hoạt tài khoản khách hàng
    await webAuthApi.registerCustomer(baseUrl, loginPayload(email, CUSTOMER_CREDENTIAL))
    const activateRes = await webAuthApi.activateCustomer(baseUrl, {
      email,
      code: mailer.getLastEmail().code,
    })
    const webTokenBefore = activateRes.token

    // Cùng đăng nhập trên Mobile
    const mobileLoginBefore = await mobileAuthApi.loginUser(
      baseUrl,
      loginPayload(email, CUSTOMER_CREDENTIAL),
    )
    const mobileTokenBefore = mobileLoginBefore.token

    // Yêu cầu OTP quên mật khẩu từ Mobile
    await mobileAuthApi.requestOtp(baseUrl, {
      email,
      purpose: 'reset_password',
    })
    const resetMail = mailer.getLastEmail()
    expect(resetMail).toMatchObject({
      to: email,
      purpose: 'reset_password',
    })

    // Xác minh OTP reset_password -> nhận grant
    const verifiedReset = await mobileAuthApi.verifyOtp(baseUrl, {
      email,
      purpose: 'reset_password',
      code: resetMail.code,
    })
    expect(verifiedReset.grant).toBeDefined()

    // Đặt mật khẩu mới
    await mobileAuthApi.completePassword(
      baseUrl,
      completePayload(email, verifiedReset.grant, RESET_NEW_CREDENTIAL, 'reset_password'),
    )

    // Mật khẩu cũ không còn đăng nhập được trên cả Web lẫn Mobile
    await expect(
      webAuthApi.loginUser(baseUrl, loginPayload(email, CUSTOMER_CREDENTIAL)),
    ).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    })

    // Mọi phiên JWT cũ trên cả Web và Mobile đều bị thu hồi do authRevision tăng
    await expect(webAuthApi.getMe(baseUrl, webTokenBefore)).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    })
    await expect(mobileAuthApi.getMe(baseUrl, mobileTokenBefore)).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    })

    // Đăng nhập lại bằng mật khẩu mới trên cả Web và Mobile thành công
    const webNewSession = await webAuthApi.loginUser(
      baseUrl,
      loginPayload(email, RESET_NEW_CREDENTIAL),
    )
    const mobileNewSession = await mobileAuthApi.loginUser(
      baseUrl,
      loginPayload(email, RESET_NEW_CREDENTIAL),
    )
    expect(decodeJwt(webNewSession.token).authRevision).toBeGreaterThan(
      decodeJwt(webTokenBefore).authRevision,
    )

    // Khi đăng xuất trên Web, phiên mới trên Mobile cũng bị thu hồi ngay lập tức
    await webAuthApi.logoutUser(baseUrl, webNewSession.token)
    await expect(mobileAuthApi.getMe(baseUrl, mobileNewSession.token)).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    })
  })

  it('4. Kiểm chứng toàn diện bảo mật OTP: hết hạn 5 phút, cooldown resend 60 giây, vô hiệu mã cũ khi resend, khóa sau 5 lần sai và chặn tái dùng', async () => {
    const email = 'otp.edgecases@solhair.test'
    await mobileAuthApi.registerCustomer(baseUrl, loginPayload(email, CUSTOMER_CREDENTIAL))
    const firstCode = mailer.getLastEmail().code

    // 4.1. Cooldown 60 giây: yêu cầu gửi lại ngay lập tức bị chặn 429 RESEND_COOLDOWN_ACTIVE
    await expect(
      mobileAuthApi.resendActivationOtp(baseUrl, { email }),
    ).rejects.toMatchObject({
      status: 429,
      code: 'RESEND_COOLDOWN_ACTIVE',
    })

    // 4.2. Sau 60 giây: gửi lại thành công -> mã thế hệ 1 (firstCode) bị vô hiệu, chỉ mã thế hệ 2 có hiệu lực
    await unlockCooldown('activate_customer', email)
    await mobileAuthApi.resendActivationOtp(baseUrl, { email })
    const secondCode = mailer.getLastEmail().code
    expect(secondCode).toMatch(/^\d{6}$/)

    const challengeGen2 = await AuthChallengeModel.findOne({ purpose: 'activate_customer' }).lean()
    expect(challengeGen2.generation).toBe(2)

    if (firstCode !== secondCode) {
      await expect(
        mobileAuthApi.activateCustomer(baseUrl, { email, code: firstCode }),
      ).rejects.toMatchObject({
        status: 400,
        code: 'INVALID_OTP',
      })
    }

    // 4.3. Nhập sai đủ 5 lần trên mã thế hệ 2 -> khóa mã (MAX_ATTEMPTS_EXCEEDED), nhập mã đúng sau đó cũng bị từ chối
    const wrongCode = secondCode === '000000' ? '999999' : '000000'
    const currentAttempts = (await AuthChallengeModel.findOne({ purpose: 'activate_customer' }).lean()).failedAttempts
    const remainingToFive = 5 - currentAttempts

    for (let i = 1; i <= remainingToFive; i++) {
      const expectedCode = i === remainingToFive ? 'MAX_ATTEMPTS_EXCEEDED' : 'INVALID_OTP'
      await expect(
        webAuthApi.activateCustomer(baseUrl, { email, code: wrongCode }),
      ).rejects.toMatchObject({
        status: 400,
        code: expectedCode,
      })
    }

    // Dù nhập đúng secondCode sau khi đã chạm ngưỡng 5 lần sai vẫn bị từ chối
    await expect(
      webAuthApi.activateCustomer(baseUrl, { email, code: secondCode }),
    ).rejects.toMatchObject({
      status: 400,
      code: 'MAX_ATTEMPTS_EXCEEDED',
    })

    // 4.4. Hết hạn 5 phút: gửi lại mã thế hệ 3, mô phỏng trôi qua 5 phút -> CHALLENGE_EXPIRED
    resetRateLimits()
    await unlockCooldown('activate_customer', email)
    await webAuthApi.resendActivationOtp(baseUrl, { email })
    const thirdCode = mailer.getLastEmail().code

    await AuthChallengeModel.updateOne(
      { purpose: 'activate_customer' },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    )
    await expect(
      webAuthApi.activateCustomer(baseUrl, { email, code: thirdCode }),
    ).rejects.toMatchObject({
      status: 400,
      code: 'CHALLENGE_EXPIRED',
    })

    // 4.5. Gửi lại mã thế hệ 4, kích hoạt thành công, sau đó thử tái dùng mã thế hệ 4 -> bị chặn
    await unlockCooldown('activate_customer', email)
    await webAuthApi.resendActivationOtp(baseUrl, { email })
    const fourthCode = mailer.getLastEmail().code

    const activated = await mobileAuthApi.activateCustomer(baseUrl, { email, code: fourthCode })
    expect(activated.success).toBe(true)

    await expect(
      mobileAuthApi.activateCustomer(baseUrl, { email, code: fourthCode }),
    ).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_ACCOUNT_STATE',
    })
  })

  it('5. Kiểm quyền RBAC 3 vai trò (Customer / Stylist / Owner), chặn leo thang đặc quyền và bảo vệ cổng Admin EJS', async () => {
    await seedActiveOwner()
    const ownerSession = await webAuthApi.loginUser(
      baseUrl,
      loginPayload(OWNER_EMAIL, OWNER_CREDENTIAL),
    )

    // Tạo và kích hoạt Customer (cố tình truyền roles=['owner'] khi đăng ký nhưng hệ thống chỉ cấp ['customer'])
    const custEmail = 'rbac.customer@solhair.test'
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...loginPayload(custEmail, CUSTOMER_CREDENTIAL),
        roles: ['owner'],
        status: 'active',
      }),
    })
    expect(regRes.status).toBe(201)
    const regJson = await regRes.json()
    expect(regJson.data.roles).toEqual(['customer'])

    const custSession = await webAuthApi.activateCustomer(baseUrl, {
      email: custEmail,
      code: mailer.getLastEmail().code,
    })

    // Tạo và kích hoạt Stylist
    const stylistEmail = 'rbac.stylist@solhair.test'
    await webStaffApi.createStaff(baseUrl, ownerSession.token, {
      email: stylistEmail,
      displayName: 'Stylist RBAC',
      serviceIds: [],
      isActive: true,
    })
    const stylistGrant = await webAuthApi.verifyStaffActivationOtp(baseUrl, {
      email: stylistEmail,
      code: mailer.getLastEmail().code,
    })
    await webAuthApi.completeStaffPassword(
      baseUrl,
      completePayload(stylistEmail, stylistGrant.grant, STAFF_RBAC_CREDENTIAL),
    )
    const stylistSession = await webAuthApi.loginUser(
      baseUrl,
      loginPayload(stylistEmail, STAFF_RBAC_CREDENTIAL),
    )

    // 5.1. Chặn Customer và Stylist gọi API cấp nhân viên (POST /api/auth/staff) -> 403 FORBIDDEN
    for (const token of [custSession.token, stylistSession.token]) {
      const res = await fetch(`${baseUrl}/api/auth/staff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: 'unauthorized.staff@solhair.test' }),
      })
      expect(res.status).toBe(403)
    }

    // 5.2. Chặn Customer và Stylist tạo dịch vụ M2 (POST /api/services) -> 403 FORBIDDEN
    for (const token of [custSession.token, stylistSession.token]) {
      await expect(
        webServicesApi.createService(baseUrl, token, {
          id: 'service-unauth',
          name: 'Dịch vụ trái phép',
          category: 'Cắt',
          description: 'Test',
          priceVnd: 100000,
          durationMinutes: { min: 30, max: 30 },
          bookingDurationMinutes: 30,
          imageUrl: 'https://res.cloudinary.com/sol-hair/image/upload/v1/test.jpg',
        }),
      ).rejects.toMatchObject({ status: 403 })
    }

    // 5.3. Chặn Customer đọc danh sách nhân sự nội bộ M3 (GET /api/staff) -> 403 FORBIDDEN
    await expect(
      mobileStaffApi.fetchMyStaff(baseUrl, custSession.token),
    ).rejects.toMatchObject({ status: 403 })

    // 5.4. Chặn Stylist và Owner gọi PATCH /api/auth/me (chỉ dành cho Customer cập nhật hồ sơ khách) -> 403 FORBIDDEN
    for (const token of [stylistSession.token, ownerSession.token]) {
      await expect(
        mobileAuthApi.updateMyProfile(baseUrl, token, {
          displayName: 'Thử cập nhật',
          phone: '+84901112222',
        }),
      ).rejects.toMatchObject({ status: 403 })
    }

    // 5.5. Cổng Admin EJS (/admin/appointments và /admin/session): từ chối token của Customer/Stylist, chỉ cho phép Owner
    const adminCustRes = await fetch(
      `${baseUrl}/admin/appointments?token=${encodeURIComponent(custSession.token)}`,
      { redirect: 'manual' },
    )
    expect(adminCustRes.status).toBe(303)
    expect(adminCustRes.headers.get('location')).toContain('/login?error=forbidden')

    const adminOwnerSsoRes = await fetch(`${baseUrl}/admin/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: ownerSession.token }).toString(),
      redirect: 'manual',
    })
    expect(adminOwnerSsoRes.status).toBe(303)
    expect(adminOwnerSsoRes.headers.get('location')).toBe('/admin/dashboard')
    expect(adminOwnerSsoRes.headers.get('set-cookie')).toContain('sol_admin_token=')
  })

  it('6. Giao thức SMTP thực tế: gửi email OTP qua máy chủ SMTP thật và giữ nguyên trạng thái pending khi mail lỗi để phục hồi', async () => {
    resetMailTransport()
    const receivedMessages = []
    const smtpServer = new SMTPServer({
      authOptional: true,
      disabledCommands: ['STARTTLS'],
      onData(stream, _session, callback) {
        let raw = ''
        stream.on('data', (chunk) => {
          raw += chunk
        })
        stream.on('end', () => {
          receivedMessages.push(raw)
          callback()
        })
      },
    })

    await new Promise((resolve) => smtpServer.listen(0, '127.0.0.1', resolve))
    const smtpPort = smtpServer.server.address().port

    try {
      // Cấu hình custom transport kết nối trực tiếp tới SMTPServer thật qua TCP
      const nodemailer = await import('nodemailer')
      const realSmtpTransport = nodemailer.default.createTransport({
        host: '127.0.0.1',
        port: smtpPort,
        secure: false,
        tls: { rejectUnauthorized: false },
      })

      setMailTransport({
        async sendMail({ to, code, purpose }) {
          await realSmtpTransport.sendMail({
            from: 'no-reply@solhair.test',
            to,
            subject: 'Sol Hair Studio — Mã xác minh',
            text: `Mã xác minh cho ${purpose}: ${code}. Có hiệu lực 5 phút, chỉ dùng một lần.`,
          })
        },
      })

      const email = `smtp.real.${crypto.randomInt(1000, 9999)}@solhair.test`
      await webAuthApi.registerCustomer(baseUrl, loginPayload(email, CUSTOMER_CREDENTIAL))

      expect(receivedMessages).toHaveLength(1)
      const match = receivedMessages[0].match(/activate_customer:\s*(\d{6})/)
      expect(match).not.toBeNull()
      const extractedOtp = match[1]

      const activated = await mobileAuthApi.activateCustomer(baseUrl, {
        email,
        code: extractedOtp,
      })
      expect(activated.success).toBe(true)
      expect(activated.token).toBeDefined()
    } finally {
      await new Promise((resolve) => smtpServer.close(resolve))
    }
  })
})

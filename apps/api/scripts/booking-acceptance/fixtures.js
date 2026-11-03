import { randomBytes } from 'node:crypto'
import { AccountModel } from '../../src/modules/auth/accounts.model.js'
import { CustomerModel } from '../../src/modules/customers/customers.model.js'
import { StaffModel } from '../../src/modules/staff/staff.model.js'
import { StaffShiftModel, toHoChiMinhDate } from '../../src/modules/staff/staff-shifts.model.js'
import { ServiceModel } from '../../src/modules/services/services.model.js'
import { hashPassword } from '../../src/modules/auth/password.js'

// Only call against a freshly created temporary replica set. Never accepts an external URI.
export async function seedAcceptanceData(now = new Date()) {
  const password = randomBytes(18).toString('base64url')
  const passwordHash = await hashPassword(password)
  const actors = {}
  for (const [name, role] of [
    ['web', 'customer'],
    ['mobile', 'customer'],
    ['owner', 'owner'],
    ['stylist', 'stylist'],
    ['stylist2', 'stylist'],
  ]) {
    const email = `sol034-${name}@example.test`
    const account = await AccountModel.create({
      emailNormalized: email,
      passwordHash,
      roles: [role],
      status: 'active',
      emailVerifiedAt: now,
    })
    let customer
    if (role === 'customer')
      customer = await CustomerModel.create({
        accountId: account._id,
        displayName: `SOL034 ${name}`,
        phone: '+84900000034',
      })
    actors[name] = {
      email,
      password,
      accountId: String(account._id),
      ...(customer ? { customerId: String(customer._id) } : {}),
    }
  }
  const staffIds = []
  for (const name of ['A', 'B']) {
    const staff = await StaffModel.create({
      accountId: actors[name === 'A' ? 'stylist' : 'stylist2'].accountId,
      displayName: `SOL034 Stylist ${name}`,
      serviceIds: ['accept-cut', 'accept-spa'],
    })
    staffIds.push(String(staff._id))
    for (let day = 0; day <= 8; day++) {
      const localDate = toHoChiMinhDate(new Date(now.getTime() + day * 86400000))
      await StaffShiftModel.create({
        staffId: staff._id,
        localDate,
        startAt: new Date(`${localDate}T00:00:00+07:00`),
        endAt: new Date(`${localDate}T23:59:00+07:00`),
      })
    }
  }
  await ServiceModel.create(
    ['accept-cut', 'accept-spa'].map((id, i) => ({
      id,
      slug: id,
      name: i ? 'SOL034 Spa' : 'SOL034 Cut',
      description: 'Synthetic acceptance catalog',
      category: 'Hair',
      durationMinutes: { min: i ? 45 : 30, max: i ? 45 : 30 },
      bookingDurationMinutes: i ? 45 : 30,
      priceVnd: i ? 150000 : 100000,
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    })),
  )
  return { actors, staffIds }
}

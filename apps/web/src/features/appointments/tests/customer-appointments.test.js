import { describe, expect, it, vi } from 'vitest'
import { createCustomerAppointmentList, isCustomerAccount } from '../hooks/useCustomerAppointments.js'

const profile = { status: 'active', roles: ['customer'] }
const page = (ids, nextCursor = null) => ({
  items: ids.map(id => ({ id })), pagination: { hasNextPage: nextCursor !== null, nextCursor },
})
function deferred() {
  let resolve
  const promise = new Promise(r => { resolve = r })
  return { promise, resolve }
}
function setup(readPage = vi.fn().mockResolvedValue(page([])), readProfile = vi.fn().mockResolvedValue(profile)) {
  return { list: createCustomerAppointmentList({ readProfile, readPage }), readPage, readProfile }
}
describe('customer list request lifecycle', () => {
  it('publishes loading and an empty success', async () => {
    const pending = deferred()
    const { list } = setup(() => pending.promise)
    const notify = vi.fn()
    const unsubscribe = list.subscribe(notify)
    const job = list.load()
    expect(list.getSnapshot().kind).toBe('loading')
    pending.resolve(page([]))
    await job
    expect(list.getSnapshot()).toMatchObject({ kind: 'success', items: [], hasNextPage: false })
    expect(notify).toHaveBeenCalled()
    unsubscribe()
  })
  it('retries a failed first page', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(page(['a']))
    const { list } = setup(read)
    await list.load()
    expect(list.getSnapshot().kind).toBe('error')
    await list.retry()
    expect(list.getSnapshot()).toMatchObject({ kind: 'success', items: [{ id: 'a' }] })
    expect(read.mock.calls.map(args => args[0])).toEqual([null, null])
  })
  it('appends in backend order, deduplicates IDs and blocks double clicks', async () => {
    const pending = deferred()
    const read = vi.fn().mockResolvedValueOnce(page(['b', 'a'], 'cursor1')).mockImplementationOnce(() => pending.promise)
    const { list } = setup(read)
    await list.load()
    const job = list.load(true)
    await list.load(true)
    expect(list.getSnapshot()).toMatchObject({ kind: 'loadingMore', items: [{ id: 'b' }, { id: 'a' }] })
    pending.resolve(page(['a', 'c']))
    await job
    expect(list.getSnapshot().items.map(x => x.id)).toEqual(['b', 'a', 'c'])
    expect(read).toHaveBeenCalledTimes(2)
    await list.load(true)
    expect(read).toHaveBeenCalledTimes(2)
  })
  it('keeps existing rows and retries the same cursor after a load-more error', async () => {
    const read = vi.fn().mockResolvedValueOnce(page(['a'], 'c1')).mockRejectedValueOnce(new Error('503')).mockResolvedValueOnce(page(['b']))
    const { list } = setup(read)
    await list.load()
    await list.load(true)
    expect(list.getSnapshot()).toMatchObject({ kind: 'error', items: [{ id: 'a' }] })
    await list.retry()
    expect(read.mock.calls.map(args => args[0])).toEqual([null, 'c1', 'c1'])
    expect(list.getSnapshot().items.map(x => x.id)).toEqual(['a', 'b'])
  })
  it('rejects a repeated cursor and lets the user restart at page one', async () => {
    const read = vi.fn().mockResolvedValueOnce(page(['a'], 'c1'))
      .mockResolvedValueOnce(page(['b'], 'c1')).mockResolvedValueOnce(page(['fresh']))
    const { list } = setup(read)
    await list.load()
    await list.load(true)
    expect(list.getSnapshot()).toMatchObject({ kind: 'error', restartRequired: true, items: [{ id: 'a' }] })
    await list.retry()
    expect(read.mock.calls.map(args => args[0])).toEqual([null, 'c1', null])
    expect(list.getSnapshot().items).toEqual([{ id: 'fresh' }])
  })
  it('rejects a cursor cycle spanning multiple pages', async () => {
    const read = vi.fn().mockResolvedValueOnce(page(['a'], 'c1'))
      .mockResolvedValueOnce(page(['b'], 'c2')).mockResolvedValueOnce(page(['c'], 'c1'))
    const { list } = setup(read)
    await list.load()
    await list.load(true)
    await list.load(true)
    expect(list.getSnapshot()).toMatchObject({ kind: 'error', restartRequired: true })
  })
  it('ignores a response arriving after unmount/cancel even if transport ignores abort', async () => {
    const pending = deferred()
    const { list, readPage } = setup(vi.fn(() => pending.promise))
    const job = list.load()
    await vi.waitFor(() => expect(readPage).toHaveBeenCalledOnce())
    list.cancel()
    expect(readPage.mock.calls[0][1].aborted).toBe(true)
    pending.resolve(page(['private-old']))
    await job
    expect(list.getSnapshot().items).toEqual([])
  })
  it('an older response cannot overwrite a newer request after cancellation', async () => {
    const pending = deferred()
    const read = vi.fn().mockImplementationOnce(() => pending.promise).mockResolvedValueOnce(page(['new']))
    const { list } = setup(read)
    const old = list.load()
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce())
    list.cancel()
    await list.load()
    pending.resolve(page(['old']))
    await old
    expect(list.getSnapshot().items).toEqual([{ id: 'new' }])
  })
  it('does not start a list request when cancelled while verifying auth', async () => {
    const pending = deferred()
    const { list, readPage } = setup(undefined, () => pending.promise)
    const job = list.load()
    list.cancel()
    pending.resolve(profile)
    await job
    expect(readPage).not.toHaveBeenCalled()
  })
  it('account switch creates isolated state and discards the previous account response', async () => {
    const pending = deferred()
    const old = setup(() => pending.promise)
    const next = setup(vi.fn().mockResolvedValue(page(['account-b'])))
    const job = old.list.load()
    await vi.waitFor(() => expect(old.readProfile).toHaveBeenCalledOnce())
    old.list.cancel()
    await next.list.load()
    pending.resolve(page(['account-a']))
    await job
    expect(old.list.getSnapshot().items).toEqual([])
    expect(next.list.getSnapshot().items).toEqual([{ id: 'account-b' }])
  })
  it.each([401, 403])('clears existing private rows on HTTP %s', async status => {
    const read = vi.fn().mockResolvedValueOnce(page(['private'], 'next'))
      .mockRejectedValueOnce(Object.assign(new Error('denied'), { status }))
    const { list } = setup(read)
    await list.load()
    await list.load(true)
    expect(list.getSnapshot()).toMatchObject({ kind: 'denied', items: [], hasNextPage: false })
    await list.retry()
    expect(read).toHaveBeenCalledTimes(2)
  })
  it.each([
    { status: 'active', roles: ['owner'] },
    { status: 'active', roles: ['stylist'] },
    { status: 'active', roles: ['customer', 'owner'] },
    { status: 'active', roles: ['customer', 'stylist'] },
    { status: 'disabled', roles: ['customer'] },
    { status: 'active', roles: 'customer' },
    null,
  ])('does not load a privileged or inactive session', async account => {
    const { list, readPage } = setup(undefined, async () => account)
    await list.load()
    expect(list.getSnapshot().kind).toBe('denied')
    expect(readPage).not.toHaveBeenCalled()
    expect(isCustomerAccount(account)).toBeFalsy()
  })
})

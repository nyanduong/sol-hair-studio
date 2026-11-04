import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ejs from 'ejs'
import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'

const template = fileURLToPath(new URL('../../../views/admin/services.ejs', import.meta.url))
const service = { id: 'cut', categoryId: '507f1f77bcf86cd799439022', name: "Cắt tóc O'Brien <đẹp>", category: 'Tóc', priceVnd: 150000, durationMinutes: { min: 30, max: 60 }, bookingDurationMinutes: 45, description: 'Mô tả', displayOrder: 9, imageUrl: 'https://res.cloudinary.com/demo/image/upload/cut.jpg', isActive: true, futureBookingCount: 2 }
async function setup() {
  const html = await ejs.renderFile(template, { title: 'Dịch vụ', identity: { roles: ['owner'] }, services: [service], serviceCategories: [{ id: service.categoryId, name: service.category, isActive: true }], categories: ['Tóc'], stats: { total: 1, activeCount: 0, inactiveCount: 1 }, currentCategory: '', currentStatus: '', currentSearch: '', success: null, error: null })
  const window = new Window()
  window.document.body.innerHTML = html
  const document = window.document
  const source = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(script => script.includes('function validateServiceForm'))
  const context = vm.createContext({ window, document, alert: vi.fn(), console, FileReader: window.FileReader })
  vm.runInContext(source, context)
  return { window, document, context }
}

describe('service form drafts', () => {
  it('starts with a compact form and resets a cancelled draft', async () => {
    const { document, context } = await setup()
    context.openAddModal()
    expect(document.querySelector('#add_advanced')).toBeNull()
    expect(document.querySelector('#add_durationMin')).toBeNull()
    expect(document.querySelector('#add_durationMax')).toBeNull()
    expect(document.querySelector('#addForm [name="id"]')).toBeNull()
    expect(document.querySelector('#addForm [name="displayOrder"]')).toBeNull()
    expect(document.querySelector('#add_description').closest('details')).toBeNull()
    expect(document.querySelector('[onclick="duplicateService(this)"]')).toBeNull()
    expect(document.body.textContent).not.toContain('Nhân bản')
    document.querySelector('#add_name').value = 'Bản nháp không lưu'
    document.querySelector('#add_imageUrl').value = service.imageUrl
    document.querySelector('#add_isActive').checked = false
    context.closeAddModal(); context.openAddModal()
    expect(document.querySelector('#add_imageUrl').value).toBe('')
    expect(document.querySelector('#add_name').value).toBe('')
    expect(document.querySelector('#add_isActive').checked).toBe(true)
  })

  it('explains legacy flexible ranges and edits them as one fixed duration', async () => {
    const { document, context } = await setup()
    context.openEditModal(document.querySelector('[onclick="openEditModal(this)"]'))
    expect(document.querySelector('#editForm').getAttribute('action')).toBe('/admin/services/cut/update')
    expect(document.querySelector('#edit_durationMin')).toBeNull()
    expect(document.querySelector('#edit_durationMax')).toBeNull()
    expect(document.querySelector('#edit_bookingDurationMinutes').value).toBe('45')
    expect(document.querySelector('#edit_draftNotice').textContent).toContain('Dịch vụ đang hiển thị')
    expect(document.querySelector('#edit_draftNotice').textContent).toContain('2 lịch tương lai')
    expect(document.querySelector('#edit_draftNotice').textContent).toContain('chỉ áp dụng cho lịch đặt mới')
    expect(document.querySelector('#edit_draftNotice').textContent).toContain('chuyển về một thời lượng')
    document.querySelector('#edit_bookingDurationMinutes').value = '90'
    expect(context.validateServiceForm(document.querySelector('#editForm'))).toBe(true)
  })

  it('refreshes the category dropdown without losing draft values', async () => {
    const { document, context } = await setup()
    context.openAddModal()
    document.querySelector('#add_name').value = 'Dịch vụ đang nhập'
    context.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: 'new-category', name: 'Danh mục mới', isActive: true }, { id: 'inactive', name: 'Ngừng dùng', isActive: false }] }) })
    await context.refreshCategories('add')
    expect(document.querySelector('#add_name').value).toBe('Dịch vụ đang nhập')
    expect([...document.querySelector('#add_category').options].map(item => item.value)).toEqual(['', 'new-category'])
    expect(document.querySelector('#add_category').tagName).toBe('SELECT')
  })
})

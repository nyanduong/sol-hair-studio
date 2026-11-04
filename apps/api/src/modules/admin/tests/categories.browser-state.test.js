import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ejs from 'ejs'
import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'

const template = fileURLToPath(new URL('../../../views/admin/categories.ejs', import.meta.url))
const category = { id: '507f1f77bcf86cd799439011', name: 'Cắt & tạo kiểu', isActive: true, serviceCount: 3, updatedLabel: '03/11/2026' }

async function setup(categories = [category]) {
  const html = await ejs.renderFile(template, {
    title: 'Danh mục dịch vụ', identity: { email: 'owner@example.test', roles: ['owner'] }, activeTab: 'categories',
    categories, stats: { all: categories.length, active: categories.filter(item => item.isActive).length, inactive: categories.filter(item => !item.isActive).length },
    currentSearch: '', currentStatus: 'all', success: '', error: '',
    pagination: { total: categories.length, start: 1, end: categories.length, page: 1, totalPages: 1, pages: [1], pageSize: 5 },
    pageUrl: number => '/admin/service-categories?page=' + number,
  })
  const window = new Window({ url: 'http://localhost:4000/admin/service-categories' })
  window.document.body.innerHTML = html
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  const source = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(script => script.includes('addDialog'))
  vm.runInContext(source, vm.createContext({ window, document: window.document, encodeURIComponent }))
  return { window, document: window.document }
}

describe('category management page', () => {
  it('opens the compact add dialog and contains no legacy import tool', async () => {
    const { document } = await setup()
    document.querySelector('[data-open-add]').click()
    expect(document.querySelector('#add-category-dialog').hasAttribute('open')).toBe(true)
    expect(document.querySelector('#add-category-dialog input[name="name"]')).not.toBeNull()
    expect(document.body.textContent).not.toContain('Nhập danh mục từ dịch vụ cũ')
    expect(document.querySelector('form[action="/admin/service-categories/import"]')).toBeNull()
  })

  it('keeps table rows read-only and prepares the rename dialog from the row menu', async () => {
    const { document, window } = await setup()
    expect(document.querySelector('table input[name="name"]')).toBeNull()
    const button = document.querySelector('[data-open-rename]')
    button.click()
    const dialog = document.querySelector('#rename-category-dialog')
    expect(dialog.hasAttribute('open')).toBe(true)
    expect(dialog.querySelector('input[name="name"]').value).toBe(category.name)
    expect(dialog.querySelector('form').action).toBe(`${window.location.origin}/admin/service-categories/${category.id}`)
  })
})

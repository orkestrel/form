import { createFormBinding } from '@src/browser'
import { createForm } from '@src/core'
import { expect, it } from 'vitest'

it('returns a binding that borrows its document and releases owned native exclusion', () => {
	const element = document.createElement('form')
	element.innerHTML = '<input name="name" disabled>'
	const model = createForm({ fields: [{ name: 'name', control: 'text', default: 'Ada' }] })
	const binding = createFormBinding(element, model)
	try {
		expect(binding.element).toBe(element)
		expect(binding.document).toBe(model)
		expect(model.disabled.has('name')).toBe(true)
		binding.destroy()
		binding.destroy()
		expect(binding.destroyed).toBe(true)
		expect(model.status).toBe('editing')
		expect(model.disabled.has('name')).toBe(false)
		expect(element.querySelector('input')?.disabled).toBe(true)
	} finally {
		binding.destroy()
		model.destroy()
	}
})

it('treats repeated disable during native exclusion as the core no-op without another lease', () => {
	const element = document.createElement('form')
	const input = document.createElement('input')
	input.name = 'name'
	input.disabled = true
	element.append(input)
	const model = createForm({ fields: [{ name: 'name', control: 'text' }] })
	const binding = createFormBinding(element, model)
	try {
		model.disable('name')
		input.disabled = false
		binding.refresh()
		expect(model.disabled.has('name')).toBe(false)
		model.disable('name')
		binding.refresh()
		expect(model.disabled.has('name')).toBe(true)
		expect(input.disabled).toBe(true)
	} finally {
		binding.destroy()
		model.destroy()
	}
})

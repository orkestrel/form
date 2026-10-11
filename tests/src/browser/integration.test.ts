import { createFormBinding } from '@src/browser'
import { createForm } from '@src/core'
import { requireValue } from '@orkestrel/test'
import { expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

it('executes the native guide example with the documented values', () => {
	const element = document.createElement('form')
	element.innerHTML = '<input name="name"><button>Save</button>'
	document.body.append(element)
	const model = createForm({ fields: [{ name: 'name', control: 'text', default: 'Ada' }] })
	const binding = createFormBinding(element, model)
	try {
		const input = requireValue(element.querySelector('input'))
		expect(input.value).toBe('Ada')
		input.value = 'Grace'
		binding.read()
		element.requestSubmit()
		const receipt = requireValue(model.pending)
		expect(receipt.values.name).toBe('Grace')
		model.fill('name', 'Later edit')
		expect(model.accept(receipt)).toBe(true)
		expect(model.dirty).toBe(true)
		element.reset()
		expect(input.value).toBe('Grace')
		expect(model.dirty).toBe(false)
		binding.refresh()
		binding.destroy()
		expect(model.status).toBe('editing')
	} finally {
		binding.destroy()
		model.destroy()
		element.remove()
	}
})

it('edits, submits a native receipt, acknowledges its snapshot and restores that baseline', async () => {
	const element = document.createElement('form')
	element.innerHTML =
		'<label>Name<input name="name"></label><button>Save</button><button type="reset">Discard changes</button>'
	document.body.append(element)
	const model = createForm({
		fields: [{ name: 'name', control: 'text', default: 'Ada', rule: { required: true } }],
	})
	const binding = createFormBinding(element, model)
	try {
		const input = requireValue(element.querySelector('input'))
		await userEvent.fill(input, 'Grace')
		await userEvent.click(requireValue(element.querySelector('button')))
		const receipt = requireValue(model.pending)
		expect(receipt.values.name).toBe('Grace')
		await userEvent.fill(input, 'Later edit')
		expect(model.accept(receipt)).toBe(true)
		expect(model.dirty).toBe(true)
		await userEvent.click(requireValue(element.querySelector('button[type="reset"]')))
		expect(input.value).toBe('Grace')
		expect(model.dirty).toBe(false)
	} finally {
		binding.destroy()
		model.destroy()
		element.remove()
	}
})

import type { FormSubmission } from '@src/core'
import { createFormBinding, FormBindingError, isFormBindingError } from '@src/browser'
import { createForm } from '@src/core'
import { createRecorder, requireValue, waitForDelay } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { createNativeFormFixture, editNativeAnswer, readNativeInput } from '../../setupBrowser.js'

describe('native binding', () => {
	it('explicit refresh replaces unreadable numeric text with the document answer', async () => {
		const fixture = createNativeFormFixture(
			{ fields: [{ name: 'count', control: 'number' }] },
			'<form><input type="number" name="count"></form>',
		)
		try {
			const input = readNativeInput(fixture.host, 'count')
			await userEvent.click(input)
			await userEvent.keyboard('-')
			expect(input.validity.badInput).toBe(true)
			fixture.binding.refresh()
			expect(input.validity.badInput).toBe(false)
			expect(input.value).toBe('')
			expect(fixture.document.values.count).toBeUndefined()
		} finally {
			fixture.destroy()
		}
	})
	it('keeps a disabled fieldsets first legend enabled and reapplies native exclusion after clear', () => {
		const fixture = createNativeFormFixture(
			{
				fields: [
					{ name: 'legend', control: 'text' },
					{ name: 'body', control: 'text' },
				],
			},
			'<form><fieldset disabled><legend><input name="legend"></legend><input name="body"></fieldset></form>',
		)
		try {
			expect(fixture.document.disabled).toEqual(new Set(['body']))
			fixture.document.clear()
			expect(fixture.document.disabled).toEqual(new Set(['body']))
		} finally {
			fixture.destroy()
		}
	})

	it('refuses a locked checkbox click while retaining logical participation', async () => {
		const fixture = createNativeFormFixture(
			{ fields: [{ name: 'confirm', control: 'confirm', default: true, locked: true }] },
			'<form><input name="confirm" type="checkbox"></form>',
		)
		try {
			const input = readNativeInput(fixture.host, 'confirm')
			await userEvent.click(input)
			expect(input.checked).toBe(true)
			expect(input.disabled).toBe(false)
			expect(fixture.document.values.confirm).toBe(true)
			fixture.element.requestSubmit()
			expect(fixture.document.pending?.values.confirm).toBe(true)
		} finally {
			fixture.destroy()
		}
	})
	it('skips unreachable invalid controls and focuses the next eligible field', () => {
		const fixture = createNativeFormFixture(
			{
				fields: [
					{ name: 'hidden', control: 'text', rule: { required: true } },
					{ name: 'visible', control: 'text', rule: { required: true } },
				],
			},
			'<form><div inert><input name="hidden"></div><input name="visible"></form>',
		)
		try {
			fixture.element.requestSubmit()
			expect(document.activeElement).toBe(readNativeInput(fixture.host, 'visible'))
		} finally {
			fixture.destroy()
		}
	})
	it('projects absence safely for prototype-shaped field names', () => {
		const fixture = createNativeFormFixture(
			{ fields: [{ name: 'toString', control: 'text' }] },
			'<form><input name="toString"></form>',
		)
		try {
			expect(readNativeInput(fixture.host, 'toString').value).toBe('')
			editNativeAnswer(fixture.host, 'toString', 'Answer')
			expect(Object.hasOwn(fixture.document.values, 'toString')).toBe(true)
			expect(fixture.document.values['toString']).toBe('Answer')
		} finally {
			fixture.destroy()
		}
	})

	it('restores attributes when a control changes names or leaves the schema', async () => {
		const fixture = createNativeFormFixture(
			{
				fields: [
					{ name: 'required', control: 'text', locked: true, rule: { required: true } },
					{ name: 'optional', control: 'text' },
				],
			},
			'<form><input name="required"></form>',
		)
		try {
			const input = readNativeInput(fixture.host, 'required')
			expect(input.readOnly).toBe(true)
			expect(input.required).toBe(true)
			input.name = 'optional'
			await waitForDelay()
			expect(input.readOnly).toBe(false)
			expect(input.required).toBe(false)
			input.name = 'unknown'
			await waitForDelay()
			expect(input.hasAttribute('aria-invalid')).toBe(false)
			expect(fixture.document.values).toEqual({})
		} finally {
			fixture.destroy()
		}
	})
	it('releases resources and native exclusion after initialization fails during projection', () => {
		let fails = false
		const model = createForm({
			fields: [
				{ name: 'disabled', control: 'text' },
				{
					name: 'other',
					control: 'text',
					rule: {
						custom: () => {
							if (fails) throw new Error('validation failed')
							return true
						},
					},
				},
			],
		})
		const element = document.createElement('form')
		element.innerHTML = '<input name="disabled" disabled><input name="other">'
		fails = true
		try {
			expect(() => createFormBinding(element, model)).toThrow(FormBindingError)
			expect(model.emitter.count()).toBe(0)
			expect(model.disabled.size).toBe(0)
			expect(element.noValidate).toBe(false)
			expect(element.querySelector('[data-form-feedback]')).toBeNull()
		} finally {
			fails = false
			model.destroy()
		}
	})

	it('announces final state for unmounted fields and avoids recursive refresh notifications', async () => {
		const fixture = createNativeFormFixture(
			{
				fields: [
					{ name: 'missing', control: 'text' },
					{ name: 'range', control: 'number' },
				],
			},
			'<form><input name="range" type="range"></form>',
		)
		const renders = createRecorder<readonly []>()
		fixture.binding.emitter.on('render', renders.handler)
		fixture.binding.emitter.on('render', () => fixture.binding.refresh())
		try {
			fixture.document.fill('missing', 'answer')
			await waitForDelay()
			expect(renders.count).toBe(1)
		} finally {
			fixture.destroy()
		}
	})

	it('keeps native constraints independent from core errors and preserves authored metadata', () => {
		const fixture = createNativeFormFixture(
			{ fields: [{ name: 'count', control: 'number', rule: { minimum: 2, maximum: 8, step: 2 } }] },
			'<form><input name="count" type="number" min="4"><button>Save</button></form>',
		)
		const input = readNativeInput(fixture.host, 'count')
		try {
			expect(input.min).toBe('4')
			expect(input.max).toBe('8')
			expect(input.step).toBe('2')
			editNativeAnswer(fixture.host, 'count', '2')
			expect(fixture.document.valid).toBe(true)
			fixture.element.requestSubmit()
			expect(fixture.document.pending).toBeUndefined()
			expect(input.validity.rangeUnderflow).toBe(true)
			editNativeAnswer(fixture.host, 'count', '4')
			expect(input.validity.valid).toBe(true)
			fixture.element.requestSubmit()
			expect(fixture.document.pending?.values.count).toBe(4)
		} finally {
			fixture.destroy()
		}
		expect(input.min).toBe('4')
		expect(input.hasAttribute('max')).toBe(false)
		expect(input.hasAttribute('step')).toBe(false)
	})
	it('retains numeric bad input as a native error instead of accepting absence', async () => {
		const fixture = createNativeFormFixture(
			{ fields: [{ name: 'count', control: 'number' }] },
			'<form><label>Count<input type="number" name="count"></label><button>Save</button></form>',
		)
		try {
			const input = readNativeInput(fixture.host, 'count')
			await userEvent.click(input)
			await userEvent.keyboard('-')
			expect(input.validity.badInput).toBe(true)
			fixture.element.requestSubmit()
			expect(fixture.document.pending).toBeUndefined()
			expect(input.getAttribute('aria-invalid')).toBe('true')
			expect(fixture.document.values.count).toBeUndefined()
			await userEvent.fill(input, '12')
			expect(input.validity.valid).toBe(true)
			fixture.element.requestSubmit()
			expect(fixture.document.pending?.values.count).toBe(12)
		} finally {
			fixture.destroy()
		}
	})

	it('does not dispatch a receipt consumed during the core prepare notification', () => {
		const fixture = createNativeFormFixture({ fields: [] }, '<form></form>')
		const submissions = createRecorder<readonly [FormSubmission, HTMLElement | undefined]>()
		fixture.binding.emitter.on('submit', submissions.handler)
		fixture.document.emitter.once('prepare', (receipt) => fixture.document.abort(receipt))
		try {
			fixture.element.requestSubmit()
			expect(submissions.count).toBe(0)
			expect(fixture.document.pending).toBeUndefined()
			expect(fixture.element.getAttribute('aria-busy')).toBe('false')
		} finally {
			fixture.destroy()
		}
	})

	it('preflights a whole read and reports dynamic shape failures through the domain event', async () => {
		const fixture = createNativeFormFixture(
			{
				fields: [
					{ name: 'name', control: 'text', default: 'A' },
					{ name: 'choice', control: 'select', choices: [{ value: 'a', label: 'A' }] },
				],
			},
			'<form><input name="name"><select name="choice"><option>a</option><option>bad</option></select></form>',
		)
		try {
			readNativeInput(fixture.host, 'name').value = 'B'
			requireValue(fixture.element.querySelector('select')).value = 'bad'
			expect(() => fixture.binding.read()).toThrow(FormBindingError)
			expect(fixture.document.values.name).toBe('A')
			const errors = createRecorder<readonly [unknown]>()
			fixture.binding.emitter.on('error', errors.handler)
			const duplicate = document.createElement('input')
			duplicate.name = 'name'
			fixture.element.append(duplicate)
			await waitForDelay()
			expect(errors.count).toBeGreaterThan(0)
			expect(isFormBindingError(errors.calls[0]?.[0])).toBe(true)
			duplicate.remove()
			await waitForDelay()
			expect(readNativeInput(fixture.host, 'name').value).toBe('A')
		} finally {
			fixture.destroy()
		}
	})

	it('removes only its description token after an application appends help', () => {
		const fixture = createNativeFormFixture(
			{ fields: [{ name: 'name', control: 'text', rule: { required: true } }] },
			'<form><input name="name" aria-describedby="original"></form>',
		)
		const input = readNativeInput(fixture.host, 'name')
		try {
			fixture.document.touch('name')
			const owned = input.getAttribute('aria-describedby')
			input.setAttribute('aria-describedby', `${owned} added`)
			fixture.binding.destroy()
			expect(input.getAttribute('aria-describedby')).toBe('original added')
		} finally {
			fixture.destroy()
		}
	})

	it('refreshes summary targets when a missing control becomes reachable', async () => {
		const fixture = createNativeFormFixture(
			{ fields: [{ name: 'name', control: 'text', rule: { custom: () => 'Supply an answer' } }] },
			'<form><div id="errors"></div></form>',
		)
		fixture.binding.destroy()
		const summary = requireValue(fixture.element.querySelector<HTMLElement>('#errors'))
		const binding = createFormBinding(fixture.element, fixture.document, { summary })
		try {
			fixture.document.touch('name')
			expect(summary.querySelector('a')).toBeNull()
			const input = document.createElement('input')
			input.name = 'name'
			fixture.element.append(input)
			await waitForDelay()
			expect(summary.querySelector('a')).not.toBeNull()
		} finally {
			binding.destroy()
			fixture.destroy()
		}
	})
	it('opens from the document, reads false, zero and absence, and preserves missing fields', () => {
		const fixture = createNativeFormFixture(
			{
				fields: [
					{ name: 'name', control: 'text', default: 'Ada' },
					{ name: 'count', control: 'number', default: 2 },
					{ name: 'yes', control: 'confirm', default: true, rule: { required: true } },
					{ name: 'missing', control: 'text', default: 'kept' },
				],
			},
			'<form><input name="name" value="markup"><input name="count" type="number"><input name="yes" type="checkbox"><input name="unknown" value="ignored"></form>',
		)
		try {
			expect(readNativeInput(fixture.host, 'name').value).toBe('Ada')
			editNativeAnswer(fixture.host, 'name', '  ')
			editNativeAnswer(fixture.host, 'count', '0')
			editNativeAnswer(fixture.host, 'yes', false)
			expect(fixture.document.values).toEqual({ count: 0, yes: false, missing: 'kept' })
			expect(readNativeInput(fixture.host, 'yes').required).toBe(false)
			expect(fixture.document.baseline.name).toBe('Ada')
			fixture.document.fill('name', 'Grace')
			expect(readNativeInput(fixture.host, 'name').value).toBe('Grace')
		} finally {
			fixture.destroy()
		}
	})

	it('admits externally associated controls and observes membership without deleting answers', async () => {
		const fixture = createNativeFormFixture(
			{ fields: [{ name: 'name', control: 'text', default: 'Ada' }] },
			'<form id="native-associated"></form><input name="name" form="native-associated">',
		)
		try {
			const control = readNativeInput(fixture.host, 'name')
			expect(control.value).toBe('Ada')
			editNativeAnswer(fixture.host, 'name', 'Grace')
			expect(fixture.document.values.name).toBe('Grace')
			control.remove()
			await waitForDelay()
			expect(fixture.document.values.name).toBe('Grace')
			const replacement = document.createElement('input')
			replacement.name = 'name'
			fixture.element.append(replacement)
			await waitForDelay()
			expect(replacement.value).toBe('Grace')
			replacement.setAttribute('form', 'other')
			await waitForDelay()
			expect(replacement.hasAttribute('aria-invalid')).toBe(false)
		} finally {
			fixture.destroy()
		}
	})

	it('refuses duplicate or incompatible controls before changing the DOM or answers', () => {
		const model = createForm({ fields: [{ name: 'name', control: 'text', default: 'Ada' }] })
		const element = document.createElement('form')
		element.innerHTML = '<input name="name" value="markup"><input name="name">'
		try {
			expect(() => createFormBinding(element, model)).toThrow(FormBindingError)
			expect(element.noValidate).toBe(false)
			expect(readNativeInput(element, 'name').value).toBe('markup')
			expect(model.emitter.count()).toBe(0)
		} finally {
			model.destroy()
		}
	})

	it('excludes native fieldsets, preserves logical disables, and keeps locked answers submitted', async () => {
		const fixture = createNativeFormFixture(
			{
				fields: [
					{ name: 'native', control: 'text', default: 'A' },
					{ name: 'model', control: 'text', default: 'B', disabled: true },
					{
						name: 'locked',
						control: 'select',
						choices: [
							{ value: 'a', label: 'A' },
							{ value: 'b', label: 'B' },
						],
						default: 'a',
						locked: true,
					},
				],
			},
			'<form><fieldset disabled><input name="native"></fieldset><input name="model"><select name="locked"><option>a</option><option>b</option></select></form>',
		)
		try {
			expect(fixture.document.disabled).toEqual(new Set(['native', 'model']))
			const fieldset = requireValue(fixture.element.querySelector('fieldset'))
			fieldset.disabled = false
			await waitForDelay()
			expect(fixture.document.disabled).toEqual(new Set(['model']))
			fixture.document.disable('native')
			fixture.binding.refresh()
			expect(readNativeInput(fixture.host, 'native').disabled).toBe(true)
			fixture.document.enable('native')
			expect(readNativeInput(fixture.host, 'native').disabled).toBe(false)
			editNativeAnswer(fixture.host, 'locked', 'b')
			expect(fixture.document.values.locked).toBe('a')
			expect(requireValue(fixture.element.querySelector('select')).value).toBe('a')
			const receipt = fixture.document.prepare()
			expect(receipt.success && receipt.value.values).toEqual({ native: 'A', locked: 'a' })
		} finally {
			fixture.destroy()
		}
	})

	it('preserves authored validity and descriptions, touches feedback, links summary and focuses errors', () => {
		const fixture = createNativeFormFixture(
			{
				fields: [
					{ name: 'email', control: 'text', rule: { required: true } },
					{ name: 'missing', control: 'text', rule: { required: true } },
				],
			},
			'<form><input name="email" type="email" aria-describedby="help"><span id="help">Help</span><div id="feedback">Authored</div><div id="summary">Summary title</div></form>',
		)
		fixture.binding.destroy()
		const input = readNativeInput(fixture.host, 'email')
		const feedback = requireValue(fixture.element.querySelector<HTMLElement>('#feedback'))
		const summary = requireValue(fixture.element.querySelector<HTMLElement>('#summary'))
		input.setCustomValidity('Authored error')
		const binding = createFormBinding(fixture.element, fixture.document, {
			feedback: new Map([['email', feedback]]),
			summary,
		})
		try {
			expect(input.getAttribute('aria-invalid')).toBeNull()
			fixture.element.requestSubmit()
			expect(document.activeElement).toBe(input)
			expect(input.getAttribute('aria-invalid')).toBe('true')
			expect(input.getAttribute('aria-describedby')).toContain('help')
			expect(feedback.textContent).toContain('Authored')
			expect(summary.querySelector('a')).not.toBeNull()
			expect(summary.textContent).toContain('missing')
			expect(input.validationMessage).toBe('Authored error')
			input.setCustomValidity('')
			editNativeAnswer(fixture.host, 'email', 'ada@example.test')
			expect(input.validity.valid).toBe(true)
			fixture.document.invalidate('email', 'Server refuses')
			binding.refresh()
			binding.refresh()
			expect(fixture.document.errors.some((error) => error.message === 'Server refuses')).toBe(true)
		} finally {
			binding.destroy()
			fixture.destroy()
		}
		expect(input.getAttribute('aria-describedby')).toBe('help')
		expect(input.hasAttribute('aria-invalid')).toBe(false)
		expect(input.validationMessage).toBe('')
		expect(feedback.textContent).toBe('Authored')
		expect(summary.textContent).toBe('Summary title')
	})

	it('prepares once, preserves later edits on acknowledgement, and resets to that baseline', () => {
		const fixture = createNativeFormFixture(
			{ fields: [{ name: 'name', control: 'text', default: 'Initial' }] },
			'<form><input name="name" value="markup"><button name="action" value="save">Save</button></form>',
		)
		const submissions = createRecorder<readonly [FormSubmission, HTMLElement | undefined]>()
		const errors = createRecorder<readonly [unknown]>()
		fixture.binding.emitter.on('submit', submissions.handler)
		fixture.binding.emitter.on('error', errors.handler)
		try {
			editNativeAnswer(fixture.host, 'name', 'A')
			const button = requireValue(fixture.element.querySelector('button'))
			fixture.element.requestSubmit(button)
			expect(submissions.count).toBe(1)
			expect(submissions.calls[0]?.[1]).toBe(button)
			expect(fixture.element.getAttribute('aria-busy')).toBe('true')
			expect(readNativeInput(fixture.host, 'name').disabled).toBe(false)
			fixture.element.requestSubmit(button)
			expect(submissions.count).toBe(1)
			expect(isFormBindingError(errors.calls[0]?.[0])).toBe(true)
			editNativeAnswer(fixture.host, 'name', 'B')
			const receipt = requireValue(fixture.document.pending)
			expect(fixture.document.accept(receipt)).toBe(true)
			expect(readNativeInput(fixture.host, 'name').value).toBe('B')
			expect(fixture.document.dirty).toBe(true)
			fixture.element.reset()
			expect(readNativeInput(fixture.host, 'name').value).toBe('A')
			expect(fixture.element.getAttribute('aria-busy')).toBe('false')
		} finally {
			fixture.destroy()
		}
	})

	it('ignores already-prevented submission and reset', () => {
		const fixture = createNativeFormFixture(
			{ fields: [{ name: 'name', control: 'text', default: 'A' }] },
			'<form><input name="name"></form>',
		)
		try {
			editNativeAnswer(fixture.host, 'name', 'B')
			const submit = new SubmitEvent('submit', { cancelable: true })
			submit.preventDefault()
			fixture.element.dispatchEvent(submit)
			expect(fixture.document.pending).toBeUndefined()
			const reset = new Event('reset', { cancelable: true })
			reset.preventDefault()
			fixture.element.dispatchEvent(reset)
			expect(fixture.document.values.name).toBe('B')
		} finally {
			fixture.destroy()
		}
	})

	it('drains reentrant rendering and isolates listener failure from domain failures', async () => {
		const fixture = createNativeFormFixture(
			{ fields: [{ name: 'name', control: 'text', default: 'A' }] },
			'<form><input name="name"></form>',
		)
		fixture.binding.destroy()
		const failures = createRecorder<readonly [unknown, string]>()
		const binding = createFormBinding(fixture.element, fixture.document, {
			error: failures.handler,
		})
		const domain = createRecorder<readonly [unknown]>()
		binding.emitter.on('error', domain.handler)
		binding.emitter.once('render', () => {
			fixture.document.fill('name', 'C')
			binding.refresh()
		})
		binding.emitter.on('render', () => {
			throw new Error('listener')
		})
		try {
			fixture.document.fill('name', 'B')
			await waitForDelay()
			expect(readNativeInput(fixture.host, 'name').value).toBe('C')
			expect(failures.count).toBeGreaterThan(0)
			expect(domain.count).toBe(0)
			binding.emitter.once('render', () => binding.destroy())
			fixture.document.fill('name', 'D')
			expect(binding.destroyed).toBe(true)
			fixture.document.fill('name', 'E')
			binding.read()
			binding.refresh()
			await waitForDelay()
			expect(readNativeInput(fixture.host, 'name').value).toBe('D')
			expect(fixture.document.status).toBe('editing')
			expect(fixture.element.noValidate).toBe(false)
		} finally {
			binding.destroy()
			fixture.destroy()
		}
	})
})

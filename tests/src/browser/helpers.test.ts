import {
	FormBindingError,
	matchesFormControls,
	readNativeMessages,
	readFormControls,
} from '@src/browser'
import { describe, expect, it } from 'vitest'
import { requireValue } from '@orkestrel/test'
import {
	createNativeFormFixture,
	editNativeAnswer,
	NATIVE_CONTROL_CASES,
	readNativeInput,
} from '../../setupBrowser.js'

describe('native readers', () => {
	it('matches native failures by rule and field while retaining independent native errors', () => {
		const input = document.createElement('input')
		input.name = 'answer'
		input.required = true
		expect(readNativeMessages(input, [])).not.toEqual([])
		expect(
			readNativeMessages(input, [{ field: 'other', rule: 'required', message: 'Required' }]),
		).not.toEqual([])
		expect(
			readNativeMessages(input, [{ field: 'answer', rule: 'required', message: 'Required' }]),
		).toEqual([])
		input.type = 'number'
		input.min = '5'
		input.max = '10'
		input.step = '2'
		input.value = '2'
		expect(
			readNativeMessages(input, [{ field: 'answer', rule: 'minimum', message: 'Minimum' }]),
		).not.toEqual([])
		expect(
			readNativeMessages(input, [
				{ field: 'answer', rule: 'minimum', message: 'Minimum' },
				{ field: 'answer', rule: 'step', message: 'Step' },
			]),
		).toEqual([])
		input.value = '11'
		expect(
			readNativeMessages(input, [{ field: 'answer', rule: 'maximum', message: 'Maximum' }]),
		).toEqual([])
		input.type = 'text'
		input.pattern = '[A-Z]+'
		input.value = 'lowercase'
		expect(
			readNativeMessages(input, [{ field: 'answer', rule: 'pattern', message: 'Pattern' }]),
		).toEqual([])
		input.removeAttribute('pattern')
		input.type = 'email'
		expect(
			readNativeMessages(input, [{ field: 'answer', rule: 'url', message: 'URL' }]),
		).not.toEqual([])
		expect(
			readNativeMessages(input, [{ field: 'answer', rule: 'email', message: 'Email' }]),
		).toEqual([])
		input.type = 'url'
		expect(readNativeMessages(input, [{ field: 'answer', rule: 'url', message: 'URL' }])).toEqual(
			[],
		)
		input.setCustomValidity('Authored refusal')
		expect(
			readNativeMessages(input, [{ field: 'answer', rule: 'url', message: 'URL' }]),
		).not.toEqual([])
	})

	it('admits only password and text inputs for a password field', () => {
		const input = document.createElement('input')
		expect(matchesFormControls({ name: 'secret', control: 'password' }, [input])).toBe(true)
		input.type = 'password'
		expect(matchesFormControls({ name: 'secret', control: 'password' }, [input])).toBe(true)
		input.type = 'email'
		expect(matchesFormControls({ name: 'secret', control: 'password' }, [input])).toBe(false)
	})

	it.each(NATIVE_CONTROL_CASES)('projects and reads $label', ({ field, markup, value, edited }) => {
		const fixture = createNativeFormFixture({ fields: [field] }, `<form>${markup}</form>`, {
			answer: value,
		})
		try {
			fixture.binding.read()
			expect(fixture.document.values.answer).toEqual(value)
			editNativeAnswer(
				fixture.host,
				'answer',
				typeof edited === 'number'
					? String(edited)
					: typeof edited === 'boolean' || typeof edited === 'string'
						? edited
						: '',
			)
			expect(fixture.document.values.answer).toEqual(edited)
			fixture.document.fill('answer', value)
			fixture.binding.read()
			expect(fixture.document.values.answer).toEqual(value)
		} finally {
			fixture.destroy()
		}
	})

	it('admits radio, checkbox and multiple-select groups including an empty list', () => {
		const fixture = createNativeFormFixture(
			{
				fields: [
					{
						name: 'radio',
						control: 'select',
						choices: [
							{ value: 'a', label: 'A' },
							{ value: 'b', label: 'B' },
						],
					},
					{
						name: 'boxes',
						control: 'checkbox',
						choices: [
							{ value: 'a', label: 'A' },
							{ value: 'b', label: 'B' },
						],
						rule: { required: true },
					},
					{
						name: 'multiple',
						control: 'checkbox',
						choices: [
							{ value: 'a', label: 'A' },
							{ value: 'b', label: 'B' },
						],
					},
				],
			},
			'<form><input type="radio" name="radio" value="a"><input type="radio" name="radio" value="b"><input type="checkbox" name="boxes" value="a"><input type="checkbox" name="boxes" value="b"><select multiple name="multiple"><option>a</option><option>b</option></select></form>',
			{ radio: 'b', boxes: ['a'], multiple: ['b'] },
		)
		try {
			expect(fixture.element.querySelector<HTMLInputElement>('input[value="b"]')?.checked).toBe(
				true,
			)
			fixture.binding.read()
			expect(fixture.document.values).toEqual({ radio: 'b', boxes: ['a'], multiple: ['b'] })
			editNativeAnswer(fixture.host, 'boxes', false)
			expect(fixture.document.values.boxes).toEqual([])
			expect(fixture.document.valid).toBe(true)
			const select = requireValue(fixture.element.querySelector('select'))
			select.selectedIndex = -1
			select.dispatchEvent(new Event('change', { bubbles: true }))
			expect(fixture.document.values.multiple).toEqual([])
		} finally {
			fixture.destroy()
		}
	})

	it('refuses incompatible native values and ambiguous duplicate shapes', () => {
		const input = document.createElement('input')
		input.type = 'checkbox'
		expect(matchesFormControls({ control: 'text', name: 'answer' }, [input])).toBe(false)
		expect(() => readFormControls({ control: 'text', name: 'answer' }, [input])).toThrow(
			FormBindingError,
		)
		input.type = 'text'
		expect(matchesFormControls({ control: 'text', name: 'answer' }, [input, input])).toBe(false)
		expect(readFormControls({ control: 'text', name: 'answer' }, [])).toBeUndefined()
		const select = document.createElement('select')
		select.innerHTML = '<option selected>unknown</option>'
		expect(() =>
			readFormControls({ control: 'select', name: 'answer', choices: [] }, [select]),
		).toThrow(FormBindingError)
	})

	it('reads filenames while keeping bytes native and clears a mismatched selection', () => {
		const fixture = createNativeFormFixture(
			{ fields: [{ name: 'files', control: 'file', multiple: true }] },
			'<form><input type="file" multiple name="files"></form>',
		)
		try {
			const input = readNativeInput(fixture.host, 'files')
			const transfer = new DataTransfer()
			transfer.items.add(new File(['first bytes'], 'first.txt'))
			transfer.items.add(new File(['second bytes'], 'second.txt'))
			input.files = transfer.files
			input.dispatchEvent(new Event('change', { bubbles: true }))
			expect(fixture.document.values.files).toEqual(['first.txt', 'second.txt'])
			expect(input.files?.length).toBe(2)
			fixture.document.fill('files', ['saved.txt'])
			expect(input.files?.length).toBe(0)
			expect(fixture.document.values.files).toEqual(['saved.txt'])
			fixture.binding.refresh()
			expect(input.files?.length).toBe(0)
		} finally {
			fixture.destroy()
		}
	})
})

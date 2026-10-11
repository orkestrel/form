import type { FormBindingInterface } from '@src/browser'
import type { FieldValue, FormField, FormInterface, FormSchema, FormValues } from '@src/core'
import { createFormBinding, isFormControl } from '@src/browser'
import { createForm } from '@src/core'

export interface NativeFormFixture {
	readonly host: HTMLDivElement
	readonly element: HTMLFormElement
	readonly document: FormInterface
	readonly binding: FormBindingInterface
	destroy(): void
}

export interface NativeControlCase {
	readonly label: string
	readonly field: FormField
	readonly markup: string
	readonly value: FieldValue
	readonly edited: FieldValue
}

export const NATIVE_CONTROL_CASES: readonly NativeControlCase[] = Object.freeze([
	{
		label: 'text',
		field: { control: 'text', name: 'answer' },
		markup: '<input name="answer">',
		value: 'Ada',
		edited: 'Grace',
	},
	{
		label: 'search',
		field: { control: 'text', name: 'answer' },
		markup: '<input type="search" name="answer">',
		value: 'Ada',
		edited: 'Grace',
	},
	{
		label: 'email',
		field: { control: 'text', name: 'answer' },
		markup: '<input type="email" name="answer">',
		value: 'ada@example.test',
		edited: 'grace@example.test',
	},
	{
		label: 'url',
		field: { control: 'text', name: 'answer' },
		markup: '<input type="url" name="answer">',
		value: 'https://example.test/a',
		edited: 'https://example.test/b',
	},
	{
		label: 'tel',
		field: { control: 'text', name: 'answer' },
		markup: '<input type="tel" name="answer">',
		value: '123',
		edited: '456',
	},
	{
		label: 'hidden',
		field: { control: 'text', name: 'answer' },
		markup: '<input type="hidden" name="answer">',
		value: 'Ada',
		edited: 'Grace',
	},
	{
		label: 'password',
		field: { control: 'password', name: 'answer' },
		markup: '<input type="password" name="answer">',
		value: 'first',
		edited: 'second',
	},
	{
		label: 'editor',
		field: { control: 'editor', name: 'answer' },
		markup: '<textarea name="answer"></textarea>',
		value: 'first\nline',
		edited: 'second\nline',
	},
	{
		label: 'number',
		field: { control: 'number', name: 'answer' },
		markup: '<input type="number" name="answer">',
		value: 1,
		edited: 0,
	},
	{
		label: 'range',
		field: { control: 'number', name: 'answer' },
		markup: '<input type="range" name="answer">',
		value: 10,
		edited: 20,
	},
	{
		label: 'date',
		field: { control: 'date', name: 'answer' },
		markup: '<input type="date" name="answer">',
		value: '2026-01-01',
		edited: '2026-02-01',
	},
	{
		label: 'time',
		field: { control: 'time', name: 'answer' },
		markup: '<input type="time" name="answer">',
		value: '10:00',
		edited: '12:00',
	},
	{
		label: 'datetime',
		field: { control: 'datetime', name: 'answer' },
		markup: '<input type="datetime-local" name="answer">',
		value: '2026-01-01T10:00',
		edited: '2026-02-01T12:00',
	},
	{
		label: 'color',
		field: { control: 'color', name: 'answer' },
		markup: '<input type="color" name="answer">',
		value: '#123456',
		edited: '#abcdef',
	},
	{
		label: 'confirm',
		field: { control: 'confirm', name: 'answer' },
		markup: '<input type="checkbox" name="answer">',
		value: true,
		edited: false,
	},
	{
		label: 'select',
		field: {
			control: 'select',
			name: 'answer',
			choices: [
				{ value: 'a', label: 'A' },
				{ value: 'b', label: 'B' },
			],
		},
		markup: '<select name="answer"><option>a</option><option>b</option></select>',
		value: 'a',
		edited: 'b',
	},
])

export function createNativeFormFixture(
	schema: FormSchema,
	markup: string,
	values?: FormValues,
): NativeFormFixture {
	const host = document.createElement('div')
	host.innerHTML = markup
	const element = host.querySelector('form')
	if (element === null) {
		host.remove()
		throw new Error('The fixture requires a form')
	}
	const model = createForm(schema, values === undefined ? undefined : { values })
	try {
		document.body.append(host)
		const binding = createFormBinding(element, model)
		return {
			host,
			element,
			document: model,
			binding,
			destroy() {
				binding.destroy()
				model.destroy()
				host.remove()
			},
		}
	} catch (error) {
		model.destroy()
		host.remove()
		throw error
	}
}

export function readNativeInput(host: ParentNode, name: string): HTMLInputElement {
	const control = Array.from(host.querySelectorAll('input')).find((input) => input.name === name)
	if (control === undefined) throw new Error(`Missing input: ${name}`)
	return control
}

export function editNativeAnswer(host: ParentNode, name: string, value: string | boolean): void {
	const control = Array.from(host.querySelectorAll('input,textarea,select')).find(
		(element) => isFormControl(element) && element.name === name,
	)
	if (!isFormControl(control)) throw new Error(`Missing control: ${name}`)
	if (typeof value === 'boolean' && control instanceof HTMLInputElement) control.checked = value
	else control.value = String(value)
	control.dispatchEvent(new Event('input', { bubbles: true }))
}

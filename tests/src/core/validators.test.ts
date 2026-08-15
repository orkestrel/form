import type { FormSchema } from '@src/core'
import {
	STRING_LIMIT,
	isFieldChoice,
	isFieldControl,
	isFieldError,
	isFieldRule,
	isFieldValue,
	isFormField,
	isFormGroup,
	isFormSchema,
	isFormStatus,
	isFormValues,
	matchesField,
} from '@src/core'
import { parseForm } from '@src/core'
import { describe, expect, it } from 'vitest'

describe('structural guards', () => {
	it('narrows every public structural value', () => {
		expect(isFieldControl('checkbox')).toBe(true)
		expect(isFieldControl('radio')).toBe(false)
		expect(isFormStatus('settled')).toBe(true)
		expect(isFormStatus('pending')).toBe(false)
		expect(isFieldValue('answer')).toBe(true)
		expect(isFieldValue(4)).toBe(true)
		expect(isFieldValue(false)).toBe(true)
		expect(isFieldValue(['one', 'two'])).toBe(true)
		expect(isFieldValue(Number.NaN)).toBe(false)
		expect(isFieldValue([1])).toBe(false)
		expect(isFieldChoice({ value: 'one', label: 'One', disabled: false })).toBe(true)
		expect(isFieldRule({ required: true, minimum: 1, custom: () => true })).toBe(true)
		expect(isFormGroup({ name: 'account', label: 'Account' })).toBe(true)
		expect(isFormValues({ name: 'Ada', active: true, choices: ['one'] })).toBe(true)
		expect(isFieldError({ field: 'name', message: 'Required', rule: 'required' })).toBe(true)
	})

	it('checks every field control own members', () => {
		const meta = { renderer: { tone: 'quiet' } }
		const fields: readonly unknown[] = [
			{ control: 'text', name: 'text', default: '', placeholder: 'Answer', meta },
			{ control: 'editor', name: 'editor', default: 'Copy', placeholder: 'Answer', meta },
			{ control: 'password', name: 'password', mask: '*', meta },
			{ control: 'number', name: 'number', default: 2, placeholder: '0', meta },
			{ control: 'date', name: 'date', default: '2026-08-15', meta },
			{ control: 'time', name: 'time', default: '09:30', meta },
			{ control: 'datetime', name: 'datetime', default: '2026-08-15T09:30', meta },
			{ control: 'color', name: 'color', default: '#336699', meta },
			{ control: 'confirm', name: 'confirm', default: false, meta },
			{
				control: 'select',
				name: 'select',
				choices: [{ value: 'one', label: 'One' }],
				default: 'one',
				open: true,
				meta,
			},
			{
				control: 'checkbox',
				name: 'checkbox',
				choices: [{ value: 'one', label: 'One' }],
				default: ['one'],
				meta,
			},
			{ control: 'file', name: 'file', accept: ['image/png'], multiple: true, meta },
		]

		expect(fields.every((field) => isFormField(field))).toBe(true)
		expect(isFormField({ control: 'select', name: 'select' })).toBe(false)
		expect(isFormField({ control: 'file', name: 'file', default: [] })).toBe(false)
		expect(
			isFormField({ control: 'number', name: 'number', default: Number.POSITIVE_INFINITY }),
		).toBe(false)
	})

	it('rejects unknown keys at every fixed record level', () => {
		expect(isFieldChoice({ value: 'one', label: 'One', extra: true })).toBe(false)
		expect(isFieldChoice({ value: 'one', label: 'One', meta: {} })).toBe(false)
		expect(isFieldRule({ required: true, extra: true })).toBe(false)
		expect(isFieldRule({ required: undefined })).toBe(false)
		expect(isFormField({ control: 'text', name: 'name', extra: true })).toBe(false)
		expect(isFormField({ control: 'text', name: 'name', label: undefined })).toBe(false)
		expect(isFormField({ control: 'text', name: 'name', meta: [] })).toBe(false)
		expect(isFormField({ control: 'text', name: 'name', meta: { invalid: Number.NaN } })).toBe(
			false,
		)
		expect(isFormField({ control: 'password', name: 'secret', default: 'written' })).toBe(false)
		expect(isFormGroup({ name: 'account', label: 'Account', extra: true })).toBe(false)
		expect(isFormGroup({ name: 'account', label: 'Account', meta: {} })).toBe(false)
		expect(isFormSchema({ fields: [], extra: true })).toBe(false)
		expect(isFieldError({ field: 'name', message: 'Required', extra: true })).toBe(false)
	})

	it('refuses explicitly undefined optional field members', () => {
		expect(isFormField({ control: 'text', name: 'name', meta: undefined })).toBe(false)
		expect(isFormField({ control: 'text', name: 'name', help: undefined })).toBe(false)
	})

	it('keeps value guards budget-free while control matching enforces the string ceiling', () => {
		const value = 'x'.repeat(STRING_LIMIT + 1)

		expect(isFieldValue(value)).toBe(true)
		expect(isFormValues({ answer: value })).toBe(true)
		expect(matchesField({ control: 'text', name: 'answer' }, value)).toBe(false)
	})

	it('is total for cycles, throwing property reads, and null-prototype records', () => {
		const cyclic: Record<string, unknown> = { fields: [] }
		cyclic.fields = [cyclic]
		const hostile = new Proxy(
			{ control: 'text', name: 'name' },
			{
				get: () => {
					throw new Error('hostile get')
				},
			},
		)
		const schema = Object.assign(Object.create(null), { fields: [] })

		expect(() => isFormSchema(cyclic)).not.toThrow()
		expect(isFormSchema(cyclic)).toBe(false)
		expect(() => isFormField(hostile)).not.toThrow()
		expect(isFormField(hostile)).toBe(false)
		expect(isFormSchema(schema)).toBe(true)
	})

	it('contains a throwing field-choice property read', () => {
		const hostile = new Proxy(
			{ value: 'one', label: 'One' },
			{
				get: () => {
					throw new Error('hostile choice')
				},
			},
		)

		expect(() => isFieldChoice(hostile)).not.toThrow()
		expect(isFieldChoice(hostile)).toBe(false)
	})
})

describe('guard and parser soundness', () => {
	it('parses generated valid schemas into values that re-guard', () => {
		const schemas: readonly FormSchema[] = [
			{ fields: [] },
			{
				name: 'profile',
				groups: [{ name: 'identity', label: 'Identity' }],
				fields: [
					{ control: 'text', name: 'name', group: 'identity', default: 'Ada' },
					{ control: 'number', name: 'age', default: 36, rule: { minimum: 0 } },
				],
			},
			{
				fields: [
					{
						control: 'select',
						name: 'choice',
						choices: [{ value: 'one', label: 'One' }],
						default: 'one',
					},
					{
						control: 'checkbox',
						name: 'checks',
						choices: [{ value: 'one', label: 'One' }],
						default: ['one'],
					},
				],
			},
		]

		for (const schema of schemas) {
			const parsed = parseForm(schema)
			expect(parsed).toBeDefined()
			expect(isFormSchema(parsed)).toBe(true)
		}
	})

	it('never refuses guard-valid input without audit findings', () => {
		const inputs: readonly unknown[] = [
			{ fields: [{ control: 'confirm', name: 'ready', default: true }] },
			{
				fields: [
					{ control: 'date', name: 'date', rule: { minimum: '2026-01-01' } },
					{ control: 'file', name: 'files', accept: ['.txt'], multiple: true },
				],
			},
		]

		for (const input of inputs) {
			expect(isFormSchema(input)).toBe(true)
			expect(parseForm(input)).toBeDefined()
		}
	})
})

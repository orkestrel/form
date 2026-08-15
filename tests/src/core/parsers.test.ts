import type { FormField, FormSchema } from '../../../src/core/types.js'
import { parseForm, parseValue, parseValues } from '../../../src/core/parsers.js'
import { describe, expect, it } from 'vitest'

describe('parseValue', () => {
	it('accepts typed values and only the two terminal lexical coercions', () => {
		const text: FormField = { control: 'text', name: 'text' }
		const number: FormField = { control: 'number', name: 'number' }
		const confirm: FormField = { control: 'confirm', name: 'confirm' }
		const checkbox: FormField = {
			control: 'checkbox',
			name: 'checkbox',
			choices: [{ value: 'one', label: 'One' }],
		}

		expect(parseValue(text, 'answer')).toBe('answer')
		expect(parseValue(number, 4.5)).toBe(4.5)
		expect(parseValue(confirm, false)).toBe(false)
		expect(parseValue(checkbox, ['one'])).toStrictEqual(['one'])
		expect(parseValue(number, ' 4.5 ')).toBe(4.5)
		expect(parseValue(confirm, 'true')).toBe(true)
		expect(parseValue(confirm, 'false')).toBe(false)
	})

	it('refuses values outside the exact coercion contract', () => {
		const number: FormField = { control: 'number', name: 'number' }
		const confirm: FormField = { control: 'confirm', name: 'confirm' }
		const select: FormField = {
			control: 'select',
			name: 'select',
			choices: [{ value: 'one', label: 'One' }],
		}
		const open: FormField = { ...select, open: true }
		const checkbox: FormField = {
			control: 'checkbox',
			name: 'checkbox',
			choices: [{ value: 'one', label: 'One' }],
		}

		expect(parseValue(number, Number.NaN)).toBeUndefined()
		expect(parseValue(number, Number.POSITIVE_INFINITY)).toBeUndefined()
		expect(parseValue(number, '')).toBeUndefined()
		expect(parseValue(number, 'Infinity')).toBeUndefined()
		expect(parseValue(confirm, '1')).toBeUndefined()
		expect(parseValue(select, 'two')).toBeUndefined()
		expect(parseValue(open, 'two')).toBe('two')
		expect(parseValue(checkbox, ['one', 'one'])).toBeUndefined()
		expect(parseValue({ control: 'text', name: 'text' }, 2)).toBeUndefined()
	})
})

describe('parseValues', () => {
	it('parses an empty record and every known field atomically', () => {
		const schema: FormSchema = {
			fields: [
				{ control: 'number', name: 'age' },
				{ control: 'confirm', name: 'ready' },
			],
		}

		expect(parseValues(schema, {})).toStrictEqual({})
		expect(parseValues(schema, { age: '36', ready: 'true' })).toStrictEqual({
			age: 36,
			ready: true,
		})
		expect(parseValues(schema, { age: '36', unknown: true })).toBeUndefined()
		expect(parseValues(schema, { age: 'not a number', ready: true })).toBeUndefined()
		expect(parseValues(schema, [])).toBeUndefined()
	})
})

describe('parseForm', () => {
	it('drops custom without changing the caller schema', () => {
		const custom = (): true => true
		const schema: FormSchema = {
			fields: [{ control: 'text', name: 'name', rule: { required: true, custom } }],
		}
		const parsed = parseForm(schema)

		expect(parsed?.fields[0]?.rule).toStrictEqual({ required: true })
		expect(schema.fields[0]?.rule?.custom).toBe(custom)
	})

	it('owns the whole parsed schema and refuses structural or semantic faults', () => {
		const input = {
			groups: [{ name: 'profile', label: 'Profile' }],
			fields: [
				{
					control: 'checkbox',
					name: 'topics',
					group: 'profile',
					choices: [{ value: 'news', label: 'News' }],
					default: ['news'],
				},
			],
		}
		const parsed = parseForm(input)

		const group = input.groups[0]
		if (group !== undefined) group.label = 'Changed'
		const field = input.fields[0]
		if (field !== undefined) {
			const choice = field.choices[0]
			if (choice !== undefined) choice.label = 'Changed'
			field.default.push('other')
		}

		expect(parsed).toStrictEqual({
			groups: [{ name: 'profile', label: 'Profile' }],
			fields: [
				{
					control: 'checkbox',
					name: 'topics',
					group: 'profile',
					choices: [{ value: 'news', label: 'News' }],
					default: ['news'],
				},
			],
		})
		expect(parseForm({ fields: [], extra: true })).toBeUndefined()
		expect(
			parseForm({ fields: [{ control: 'date', name: 'date', default: 'not-a-date' }] }),
		).toBeUndefined()
	})

	it('never throws for cyclic or hostile input', () => {
		const cyclic: Record<string, unknown> = { fields: [] }
		cyclic.fields = [cyclic]
		const hostile = new Proxy(
			{ fields: [] },
			{
				ownKeys: () => {
					throw new Error('hostile keys')
				},
			},
		)

		expect(() => parseForm(cyclic)).not.toThrow()
		expect(parseForm(cyclic)).toBeUndefined()
		expect(() => parseForm(hostile)).not.toThrow()
		expect(parseForm(hostile)).toBeUndefined()
	})
})

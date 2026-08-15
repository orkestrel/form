import type { FieldRule, FormField, FormInterface, FormSchema, FormValues } from '@src/core'
import {
	Form,
	auditSchema,
	isFormError,
	parseForm,
	parseValue,
	parseValues,
	serializeForm,
} from '@src/core'
import { describe, expect, it } from 'vitest'

async function receiveAnswer(form: FormInterface): Promise<FormValues> {
	const values = await form.answer
	return values
}

async function receiveAbandonment(form: FormInterface): Promise<unknown> {
	try {
		await form.answer
		return undefined
	} catch (error: unknown) {
		return error
	}
}

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

	it('owns and freezes list values', () => {
		const checkbox: FormField = {
			control: 'checkbox',
			name: 'topics',
			choices: [
				{ value: 'news', label: 'News' },
				{ value: 'events', label: 'Events' },
			],
		}
		const topics = ['news']
		const value = parseValue(checkbox, topics)

		topics.push('events')

		expect(value).toStrictEqual(['news'])
		expect(Object.isFrozen(value)).toBe(true)
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

	it('owns every parsed list value', () => {
		const schema: FormSchema = {
			fields: [
				{
					control: 'checkbox',
					name: 'topics',
					choices: [
						{ value: 'news', label: 'News' },
						{ value: 'events', label: 'Events' },
					],
				},
			],
		}
		const topics = ['news']
		const values = parseValues(schema, { topics })

		topics.push('events')

		expect(values).toStrictEqual({ topics: ['news'] })
		expect(Object.isFrozen(values?.topics)).toBe(true)
	})
})

describe('parseForm', () => {
	it('drops custom without changing the caller schema', () => {
		const custom = (): true => true
		const schema: FormSchema = {
			fields: [{ control: 'text', name: 'name', rule: { required: true, custom } }],
		}
		const parsed = parseForm(schema)

		expect(parsed?.fields[0]?.rule).toEqual({ required: true })
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

		expect(parsed).toEqual({
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
		expect(Object.getPrototypeOf(parsed)).toBeNull()
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

describe('wire round trip', () => {
	it('round-trips every control and primitive rule without custom validators', () => {
		const textRule: FieldRule = { required: true, pattern: '^[A-Za-z ]+$' }
		const text: FormField = {
			control: 'text',
			name: 'name',
			label: 'Name',
			group: 'profile',
			rule: textRule,
		}
		const expected: FormSchema = {
			name: 'complete',
			label: 'Complete form',
			help: 'Every control travels over the wire.',
			groups: [
				{ name: 'account', label: 'Account', help: 'Account details' },
				{ name: 'profile', label: 'Profile', help: 'Profile details' },
			],
			fields: [
				text,
				{
					control: 'editor',
					name: 'biography',
					label: 'Biography',
					group: 'account',
					locked: true,
					rule: { email: true },
				},
				{
					control: 'password',
					name: 'password',
					label: 'Password',
					group: 'profile',
					mask: '*',
					rule: { minimum: 8, alphanumeric: true },
				},
				{
					control: 'number',
					name: 'count',
					label: 'Count',
					group: 'account',
					placeholder: 'Even number',
					rule: { minimum: 2, maximum: 10, step: 2, integer: true },
				},
				{ control: 'date', name: 'date', rule: { minimum: '2026-01-01' } },
				{ control: 'time', name: 'time', rule: { maximum: '17:00' } },
				{ control: 'datetime', name: 'meeting', default: '2026-08-15T09:30' },
				{ control: 'color', name: 'color', default: '#336699', hidden: true },
				{ control: 'confirm', name: 'confirm', default: false, disabled: true },
				{
					control: 'select',
					name: 'website',
					choices: [
						{
							value: 'https://example.com',
							label: 'Example',
							help: 'Enabled choice',
						},
						{
							value: 'https://disabled.example',
							label: 'Disabled',
							help: 'Unavailable choice',
							disabled: true,
						},
					],
					rule: { url: true },
				},
				{
					control: 'checkbox',
					name: 'topics',
					choices: [
						{ value: 'news', label: 'News', help: 'Daily news' },
						{ value: 'events', label: 'Events', help: 'Local events' },
						{ value: 'retired', label: 'Retired', disabled: true },
					],
					rule: { maximum: 2 },
				},
				{
					control: 'file',
					name: 'files',
					accept: ['image/png', '.jpg'],
					multiple: true,
					rule: { minimum: 1 },
				},
			],
		}
		const schema: FormSchema = {
			...expected,
			fields: [{ ...text, rule: { ...textRule, custom: () => true } }, ...expected.fields.slice(1)],
		}
		const serialized = serializeForm(schema)
		const textJSON = JSON.stringify(serialized)
		const wire: unknown = JSON.parse(textJSON)
		const parsed = parseForm(wire)

		expect(parsed).toEqual(expected)
		expect(auditSchema(parsed ?? { fields: [] })).toStrictEqual([])
		expect(parsed?.fields.map((field) => field.name)).toStrictEqual(
			expected.fields.map((field) => field.name),
		)
		expect(parsed?.fields.slice(0, 4).map((field) => field.group)).toStrictEqual([
			'profile',
			'account',
			'profile',
			'account',
		])
		expect(textJSON).not.toContain('"custom"')

		const date = parsed?.fields.find((field) => field.name === 'date')
		expect(date?.label).toBeUndefined()
		expect(Object.keys(date ?? {})).not.toContain('label')
		expect(Object.keys(date ?? {})).not.toContain('default')
		expect(Object.keys(parsed ?? {})).toStrictEqual(['name', 'label', 'help', 'groups', 'fields'])

		const values: FormValues = {
			name: 'Ada Lovelace',
			biography: 'ada@example.com',
			password: 'Secret42',
			count: 6,
			date: '2026-08-15',
			time: '09:30',
			meeting: '2026-08-15T09:30',
			color: '#336699',
			confirm: false,
			website: 'https://example.com',
			topics: ['news', 'events'],
			files: ['portrait.png', 'notes.jpg'],
		}
		const parsedValues = parseValues(expected, values)
		const valuesWire: unknown = JSON.parse(JSON.stringify(values))

		expect(parsedValues).toStrictEqual(values)
		expect(parseValues(expected, { ...values, unknown: 'refused' })).toBeUndefined()
		expect(parseValues(expected, valuesWire)).toStrictEqual(values)
	})
})

describe('answer parking', () => {
	it('resumes a parked awaiter with the submitted values snapshot', async () => {
		const form = new Form({
			fields: [
				{ control: 'text', name: 'name', rule: { required: true } },
				{
					control: 'checkbox',
					name: 'topics',
					choices: [{ value: 'news', label: 'News' }],
				},
			],
		})
		const parked = receiveAnswer(form)
		const topics = ['news']

		await Promise.resolve()
		form.fill({ name: 'Ada', topics })
		const result = form.submit()
		topics.push('changed')

		expect(result).toStrictEqual({ success: true, value: { name: 'Ada', topics: ['news'] } })
		expect(await parked).toStrictEqual({ name: 'Ada', topics: ['news'] })
	})

	it('rejects a parked awaiter with ABANDONED when the form is destroyed', async () => {
		const form = new Form({ fields: [{ control: 'text', name: 'name' }] })
		const parked = receiveAbandonment(form)

		await Promise.resolve()
		form.destroy()
		const error = await parked
		const code = isFormError(error) ? error.code : undefined

		expect({ error: isFormError(error), code }).toStrictEqual({ error: true, code: 'ABANDONED' })
	})
})

import type {
	FieldControl,
	FieldRuleName,
	FieldValue,
	FormField,
	FormSchema,
	FormValues,
} from '@src/core'
import { STRING_LIMIT } from '@src/core'

export interface AnswerCase {
	readonly answer: boolean
	readonly value: FieldValue | undefined
}

export interface ChangedCase {
	readonly current: FormValues
	readonly names: readonly string[]
	readonly opened: FormValues
}

export interface SchemaCase {
	readonly label: string
	readonly schema: FormSchema
}

export const ANSWER_CASES: readonly AnswerCase[] = [
	{ value: '', answer: false },
	{ value: ' ', answer: false },
	{ value: '\t', answer: false },
	{ value: 'a', answer: true },
	{ value: [], answer: true },
	{ value: ['x'], answer: true },
	{ value: false, answer: true },
	{ value: 0, answer: true },
	{ value: undefined, answer: false },
]

export const CHANGED_CASES: readonly ChangedCase[] = [
	{ current: { answer: 'new' }, opened: { answer: 'old' }, names: ['answer'] },
	{ current: { answer: 'old' }, opened: { answer: 'old' }, names: [] },
	{ current: {}, opened: { answer: 'old' }, names: ['answer'] },
	{ current: { answer: 'new' }, opened: {}, names: ['answer'] },
	{ current: { answer: ['one', 'two'] }, opened: { answer: ['one', 'three'] }, names: ['answer'] },
]

export const STRING_FIELDS: readonly FormField[] = [
	{ control: 'text', name: 'text' },
	{ control: 'editor', name: 'editor' },
	{ control: 'password', name: 'password' },
	{ control: 'date', name: 'date' },
	{ control: 'time', name: 'time' },
	{ control: 'datetime', name: 'datetime' },
	{ control: 'color', name: 'color' },
	{ control: 'select', name: 'select', choices: [], open: true },
]

export const MATRIX_RULES: readonly FieldRuleName[] = [
	'required',
	'minimum',
	'maximum',
	'step',
	'pattern',
	'email',
	'url',
	'integer',
	'alphanumeric',
]

export const RULE_APPLICABILITY: Readonly<
	Record<FieldControl, Readonly<Record<FieldRuleName, boolean>>>
> = {
	text: {
		required: true,
		minimum: true,
		maximum: true,
		step: false,
		pattern: true,
		email: true,
		url: true,
		integer: true,
		alphanumeric: true,
	},
	editor: {
		required: true,
		minimum: true,
		maximum: true,
		step: false,
		pattern: true,
		email: true,
		url: true,
		integer: true,
		alphanumeric: true,
	},
	password: {
		required: true,
		minimum: true,
		maximum: true,
		step: false,
		pattern: true,
		email: true,
		url: true,
		integer: true,
		alphanumeric: true,
	},
	number: {
		required: true,
		minimum: true,
		maximum: true,
		step: true,
		pattern: false,
		email: false,
		url: false,
		integer: true,
		alphanumeric: false,
	},
	date: {
		required: true,
		minimum: true,
		maximum: true,
		step: false,
		pattern: true,
		email: true,
		url: true,
		integer: true,
		alphanumeric: true,
	},
	time: {
		required: true,
		minimum: true,
		maximum: true,
		step: false,
		pattern: true,
		email: true,
		url: true,
		integer: true,
		alphanumeric: true,
	},
	datetime: {
		required: true,
		minimum: true,
		maximum: true,
		step: false,
		pattern: true,
		email: true,
		url: true,
		integer: true,
		alphanumeric: true,
	},
	color: {
		required: true,
		minimum: false,
		maximum: false,
		step: false,
		pattern: true,
		email: true,
		url: true,
		integer: true,
		alphanumeric: true,
	},
	confirm: {
		required: true,
		minimum: false,
		maximum: false,
		step: false,
		pattern: false,
		email: false,
		url: false,
		integer: false,
		alphanumeric: false,
	},
	select: {
		required: true,
		minimum: false,
		maximum: false,
		step: false,
		pattern: true,
		email: true,
		url: true,
		integer: true,
		alphanumeric: true,
	},
	checkbox: {
		required: true,
		minimum: true,
		maximum: true,
		step: false,
		pattern: false,
		email: false,
		url: false,
		integer: false,
		alphanumeric: false,
	},
	file: {
		required: true,
		minimum: true,
		maximum: true,
		step: false,
		pattern: false,
		email: false,
		url: false,
		integer: false,
		alphanumeric: false,
	},
}

export const MATRIX_FIELDS: Readonly<Record<FieldControl, FormField>> = {
	text: { control: 'text', name: 'text' },
	editor: { control: 'editor', name: 'editor' },
	password: { control: 'password', name: 'password' },
	number: { control: 'number', name: 'number' },
	date: { control: 'date', name: 'date' },
	time: { control: 'time', name: 'time' },
	datetime: { control: 'datetime', name: 'datetime' },
	color: { control: 'color', name: 'color' },
	confirm: { control: 'confirm', name: 'confirm' },
	select: {
		control: 'select',
		name: 'select',
		choices: [{ value: 'choice', label: 'Choice' }],
	},
	checkbox: {
		control: 'checkbox',
		name: 'checkbox',
		choices: [
			{ value: 'one', label: 'One' },
			{ value: 'two', label: 'Two' },
		],
	},
	file: { control: 'file', name: 'file', multiple: true },
}

export const MATRIX_VALUES: Readonly<Record<FieldControl, FieldValue>> = {
	text: 'text',
	editor: 'editor',
	password: 'password',
	number: 2,
	date: '2026-08-15',
	time: '09:30',
	datetime: '2026-08-15T09:30',
	color: '#336699',
	confirm: true,
	select: 'choice',
	checkbox: ['one'],
	file: ['one.txt'],
}

export function createFieldBudgetSchema(count: number): FormSchema {
	return {
		fields: Array.from({ length: count }, (_, index): FormField => ({
			control: 'text',
			name: `field${index}`,
		})),
	}
}

export function createGroupBudgetSchema(count: number): FormSchema {
	return {
		groups: Array.from({ length: count }, (_, index) => ({
			name: `group${index}`,
			label: `Group ${index}`,
		})),
		fields: [],
	}
}

export function createChoiceBudgetSchema(count: number): FormSchema {
	return {
		fields: [
			{
				control: 'select',
				name: 'choice',
				choices: Array.from({ length: count }, (_, index) => ({
					value: `choice${index}`,
					label: `Choice ${index}`,
				})),
			},
		],
	}
}

export function createNameBudgetCases(length: number): readonly SchemaCase[] {
	const name = 'n'.repeat(length)

	return [
		{ label: 'schema name', schema: { name, fields: [] } },
		{ label: 'field name', schema: { fields: [{ control: 'text', name }] } },
		{
			label: 'group name',
			schema: { groups: [{ name, label: 'Group' }], fields: [] },
		},
		{
			label: 'group reference',
			schema: {
				groups: [{ name, label: 'Group' }],
				fields: [{ control: 'text', name: 'field', group: name }],
			},
		},
	]
}

export function createStringBudgetCases(length: number): readonly SchemaCase[] {
	const value = 'x'.repeat(length)
	const meta: Record<string, string> = { value }
	const keyed: Record<string, string> = { [value]: 'value' }

	return [
		{ label: 'schema label', schema: { label: value, fields: [] } },
		{ label: 'schema help', schema: { help: value, fields: [] } },
		{
			label: 'group label',
			schema: { groups: [{ name: 'group', label: value }], fields: [] },
		},
		{
			label: 'group help',
			schema: { groups: [{ name: 'group', label: 'Group', help: value }], fields: [] },
		},
		{
			label: 'field label',
			schema: { fields: [{ control: 'text', name: 'field', label: value }] },
		},
		{ label: 'field help', schema: { fields: [{ control: 'text', name: 'field', help: value }] } },
		{
			label: 'placeholder',
			schema: { fields: [{ control: 'text', name: 'field', placeholder: value }] },
		},
		{
			label: 'string default',
			schema: { fields: [{ control: 'text', name: 'field', default: value }] },
		},
		{
			label: 'choice value',
			schema: {
				fields: [{ control: 'select', name: 'field', choices: [{ value, label: 'Choice' }] }],
			},
		},
		{
			label: 'choice label',
			schema: {
				fields: [
					{ control: 'select', name: 'field', choices: [{ value: 'choice', label: value }] },
				],
			},
		},
		{
			label: 'choice help',
			schema: {
				fields: [
					{
						control: 'select',
						name: 'field',
						choices: [{ value: 'choice', label: 'Choice', help: value }],
					},
				],
			},
		},
		{ label: 'mask', schema: { fields: [{ control: 'password', name: 'field', mask: value }] } },
		{
			label: 'accept entry',
			schema: { fields: [{ control: 'file', name: 'field', accept: [value] }] },
		},
		{
			label: 'pattern source',
			schema: { fields: [{ control: 'text', name: 'field', rule: { pattern: value } }] },
		},
		{ label: 'meta key', schema: { fields: [{ control: 'text', name: 'field', meta: keyed }] } },
		{ label: 'meta value', schema: { fields: [{ control: 'text', name: 'field', meta }] } },
	]
}

export function createTextBudgetSchema(length: number): FormSchema {
	const keys = 'abcdefghijklmnop'
	const meta: Record<string, string> = {}
	let remaining = length - 'text'.length - 'f'.length - keys.length

	for (const key of keys) {
		const size = Math.min(STRING_LIMIT, remaining)
		meta[key] = 'x'.repeat(size)
		remaining -= size
	}

	return { fields: [{ control: 'text', name: 'f', meta }] }
}

export function passValidation(): true {
	return true
}

export function createNodeBudgetSchema(count: number): FormSchema {
	const leaves = Math.max(0, count - 9)
	return {
		fields: [
			{
				control: 'text',
				name: 'f',
				meta: { values: Array.from({ length: leaves }, () => 0) },
				rule: { custom: passValidation },
			},
		],
	}
}

export function createCheckboxLimit(
	count: number,
	length?: number,
): readonly [FormField, FieldValue] {
	const choices = Array.from({ length: count }, (_, index) => {
		const suffix = String(index)
		const value = length === undefined ? suffix : `${'x'.repeat(length - suffix.length)}${suffix}`
		return { value, label: suffix }
	})

	return [{ control: 'checkbox', name: 'field', choices }, choices.map((choice) => choice.value)]
}

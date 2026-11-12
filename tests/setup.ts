import type { JSONValue } from '@orkestrel/contract'
import {
	attempt,
	isArray,
	isRecord,
	isString,
	NODE_LIMIT,
	STRING_LIMIT,
	TEXT_LIMIT,
} from '@orkestrel/contract'
import type {
	FieldControl,
	FieldError,
	FieldRule,
	FieldRuleName,
	FieldValidator,
	FieldValue,
	Form,
	FormField,
	FormInterface,
	FormSchema,
	FormValues,
} from '@src/core'
import { EMAIL_PATTERN, isFormError, serializeForm } from '@src/core'

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
	{ current: { answer: [] }, opened: {}, names: [] },
	{ current: {}, opened: { answer: [] }, names: [] },
	{ current: { answer: ['one'] }, opened: {}, names: ['answer'] },
	{ current: {}, opened: { answer: ['one'] }, names: ['answer'] },
	{ current: { answer: [] }, opened: { answer: '' }, names: ['answer'] },
	{ current: { answer: '' }, opened: {}, names: ['answer'] },
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
	list: {
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
	list: { control: 'list', name: 'list' },
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
	list: ['one'],
	file: ['one.txt'],
}

export function createMatrixField(control: FieldControl, rule: FieldRule): FormField {
	const field = MATRIX_FIELDS[control]
	return { ...field, rule }
}

export function createMinimumCase(
	control: FieldControl,
): readonly [FieldRule, FieldValue, FieldValue] {
	switch (control) {
		case 'text':
		case 'editor':
		case 'password':
			return [{ minimum: 2 }, 'ab', 'a']
		case 'number':
			return [{ minimum: 2 }, 2, 1]
		case 'date':
			return [{ minimum: '2026-08-15' }, '2026-08-15', '2026-08-14']
		case 'time':
			return [{ minimum: '09:30' }, '09:30', '09:29']
		case 'datetime':
			return [{ minimum: '2026-08-15T09:30' }, '2026-08-15T09:30', '2026-08-15T09:29']
		case 'checkbox':
		case 'list':
			return [{ minimum: 2 }, ['one', 'two'], ['one']]
		case 'file':
			return [{ minimum: 2 }, ['one.txt', 'two.txt'], ['one.txt']]
		case 'color':
		case 'confirm':
		case 'select':
			return [{ minimum: 99 }, MATRIX_VALUES[control], MATRIX_VALUES[control]]
	}
}

export function createMaximumCase(
	control: FieldControl,
): readonly [FieldRule, FieldValue, FieldValue] {
	switch (control) {
		case 'text':
		case 'editor':
		case 'password':
			return [{ maximum: 2 }, 'ab', 'abc']
		case 'number':
			return [{ maximum: 2 }, 2, 3]
		case 'date':
			return [{ maximum: '2026-08-15' }, '2026-08-15', '2026-08-16']
		case 'time':
			return [{ maximum: '09:30' }, '09:30', '09:31']
		case 'datetime':
			return [{ maximum: '2026-08-15T09:30' }, '2026-08-15T09:30', '2026-08-15T09:31']
		case 'checkbox':
		case 'list':
			return [{ maximum: 1 }, ['one'], ['one', 'two']]
		case 'file':
			return [{ maximum: 1 }, ['one.txt'], ['one.txt', 'two.txt']]
		case 'color':
		case 'confirm':
		case 'select':
			return [{ maximum: 0 }, MATRIX_VALUES[control], MATRIX_VALUES[control]]
	}
}

export function createMatrixCase(
	control: FieldControl,
	rule: FieldRuleName,
): readonly [FieldRule, FieldValue | undefined, FieldValue | undefined] {
	if (control === 'list' && ['pattern', 'email', 'url', 'integer', 'alphanumeric'].includes(rule)) {
		const [constraint, valid, invalid] = createMatrixCase('text', rule)
		return [
			constraint,
			typeof valid === 'string' ? [valid] : undefined,
			typeof invalid === 'string' ? [invalid] : undefined,
		]
	}
	switch (rule) {
		case 'required':
			return [{ required: true }, MATRIX_VALUES[control], undefined]
		case 'minimum':
			return createMinimumCase(control)
		case 'maximum':
			return createMaximumCase(control)
		case 'step':
			return [{ step: 2 }, 4, 3]
		case 'pattern':
			return [{ pattern: '^match$' }, 'match', 'miss']
		case 'email':
			return [{ email: true }, 'ada@example.com', 'invalid']
		case 'url':
			return [{ url: true }, 'https://example.com', 'invalid']
		case 'integer':
			return control === 'number' ? [{ integer: true }, 42, 4.2] : [{ integer: true }, '42', '4.2']
		case 'alphanumeric':
			return [{ alphanumeric: true }, 'Ada42', 'Ada 42']
	}
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
	const total = length - 'text'.length - 'f'.length - keys.length
	const meta = Object.fromEntries(
		[...keys].map((key, index) => [
			key,
			'x'.repeat(
				Math.min(STRING_LIMIT, index === 0 ? total : Math.max(0, total - index * STRING_LIMIT)),
			),
		]),
	)

	return { fields: [{ control: 'text', name: 'f', meta }] }
}

export function createTextPopulationSchema(key: string, rule: boolean): FormSchema {
	const keys = 'abcdefghijklmnop'
	const total = TEXT_LIMIT - 'text'.length - 'f'.length - keys.length - 64
	const meta = {
		[key]: '',
		...Object.fromEntries(
			[...keys].map((ballast, index) => [
				ballast,
				'x'.repeat(
					Math.min(STRING_LIMIT, index === 0 ? total : Math.max(0, total - index * STRING_LIMIT)),
				),
			]),
		),
	}

	const field: FormField = rule
		? { control: 'text', name: 'f', meta, rule: {} }
		: { control: 'text', name: 'f', meta }
	return { fields: [field] }
}

export function passValidation(): true {
	return true
}

/**
 * Builds a {@link FieldValidator} that answers each call from a fixed sequence, clamping to the
 * last entry after the sequence is exhausted.
 *
 * @param answers The answer for each call in order; the final entry repeats after exhaustion.
 * @returns A validator whose nth call returns `answers[n]`, clamped to the last index.
 * @example
 * const flaky = createSequenceValidator(['Not yet', true])
 * flaky(undefined, {}) // 'Not yet'
 * flaky(undefined, {}) // true
 * flaky(undefined, {}) // true
 */
export function createSequenceValidator(answers: ReadonlyArray<true | string>): FieldValidator {
	const sequence = new ValidationSequence(answers)
	return sequence.next.bind(sequence)
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

export function createNodePopulationSchema(key: string, extra: boolean): FormSchema {
	const values = Array.from({ length: NODE_LIMIT - 8 }, () => 0)
	const meta = extra ? { values, [key]: 0, extra: 0 } : { values, [key]: 0 }
	return { fields: [{ control: 'text', name: 'f', meta }] }
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

/** Owns the response position of a scripted custom validator. */
export class ValidationSequence {
	readonly #answers: ReadonlyArray<true | string>
	#position = 0
	constructor(answers: ReadonlyArray<true | string>) {
		this.#answers = answers
	}
	next(): true | string {
		const answer = this.#answers[Math.min(this.#position, this.#answers.length - 1)]
		this.#position += 1
		return answer ?? true
	}
}

/** Holds the test-controlled state of a custom validator. */
export class ValidationGate {
	#active = false
	#error: Error | undefined
	get active(): boolean {
		return this.#active
	}
	set active(value: boolean) {
		this.#active = value
	}
	get error(): Error | undefined {
		return this.#error
	}
	set error(value: Error | undefined) {
		this.#error = value
	}
}

/** Owns the ordinal of calls made by a test's scripted boundary. */
export class ValidationCounter {
	#count = 0
	get count(): number {
		return this.#count
	}
	next(): number {
		this.#count += 1
		return this.#count
	}
}

/** Returns a callback that throws the supplied reason. */
export function createFailure(reason: unknown): () => never {
	return () => {
		throw reason
	}
}

/** Records validation snapshots while comparing the value with the repeat field. */
export function createRepeatValidator(seen: FormValues[]): FieldValidator {
	return (value, values) => {
		seen.push(values)
		return value === values.repeat ? true : 'Both entries must match'
	}
}

export function readList(value: FieldValue): readonly string[] {
	return isArray<string>(value) ? value : []
}

export function collectStrings(schema: FormSchema): readonly string[] {
	const found: string[] = []
	const pending: JSONValue[] = [serializeForm(schema)]

	while (pending.length > 0) {
		const node = pending.pop()

		if (isString(node)) {
			found.push(node)
			continue
		}
		if (isArray<JSONValue>(node)) {
			pending.push(...node)
			continue
		}
		if (!isRecord(node)) continue

		for (const [key, value] of Object.entries(node)) {
			found.push(key)
			if (value !== undefined) pending.push(value)
		}
	}

	return found
}

export function measureLongest(schema: FormSchema): number {
	return collectStrings(schema).reduce((longest, text) => Math.max(longest, text.length), 0)
}

export function countText(schema: FormSchema): number {
	return Iterator.from(schema.fields).reduce((total, field) => {
		const base = total + field.control.length + field.name.length
		return field.meta === undefined
			? base
			: Object.entries(field.meta).reduce(
					(sum, [key, value]) => sum + key.length + (isString(value) ? value.length : 0),
					base,
				)
	}, 0)
}

export function countLeaves(schema: FormSchema): number {
	return Iterator.from(schema.fields).reduce(
		(total, field) =>
			field.meta === undefined
				? total
				: Object.values(field.meta).reduce<number>(
						(sum, value) => sum + (isArray(value) ? value.length : 1),
						total,
					),
		0,
	)
}

export function refusalsOf(form: Form): readonly string[] {
	const outcomes = [
		attempt(() => form.fill('nickname', 'grace')),
		attempt(() => form.touch('nickname')),
		attempt(() => form.invalidate('nickname', 'Somebody already uses that name')),
		attempt(() => form.disable('nickname')),
		attempt(() => form.enable('nickname')),
		attempt(() => form.submit()),
		attempt(() => form.clear()),
	]

	return outcomes.map((outcome) => {
		if (outcome.success) return 'none'
		return isFormError(outcome.error) ? outcome.error.code : 'other'
	})
}

export async function receiveAbandonment(form: FormInterface): Promise<unknown> {
	try {
		await form.answer
		return undefined
	} catch (error: unknown) {
		return error
	}
}

export function createAccessorMeta(): { readonly icon: string } {
	return {
		get icon() {
			return 'mail'
		},
	}
}

export function createListValidator(calls: unknown[]): FieldValidator {
	return (value) => {
		calls.push(value)
		return 'List review'
	}
}

export function failSerialization(): string {
	return 'Never serialize me'
}

export function createFailureSchema(failure: Error): FormSchema {
	return {
		fields: [
			{
				control: 'text',
				name: 'email',
				get meta(): never {
					throw failure
				},
			},
		],
	}
}

export function validateAddress(value: FieldValue | undefined, values: FormValues): true | string {
	return values.subscribe === true && value === undefined ? 'Tell us where to write' : true
}

export function matchPassword(value: FieldValue | undefined, values: FormValues): true | string {
	return value === values.password ? true : 'Both passwords must match'
}

export function validateBusiness(value: FieldValue | undefined, values: FormValues): true | string {
	return values.account === 'business' && value === undefined ? 'A VAT number is required' : true
}

export function validateAddresses(value: FieldValue | undefined): true | string {
	return typeof value !== 'string' ||
		value
			.split(',')
			.map((entry) => entry.trim())
			.every((entry) => EMAIL_PATTERN.test(entry))
		? true
		: 'Every address must be valid'
}

export const FORM_SCHEMA: FormSchema = {
	label: 'Sign up',
	groups: [{ name: 'account', label: 'Account' }],
	fields: [
		{
			control: 'text',
			name: 'email',
			label: 'Email',
			group: 'account',
			rule: { required: true, email: true },
		},
		{ control: 'confirm', name: 'terms', label: 'I accept the terms', rule: { required: true } },
		{
			control: 'checkbox',
			name: 'topics',
			label: 'Topics',
			default: ['releases'],
			choices: [
				{ value: 'releases', label: 'Releases' },
				{ value: 'events', label: 'Events' },
			],
		},
		{ control: 'text', name: 'nickname', label: 'Nickname', default: 'ada' },
		{ control: 'text', name: 'referral', label: 'Referral', disabled: true, default: 'friend' },
		{ control: 'text', name: 'token', label: 'Token', hidden: true, locked: true, default: 'abc' },
	],
}

export const BIRTH: readonly FieldError[] = [
	{ field: 'email', message: 'This field is required', rule: 'required' },
	{ field: 'terms', message: 'This field is required', rule: 'required' },
]

export const ANSWERED: FormValues = { email: 'ada@example.com', terms: true }

export const ENTRY_SCHEMA: FormSchema = {
	name: 'signup',
	label: 'Sign up',
	help: 'Every control the package models, in one schema.',
	groups: [
		{ name: 'account', label: 'Account' },
		{ name: 'profile', label: 'Profile', help: 'Tell people who you are.' },
	],
	fields: [
		{
			control: 'text',
			name: 'email',
			label: 'Email',
			group: 'account',
			placeholder: 'ada@example.com',
			rule: { required: true, email: true },
			meta: { column: 1, tags: ['contact'] },
		},
		{ control: 'editor', name: 'bio', label: 'Bio', group: 'profile', rule: { maximum: 240 } },
		{
			control: 'password',
			name: 'secret',
			label: 'Password',
			group: 'account',
			mask: '*',
			rule: {
				required: true,
				minimum: 8,
				custom: (value, values) => (value === values.repeat ? true : 'Both passwords must match'),
			},
		},
		{
			control: 'number',
			name: 'age',
			label: 'Age',
			group: 'profile',
			rule: { integer: true, minimum: 18, step: 1 },
		},
		{ control: 'date', name: 'born', label: 'Date of birth', rule: { maximum: '2008-01-01' } },
		{ control: 'time', name: 'reminder', label: 'Reminder', default: '09:00' },
		{ control: 'datetime', name: 'starts', label: 'Starts', default: '2026-01-01T09:00' },
		{ control: 'color', name: 'accent', label: 'Accent', default: '#336699' },
		{ control: 'confirm', name: 'terms', label: 'I accept the terms', rule: { required: true } },
		{
			control: 'select',
			name: 'payment',
			label: 'Payment',
			open: true,
			choices: [
				{ value: 'card', label: 'Card' },
				{ value: 'transfer', label: 'Transfer', help: 'Two working days.', disabled: true },
			],
		},
		{
			control: 'checkbox',
			name: 'topics',
			label: 'Topics',
			default: ['releases'],
			choices: [
				{ value: 'releases', label: 'Releases' },
				{ value: 'events', label: 'Events' },
			],
			rule: { maximum: 2 },
		},
		{
			control: 'file',
			name: 'avatar',
			label: 'Avatar',
			accept: ['image/png', '.jpg'],
			multiple: true,
			hidden: true,
			locked: true,
		},
	],
}

export const FACTORY_SCHEMA: FormSchema = {
	label: 'Sign up',
	fields: [
		{ control: 'text', name: 'email', label: 'Email', rule: { required: true, email: true } },
		{ control: 'confirm', name: 'terms', label: 'I accept the terms', rule: { required: true } },
	],
}

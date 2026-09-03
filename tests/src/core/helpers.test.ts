import type {
	FieldControl,
	FieldRuleName,
	FieldValue,
	FormField,
	FormSchema,
	FormValues,
} from '@src/core'
import {
	CHOICE_LIMIT,
	FIELD_CONTROLS,
	FIELD_LIMIT,
	Form,
	GROUP_LIMIT,
	LIST_LIMIT,
	NAME_LIMIT,
	NODE_LIMIT,
	STRING_LIMIT,
	TEXT_LIMIT,
	appliesRule,
	auditSchema,
	computeDefaults,
	createFieldError,
	defineEntry,
	evaluateField,
	evaluateForm,
	extractChanges,
	extractGroups,
	formatMessage,
	freezeEntry,
	isFormError,
	matchesAnswer,
	matchesField,
	matchesValue,
	matchesValues,
	serializeForm,
} from '@src/core'
import { attempt } from '@orkestrel/contract'
import { roundTripJSON } from '@orkestrel/test'
import { PATTERN_LIMIT } from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	ANSWER_CASES,
	CHANGED_CASES,
	MATRIX_RULES,
	MATRIX_VALUES,
	RULE_APPLICABILITY,
	STRING_FIELDS,
	createCheckboxLimit,
	createChoiceBudgetSchema,
	createFieldBudgetSchema,
	createGroupBudgetSchema,
	createMatrixCase,
	createMatrixField,
	createNameBudgetCases,
	createNodeBudgetSchema,
	createNodePopulationSchema,
	createStringBudgetCases,
	createTextBudgetSchema,
	createTextPopulationSchema,
} from '../../setup.js'

describe('createFieldError', () => {
	const field: FormField = { control: 'text', name: 'nickname' }

	it('resolves the default copy and substitutes the operand', () => {
		expect(createFieldError(field, 'minimum', 3)).toStrictEqual({
			field: 'nickname',
			message: 'Must be at least 3',
			rule: 'minimum',
		})
		expect(createFieldError(field, 'required', undefined)).toStrictEqual({
			field: 'nickname',
			message: 'This field is required',
			rule: 'required',
		})
	})

	it('prefers an override message over the default copy', () => {
		expect(
			createFieldError(field, 'maximum', 8, { maximum: 'At most {limit} please' }),
		).toStrictEqual({ field: 'nickname', message: 'At most 8 please', rule: 'maximum' })
		expect(createFieldError(field, 'maximum', 8, { minimum: 'Unread' }).message).toBe(
			'Must be at most 8',
		)
	})

	it('returns a frozen error', () => {
		expect(Object.isFrozen(createFieldError(field, 'email', undefined))).toBe(true)
	})
})

describe('defineEntry', () => {
	it('writes a __proto__ key that plain assignment cannot create', () => {
		const hostile = '__proto__'

		const assigned: Record<string, number> = {}
		assigned[hostile] = 1
		expect(Object.hasOwn(assigned, hostile)).toBe(false)

		const defined: Record<string, number> = {}
		defineEntry(defined, hostile, 1)
		expect(Object.hasOwn(defined, hostile)).toBe(true)
		expect(Object.getPrototypeOf(defined)).toBe(Object.prototype)
		expect(Object.entries(defined)).toEqual([[hostile, 1]])
	})

	it('leaves the entry enumerable, writable, and configurable', () => {
		const target: Record<string, number> = {}
		defineEntry(target, 'count', 1)
		defineEntry(target, 'count', 2)

		expect(target.count).toBe(2)
		expect(Object.getOwnPropertyDescriptor(target, 'count')).toEqual({
			value: 2,
			enumerable: true,
			configurable: true,
			writable: true,
		})
	})
})

describe('freezeEntry', () => {
	it('writes a __proto__ key that plain assignment cannot create', () => {
		const hostile = '__proto__'

		const target: Record<string, number> = {}
		freezeEntry(target, hostile, 1)

		expect(Object.hasOwn(target, hostile)).toBe(true)
		expect(Object.getPrototypeOf(target)).toBe(Object.prototype)
		expect(Object.entries(target)).toEqual([[hostile, 1]])
	})

	it('freezes the entry against a second write', () => {
		const target: Record<string, number> = {}
		freezeEntry(target, 'count', 1)

		expect(Object.getOwnPropertyDescriptor(target, 'count')).toEqual({
			value: 1,
			enumerable: true,
			configurable: false,
			writable: false,
		})
		expect(attempt(() => freezeEntry(target, 'count', 2)).success).toBe(false)
		expect(target.count).toBe(1)
	})
})

describe('matchesField', () => {
	it('accepts each control own value shape', () => {
		expect(matchesField({ control: 'text', name: 'text' }, '')).toBe(true)
		expect(matchesField({ control: 'editor', name: 'editor' }, 'copy')).toBe(true)
		expect(matchesField({ control: 'password', name: 'password' }, 'secret')).toBe(true)
		expect(matchesField({ control: 'number', name: 'number' }, 12.5)).toBe(true)
		expect(matchesField({ control: 'date', name: 'date' }, '2026-08-15')).toBe(true)
		expect(matchesField({ control: 'time', name: 'time' }, '09:30:15')).toBe(true)
		expect(matchesField({ control: 'datetime', name: 'datetime' }, '2026-08-15T09:30')).toBe(true)
		expect(matchesField({ control: 'color', name: 'color' }, '#33AA99')).toBe(true)
		expect(matchesField({ control: 'confirm', name: 'confirm' }, false)).toBe(true)
		expect(
			matchesField(
				{ control: 'select', name: 'select', choices: [{ value: 'one', label: 'One' }] },
				'one',
			),
		).toBe(true)
		expect(
			matchesField(
				{
					control: 'checkbox',
					name: 'checkbox',
					choices: [
						{ value: 'one', label: 'One' },
						{ value: 'two', label: 'Two' },
					],
				},
				['one', 'two'],
			),
		).toBe(true)
		expect(matchesField({ control: 'file', name: 'file' }, ['avatar.png'])).toBe(true)
	})

	it('rejects mismatched values and invalid formatted strings', () => {
		expect(matchesField({ control: 'text', name: 'text' }, 1)).toBe(false)
		expect(matchesField({ control: 'editor', name: 'editor' }, false)).toBe(false)
		expect(matchesField({ control: 'password', name: 'password' }, [])).toBe(false)
		expect(matchesField({ control: 'number', name: 'number' }, Number.NaN)).toBe(false)
		expect(matchesField({ control: 'number', name: 'number' }, Number.POSITIVE_INFINITY)).toBe(
			false,
		)
		expect(matchesField({ control: 'date', name: 'date' }, '15-08-2026')).toBe(false)
		expect(matchesField({ control: 'time', name: 'time' }, '25:00')).toBe(false)
		expect(matchesField({ control: 'datetime', name: 'datetime' }, '2026-08-15 09:30')).toBe(false)
		expect(matchesField({ control: 'color', name: 'color' }, '33aa99')).toBe(false)
		expect(matchesField({ control: 'confirm', name: 'confirm' }, 'true')).toBe(false)
	})

	it('enforces choice membership, uniqueness, and file multiplicity', () => {
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

		expect(matchesField(select, 'two')).toBe(false)
		expect(matchesField(open, 'two')).toBe(true)
		expect(matchesField(checkbox, ['two'])).toBe(false)
		expect(matchesField(checkbox, ['one', 'one'])).toBe(false)
		expect(matchesField({ control: 'file', name: 'file' }, ['one.txt', 'two.txt'])).toBe(false)
		expect(
			matchesField({ control: 'file', name: 'file', multiple: true }, ['one.txt', 'two.txt']),
		).toBe(true)
		expect(matchesField({ control: 'file', name: 'file' }, [1])).toBe(false)
	})

	it('refuses disabled choices even when an open select otherwise admits the value', () => {
		const choices = [
			{ value: 'enabled', label: 'Enabled' },
			{ value: 'disabled', label: 'Disabled', disabled: true },
		]

		expect(matchesField({ control: 'select', name: 'select', choices }, 'disabled')).toBe(false)
		expect(
			matchesField({ control: 'select', name: 'select', choices, open: true }, 'disabled'),
		).toBe(false)
		expect(matchesField({ control: 'checkbox', name: 'checkbox', choices }, ['disabled'])).toBe(
			false,
		)
	})

	it('enforces string ceilings before format and membership work', () => {
		const boundary = 'x'.repeat(STRING_LIMIT)
		const oversized = 'x'.repeat(STRING_LIMIT + 1)
		const choices = new Proxy<Array<{ value: string; label: string }>>([], {
			get() {
				throw new Error('membership must not run')
			},
		})

		for (const field of STRING_FIELDS) expect(matchesField(field, oversized)).toBe(false)
		expect(matchesField({ control: 'text', name: 'text' }, boundary)).toBe(true)
		expect(matchesField({ control: 'editor', name: 'editor' }, boundary)).toBe(true)
		expect(matchesField({ control: 'password', name: 'password' }, boundary)).toBe(true)
		expect(
			matchesField({ control: 'select', name: 'select', choices: [], open: true }, boundary),
		).toBe(true)
		expect(
			matchesField({ control: 'select', name: 'select', choices, open: true }, oversized),
		).toBe(false)
	})

	it('enforces list and list-entry ceilings for checkbox and file values', () => {
		const [boundaryField, boundaryValue] = createCheckboxLimit(LIST_LIMIT)
		const [oversizedField, oversizedValue] = createCheckboxLimit(LIST_LIMIT + 1)
		const [entryField, entryValue] = createCheckboxLimit(1, STRING_LIMIT)
		const [longEntryField, longEntryValue] = createCheckboxLimit(1, STRING_LIMIT + 1)

		expect(matchesField(boundaryField, boundaryValue)).toBe(true)
		expect(matchesField(oversizedField, oversizedValue)).toBe(false)
		expect(matchesField(entryField, entryValue)).toBe(true)
		expect(matchesField(longEntryField, longEntryValue)).toBe(false)
		expect(
			matchesField(
				{ control: 'file', name: 'file', multiple: true },
				Array.from({ length: LIST_LIMIT }, () => 'file.txt'),
			),
		).toBe(true)
		expect(
			matchesField(
				{ control: 'file', name: 'file', multiple: true },
				Array.from({ length: LIST_LIMIT + 1 }, () => 'file.txt'),
			),
		).toBe(false)
		expect(matchesField({ control: 'file', name: 'file' }, ['x'.repeat(STRING_LIMIT)])).toBe(true)
		expect(matchesField({ control: 'file', name: 'file' }, ['x'.repeat(STRING_LIMIT + 1)])).toBe(
			false,
		)
	})
})

describe('evaluateField', () => {
	it('reports required first for every absent control and then runs custom', () => {
		let received: FieldValue | undefined = 'not called'

		expect(
			evaluateField(
				{
					control: 'text',
					name: 'text',
					rule: {
						required: true,
						minimum: 2,
						custom: (value) => {
							received = value
							return 'Custom failure'
						},
					},
				},
				undefined,
				{},
			),
		).toStrictEqual([
			{ field: 'text', message: 'This field is required', rule: 'required' },
			{ field: 'text', message: 'Custom failure' },
		])
		expect(
			evaluateField({ control: 'editor', name: 'editor', rule: { required: true } }, undefined, {}),
		).toHaveLength(1)
		expect(
			evaluateField(
				{ control: 'password', name: 'password', rule: { required: true } },
				undefined,
				{},
			),
		).toHaveLength(1)
		expect(
			evaluateField({ control: 'number', name: 'number', rule: { required: true } }, undefined, {}),
		).toHaveLength(1)
		expect(
			evaluateField({ control: 'date', name: 'date', rule: { required: true } }, undefined, {}),
		).toHaveLength(1)
		expect(
			evaluateField({ control: 'time', name: 'time', rule: { required: true } }, undefined, {}),
		).toHaveLength(1)
		expect(
			evaluateField(
				{ control: 'datetime', name: 'datetime', rule: { required: true } },
				undefined,
				{},
			),
		).toHaveLength(1)
		expect(
			evaluateField({ control: 'color', name: 'color', rule: { required: true } }, undefined, {}),
		).toHaveLength(1)
		expect(
			evaluateField(
				{ control: 'confirm', name: 'confirm', rule: { required: true } },
				undefined,
				{},
			),
		).toHaveLength(1)
		expect(
			evaluateField(
				{
					control: 'select',
					name: 'select',
					choices: [],
					rule: { required: true },
				},
				undefined,
				{},
			),
		).toHaveLength(1)
		expect(
			evaluateField(
				{
					control: 'checkbox',
					name: 'checkbox',
					choices: [],
					rule: { required: true },
				},
				undefined,
				{},
			),
		).toHaveLength(1)
		expect(
			evaluateField({ control: 'file', name: 'file', rule: { required: true } }, undefined, {}),
		).toHaveLength(1)
		expect(received).toBeUndefined()
	})

	it('lets custom pass, fail conditionally, or throw on absence', () => {
		const failure = new Error('custom failure')

		expect(
			evaluateField(
				{ control: 'text', name: 'optional', rule: { custom: () => true } },
				undefined,
				{},
			),
		).toStrictEqual([])
		expect(
			evaluateField(
				{
					control: 'text',
					name: 'address',
					rule: {
						custom: (value, values) =>
							values.subscribe === true && value === undefined ? 'Address required' : true,
					},
				},
				undefined,
				{ subscribe: true },
			),
		).toStrictEqual([{ field: 'address', message: 'Address required' }])
		expect(() =>
			evaluateField(
				{
					control: 'text',
					name: 'throwing',
					rule: {
						custom: () => {
							throw failure
						},
					},
				},
				undefined,
				{},
			),
		).toThrow(failure)
	})

	it('checks bounds with each control own measurement', () => {
		expect(
			evaluateField({ control: 'text', name: 'text', rule: { minimum: 2, maximum: 4 } }, 'abc', {}),
		).toStrictEqual([])
		expect(
			evaluateField(
				{ control: 'editor', name: 'editor', rule: { minimum: 4, maximum: 5 } },
				'abc',
				{},
			).map((error) => error.rule),
		).toStrictEqual(['minimum'])
		expect(
			evaluateField(
				{ control: 'password', name: 'password', rule: { minimum: 2, maximum: 2 } },
				'abc',
				{},
			).map((error) => error.rule),
		).toStrictEqual(['maximum'])
		expect(
			evaluateField({ control: 'number', name: 'number', rule: { minimum: 1, maximum: 3 } }, 2, {}),
		).toStrictEqual([])
		expect(
			evaluateField(
				{ control: 'number', name: 'number', rule: { minimum: 1, maximum: 3 } },
				4,
				{},
			).map((error) => error.rule),
		).toStrictEqual(['maximum'])
		expect(
			evaluateField(
				{ control: 'date', name: 'date', rule: { minimum: '2026-01-01', maximum: '2026-12-31' } },
				'2026-08-15',
				{},
			),
		).toStrictEqual([])
		expect(
			evaluateField(
				{ control: 'time', name: 'time', rule: { minimum: '09:00', maximum: '17:00' } },
				'08:59',
				{},
			).map((error) => error.rule),
		).toStrictEqual(['minimum'])
		expect(
			evaluateField(
				{
					control: 'datetime',
					name: 'datetime',
					rule: { minimum: '2026-08-15T09:00', maximum: '2026-08-15T17:00' },
				},
				'2026-08-15T18:00',
				{},
			).map((error) => error.rule),
		).toStrictEqual(['maximum'])
		expect(
			evaluateField(
				{ control: 'checkbox', name: 'checkbox', choices: [], rule: { minimum: 1, maximum: 2 } },
				['one'],
				{},
			),
		).toStrictEqual([])
		expect(
			evaluateField(
				{ control: 'file', name: 'file', rule: { minimum: 2, maximum: 3 } },
				['one'],
				{},
			).map((error) => error.rule),
		).toStrictEqual(['minimum'])
	})

	it('keeps bounds inert for confirm, select, and color controls', () => {
		expect(
			evaluateField(
				{ control: 'confirm', name: 'confirm', rule: { minimum: 1, maximum: 1 } },
				false,
				{},
			),
		).toStrictEqual([])
		expect(
			evaluateField(
				{ control: 'select', name: 'select', choices: [], rule: { minimum: 1, maximum: 1 } },
				'one',
				{},
			),
		).toStrictEqual([])
		expect(
			evaluateField(
				{ control: 'color', name: 'color', rule: { minimum: 1, maximum: 1 } },
				'#ffffff',
				{},
			),
		).toStrictEqual([])
	})

	it('checks numeric step from minimum with tolerance and keeps it inert elsewhere', () => {
		expect(
			evaluateField(
				{ control: 'number', name: 'number', rule: { minimum: 0.1, step: 0.2 } },
				0.3,
				{},
			),
		).toStrictEqual([])
		expect(
			evaluateField(
				{ control: 'number', name: 'number', rule: { minimum: 'zero', step: 2 } },
				3,
				{},
			).map((error) => error.rule),
		).toStrictEqual(['step'])
		expect(
			evaluateField({ control: 'text', name: 'text', rule: { step: 2 } }, '3', {}),
		).toStrictEqual([])
		expect(
			evaluateField({ control: 'date', name: 'date', rule: { step: 2 } }, '2026-08-15', {}),
		).toStrictEqual([])
		expect(
			evaluateField(
				{ control: 'checkbox', name: 'checkbox', choices: [], rule: { step: 2 } },
				['one'],
				{},
			),
		).toStrictEqual([])
	})

	it('checks every string rule and the numeric integer rule in order', () => {
		const rules: readonly FieldRuleName[] = ['pattern', 'email', 'url', 'alphanumeric', 'integer']
		const field: FormField = {
			control: 'text',
			name: 'text',
			rule: {
				pattern: '^wanted$',
				email: true,
				url: true,
				alphanumeric: true,
				integer: true,
			},
		}

		expect(evaluateField(field, 'wrong value', {}).map((error) => error.rule)).toStrictEqual(rules)
		expect(
			evaluateField({ control: 'editor', name: 'editor', rule: { pattern: '^copy$' } }, 'copy', {}),
		).toStrictEqual([])
		expect(
			evaluateField(
				{ control: 'password', name: 'password', rule: { alphanumeric: true } },
				'Ada42',
				{},
			),
		).toStrictEqual([])
		expect(
			evaluateField({ control: 'date', name: 'date', rule: { integer: true } }, '2026-08-15', {}),
		).toHaveLength(1)
		expect(
			evaluateField({ control: 'time', name: 'time', rule: { pattern: '^09:30$' } }, '09:30', {}),
		).toStrictEqual([])
		expect(
			evaluateField(
				{ control: 'datetime', name: 'datetime', rule: { pattern: 'T' } },
				'2026-08-15T09:30',
				{},
			),
		).toStrictEqual([])
		expect(
			evaluateField({ control: 'color', name: 'color', rule: { pattern: '^#' } }, '#ffffff', {}),
		).toStrictEqual([])
		expect(
			evaluateField(
				{ control: 'select', name: 'select', choices: [], rule: { pattern: '^one$' } },
				'one',
				{},
			),
		).toStrictEqual([])
		expect(
			evaluateField({ control: 'number', name: 'number', rule: { integer: true } }, 2, {}),
		).toStrictEqual([])
		expect(
			evaluateField({ control: 'number', name: 'number', rule: { integer: true } }, 2.5, {}).map(
				(error) => error.rule,
			),
		).toStrictEqual(['integer'])
	})

	it('fails invalid and over-limit authored patterns without throwing', () => {
		expect(
			evaluateField({ control: 'text', name: 'text', rule: { pattern: '[' } }, 'text', {}).map(
				(error) => error.rule,
			),
		).toStrictEqual(['pattern'])
		expect(
			evaluateField(
				{ control: 'text', name: 'text', rule: { pattern: 'a'.repeat(257) } },
				'a',
				{},
			).map((error) => error.rule),
		).toStrictEqual(['pattern'])
	})

	it('keeps string rules inert for boolean and array controls', () => {
		expect(
			evaluateField(
				{ control: 'confirm', name: 'confirm', rule: { pattern: 'true', email: true } },
				true,
				{},
			),
		).toStrictEqual([])
		expect(
			evaluateField(
				{
					control: 'checkbox',
					name: 'checkbox',
					choices: [],
					rule: { url: true, integer: true },
				},
				[],
				{},
			),
		).toStrictEqual([])
		expect(
			evaluateField({ control: 'file', name: 'file', rule: { alphanumeric: true } }, [], {}),
		).toStrictEqual([])
	})

	it('runs custom last with the value and cross-field values', () => {
		const values: FormValues = { password: 'secret', repeat: 'different' }
		const errors = evaluateField(
			{
				control: 'password',
				name: 'repeat',
				rule: {
					minimum: 8,
					custom: (value, all) =>
						value === all.password ? true : `Expected ${String(all.password)}`,
				},
			},
			'different',
			values,
		)

		expect(errors).toStrictEqual([{ field: 'repeat', message: 'Expected secret' }])
	})

	it('overrides messages and interpolates each limit', () => {
		const errors = evaluateField(
			{ control: 'text', name: 'name', rule: { minimum: 5, maximum: 2 } },
			'abc',
			{},
			{ minimum: 'Need {limit} characters', maximum: 'Keep {limit} max' },
		)

		expect(errors.map((error) => error.message)).toStrictEqual(['Need 5 characters', 'Keep 2 max'])
		expect(formatMessage('step', 0.25, { step: 'Use {limit}, then {limit}' })).toBe(
			'Use 0.25, then 0.25',
		)
	})
})

describe('form helpers', () => {
	it('projects raw binding values into answer presence', () => {
		for (const entry of ANSWER_CASES) expect(matchesAnswer(entry.value)).toBe(entry.answer)
	})

	it('extracts changed names with absence-aware value comparison', () => {
		for (const entry of CHANGED_CASES) {
			expect([...extractChanges(entry.current, entry.opened)]).toStrictEqual(entry.names)
		}

		const values: FormValues = { answer: ['one'] }
		const changed = extractChanges(values, values)

		expect(changed).toEqual(new Set())
		expect(changed).not.toBe(extractChanges(values, values))
	})

	it('compares one field value by scalar identity or ordered list content', () => {
		expect(matchesValue('same', 'same')).toBe(true)
		expect(matchesValue(['one', 'two'], ['one', 'two'])).toBe(true)
		expect(matchesValue(['one', 'two'], ['two', 'one'])).toBe(false)
		expect(matchesValue(['one'], 'one')).toBe(false)
	})

	it('answers rule applicability from one total control-by-rule source', () => {
		expect(appliesRule('text', 'minimum')).toBe(true)
		expect(appliesRule('confirm', 'minimum')).toBe(false)
		expect(Reflect.apply(appliesRule, undefined, ['outside', 'required'])).toBe(false)
	})

	it('evaluates fields in schema order while skipping only disabled fields', () => {
		const schema: FormSchema = {
			fields: [
				{ control: 'text', name: 'first', rule: { required: true } },
				{ control: 'text', name: 'disabled', disabled: true, rule: { required: true } },
				{ control: 'text', name: 'hidden', hidden: true, rule: { required: true } },
				{ control: 'text', name: 'locked', locked: true, rule: { required: true } },
			],
		}

		expect(evaluateForm(schema, {}).map((error) => error.field)).toStrictEqual([
			'first',
			'hidden',
			'locked',
		])
		expect(evaluateForm(schema, {}).every((error) => Object.isFrozen(error))).toBe(true)
	})

	it('groups message overrides and lets an explicit disabled set replace declarations', () => {
		const schema: FormSchema = {
			fields: [
				{ control: 'text', name: 'active', rule: { required: true } },
				{ control: 'text', name: 'declared', disabled: true, rule: { required: true } },
			],
		}

		expect(
			evaluateForm(schema, {}, { messages: { required: 'Answer this' } }).map((error) => [
				error.field,
				error.message,
			]),
		).toStrictEqual([['active', 'Answer this']])
		expect(
			evaluateForm(schema, {}, { disabled: new Set(['active']) }).map((error) => error.field),
		).toStrictEqual(['declared'])
		expect(evaluateForm(schema, {}).map((error) => error.field)).toStrictEqual(['active'])
	})

	it('reads only own answer keys during evaluation', () => {
		const values = Object.create({ constructor: 'inherited' })
		const errors = evaluateForm(
			{
				fields: [{ control: 'text', name: 'constructor', rule: { required: true } }],
			},
			values,
		)

		expect(errors).toStrictEqual([
			{ field: 'constructor', message: 'This field is required', rule: 'required' },
		])
	})

	it('computes only declared defaults and owns list defaults', () => {
		const selected = ['one']
		const schema: FormSchema = {
			fields: [
				{ control: 'text', name: 'text', default: '' },
				{ control: 'number', name: 'number', default: 0 },
				{ control: 'confirm', name: 'confirm', default: false },
				{
					control: 'checkbox',
					name: 'checkbox',
					choices: [{ value: 'one', label: 'One' }],
					default: selected,
				},
				{ control: 'file', name: 'missing' },
			],
		}
		const defaults = computeDefaults(schema)

		expect(defaults).toStrictEqual({ text: '', number: 0, confirm: false, checkbox: ['one'] })
		expect(Object.hasOwn(defaults, 'missing')).toBe(false)
		expect(defaults.checkbox).not.toBe(selected)
	})

	it('defines prototype-shadowing defaults as own keys', () => {
		const defaults = computeDefaults({
			fields: [{ control: 'text', name: 'constructor', default: 'owned' }],
		})

		expect(defaults.constructor).toBe('owned')
		expect(Object.hasOwn(defaults, 'constructor')).toBe(true)
	})

	it('compares key sets, scalar values, and list content in order', () => {
		expect(
			matchesValues(
				{ text: 'same', choices: ['one', 'two'] },
				{ choices: ['one', 'two'], text: 'same' },
			),
		).toBe(true)
		expect(matchesValues({ choices: ['one', 'two'] }, { choices: ['two', 'one'] })).toBe(false)
		expect(matchesValues({ value: 1 }, { value: 2 })).toBe(false)
		expect(matchesValues({ value: 1 }, { value: 1, extra: true })).toBe(false)
	})

	it('serializes a deep function-free projection with stable order', () => {
		const schema: FormSchema = {
			name: 'signup',
			groups: [{ name: 'account', label: 'Account' }],
			fields: [
				{
					control: 'select',
					name: 'choice',
					group: 'account',
					choices: [{ value: 'one', label: 'One' }],
					rule: { required: true, custom: () => 'Never serialize me' },
				},
				{ control: 'file', name: 'files', accept: ['image/png', '.jpg'], multiple: true },
			],
		}
		const serialized = serializeForm(schema)

		expect(serialized).toEqual({
			name: 'signup',
			groups: [{ name: 'account', label: 'Account' }],
			fields: [
				{
					control: 'select',
					name: 'choice',
					group: 'account',
					choices: [{ value: 'one', label: 'One' }],
					rule: { required: true },
				},
				{ control: 'file', name: 'files', accept: ['image/png', '.jpg'], multiple: true },
			],
		})
		expect(roundTripJSON(serialized)).toEqual(serialized)
		expect(Object.keys(serialized)).toStrictEqual(['name', 'groups', 'fields'])
		expect(JSON.stringify(serialized).indexOf('"choice"')).toBeLessThan(
			JSON.stringify(serialized).indexOf('"files"'),
		)
		expect(Object.getPrototypeOf(serialized)).toBeNull()
		expect(Object.isFrozen(serialized)).toBe(true)
	})

	it('serializes field meta through JSON', () => {
		const meta = { column: 2, nested: { tags: ['contact'] } }
		const serialized = serializeForm({
			fields: [{ control: 'text', name: 'email', meta }],
		})
		const parsed = roundTripJSON(serialized)

		expect(parsed).toStrictEqual({
			fields: [
				{
					control: 'text',
					name: 'email',
					meta: { column: 2, nested: { tags: ['contact'] } },
				},
			],
		})
	})

	it('reports metadata ownership refusal as a schema error naming the field', () => {
		const outcome = attempt(() =>
			serializeForm({
				fields: [
					{
						control: 'text',
						name: 'email',
						meta: {
							get icon() {
								return 'mail'
							},
						},
					},
				],
			}),
		)
		const error = outcome.success ? undefined : outcome.error

		expect(isFormError(error)).toBe(true)
		expect(isFormError(error) ? error.code : undefined).toBe('SCHEMA')
		expect(isFormError(error) ? error.context?.field : undefined).toBe('email')
	})

	it('preserves a foreign metadata throw by identity', () => {
		const failure = new Error('metadata read failed')
		const schema: FormSchema = {
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
		const outcome = attempt(() => serializeForm(schema))
		const error = outcome.success ? undefined : outcome.error

		expect(outcome.success).toBe(false)
		expect(error).toBe(failure)
	})

	it('omits a rule whose only authored member is custom', () => {
		const serialized = serializeForm({
			fields: [{ control: 'text', name: 'name', rule: { custom: () => 'Not serialized' } }],
		})
		const fields = serialized.fields

		expect(fields).toEqual([{ control: 'text', name: 'name' }])
	})

	it('extracts referenced groups in first-reference field order', () => {
		const schema: FormSchema = {
			groups: [
				{ name: 'first', label: 'First' },
				{ name: 'second', label: 'Second' },
				{ name: 'unused', label: 'Unused' },
			],
			fields: [
				{ control: 'text', name: 'a', group: 'second' },
				{ control: 'text', name: 'b', group: 'first' },
				{ control: 'text', name: 'c', group: 'second' },
			],
		}

		expect(extractGroups(schema).map((group) => group.name)).toStrictEqual(['second', 'first'])
	})
})

describe('auditSchema', () => {
	it('reports field and group identity faults and accepts their sound forms', () => {
		expect(
			auditSchema({
				groups: [
					{ name: 'profile', label: 'Profile' },
					{ name: 'profile', label: 'Duplicate' },
				],
				fields: [
					{ control: 'text', name: '' },
					{ control: 'text', name: 'email', group: 'missing' },
					{ control: 'text', name: 'email' },
				],
			}),
		).toEqual(
			expect.arrayContaining([
				expect.stringContaining('profile'),
				expect.stringContaining('empty'),
				expect.stringContaining('missing'),
				expect.stringContaining('email'),
			]),
		)
		expect(
			auditSchema({
				groups: [{ name: 'profile', label: 'Profile' }],
				fields: [
					{ control: 'text', name: 'email', group: 'profile' },
					{ control: 'text', name: 'constructor' },
					{ control: 'text', name: 'prototype' },
				],
			}),
		).toStrictEqual([])
		expect(auditSchema({ fields: [{ control: 'text', name: '__proto__' }] })).toStrictEqual([
			'Field "__proto__" has a refused name',
		])
	})

	it('reports invalid defaults and accepts matching defaults', () => {
		const invalid: FormSchema = {
			fields: [
				{ control: 'text', name: 'text', default: 'ok' },
				{ control: 'number', name: 'number', default: Number.NaN },
				{ control: 'date', name: 'date', default: '2026-99-99' },
				{ control: 'time', name: 'time', default: '25:00' },
				{ control: 'datetime', name: 'datetime', default: '2026-08-15 09:30' },
				{ control: 'color', name: 'color', default: 'blue' },
				{
					control: 'select',
					name: 'select',
					choices: [{ value: 'one', label: 'One' }],
					default: 'two',
				},
				{
					control: 'checkbox',
					name: 'checkbox',
					choices: [{ value: 'one', label: 'One' }],
					default: ['one', 'one'],
				},
				{ control: 'file', name: 'file' },
			],
		}

		expect(auditSchema(invalid)).toHaveLength(7)
		expect(
			auditSchema({
				fields: [
					{ control: 'number', name: 'number', default: 2 },
					{ control: 'date', name: 'date', default: '2026-08-15' },
					{ control: 'time', name: 'time', default: '09:30' },
					{ control: 'datetime', name: 'datetime', default: '2026-08-15T09:30' },
					{ control: 'color', name: 'color', default: '#336699' },
					{
						control: 'select',
						name: 'select',
						choices: [{ value: 'one', label: 'One' }],
						default: 'one',
					},
					{
						control: 'checkbox',
						name: 'checkbox',
						choices: [{ value: 'one', label: 'One' }],
						default: ['one'],
					},
				],
			}),
		).toStrictEqual([])
	})

	it('reports defaults naming disabled choices', () => {
		expect(
			auditSchema({
				fields: [
					{
						control: 'select',
						name: 'select',
						choices: [{ value: 'one', label: 'One', disabled: true }],
						default: 'one',
					},
					{
						control: 'checkbox',
						name: 'checkbox',
						choices: [{ value: 'one', label: 'One', disabled: true }],
						default: ['one'],
					},
				],
			}),
		).toStrictEqual([
			'Field "select" has an invalid default',
			'Field "checkbox" has an invalid default',
		])
	})

	it('accepts a present empty checkbox answer when required', () => {
		const schema: FormSchema = {
			fields: [
				{
					control: 'checkbox',
					name: 'topics',
					choices: [],
					rule: { required: true },
				},
			],
		}

		expect(auditSchema(schema)).toStrictEqual([])

		const form = new Form(schema)
		form.fill('topics', [])
		expect(form.submit()).toStrictEqual({ success: true, value: { topics: [] } })
	})

	it('audits satisfiability independently of declared field disablement', () => {
		expect(
			auditSchema({
				fields: [
					{
						control: 'select',
						name: 'plan',
						disabled: true,
						choices: [{ value: 'legacy', label: 'Legacy', disabled: true }],
						rule: { required: true },
					},
					{
						control: 'checkbox',
						name: 'topics',
						disabled: true,
						choices: [{ value: 'legacy', label: 'Legacy', disabled: true }],
						rule: { required: true },
					},
					{
						control: 'checkbox',
						name: 'minimum',
						disabled: true,
						choices: [{ value: 'legacy', label: 'Legacy', disabled: true }],
						rule: { minimum: 1 },
					},
				],
			}),
		).toStrictEqual([
			'Field "plan" is required but offers no enabled choice',
			'Field "minimum" has minimum 1 but offers only 0 enabled choices',
		])
	})

	it('faults active closed selects and unattainable checkbox minimums', () => {
		expect(
			auditSchema({
				fields: [
					{
						control: 'select',
						name: 'plan',
						choices: [{ value: 'legacy', label: 'Legacy', disabled: true }],
						rule: { required: true },
					},
					{
						control: 'checkbox',
						name: 'topics',
						choices: [
							{ value: 'current', label: 'Current' },
							{ value: 'legacy', label: 'Legacy', disabled: true },
						],
						rule: { minimum: 2 },
					},
					{
						control: 'select',
						name: 'open',
						open: true,
						choices: [],
						rule: { required: true },
					},
				],
			}),
		).toStrictEqual([
			'Field "plan" is required but offers no enabled choice',
			'Field "topics" has minimum 2 but offers only 1 enabled choice',
		])
	})

	it('reports duplicate choice values within each choice field', () => {
		expect(
			auditSchema({
				fields: [
					{
						control: 'select',
						name: 'select',
						choices: [
							{ value: 'one', label: 'First' },
							{ value: 'one', label: 'Second' },
						],
					},
					{
						control: 'checkbox',
						name: 'checkbox',
						choices: [
							{ value: 'one', label: 'First' },
							{ value: 'one', label: 'Second' },
						],
					},
				],
			}),
		).toStrictEqual([
			'Field "select" offers choice "one" more than once',
			'Field "checkbox" offers choice "one" more than once',
		])
	})

	it('reports incompatible rules and accepts compatible rules', () => {
		const invalid: FormSchema = {
			fields: [
				{ control: 'text', name: 'text-bound', rule: { minimum: 'one' } },
				{ control: 'date', name: 'date-bound', rule: { maximum: 2 } },
				{ control: 'text', name: 'text-step', rule: { step: 1 } },
				{ control: 'number', name: 'number-step', rule: { step: 0 } },
				{ control: 'number', name: 'number-pattern', rule: { pattern: '\\d' } },
				{ control: 'confirm', name: 'confirm-email', rule: { email: true } },
				{
					control: 'checkbox',
					name: 'checkbox-url',
					choices: [],
					rule: { url: true },
				},
				{ control: 'file', name: 'file-alphanumeric', rule: { alphanumeric: true } },
				{ control: 'confirm', name: 'confirm-integer', rule: { integer: true } },
			],
		}

		expect(auditSchema(invalid)).toHaveLength(9)
		expect(
			auditSchema({
				fields: [
					{ control: 'text', name: 'text', rule: { minimum: 1, pattern: '^a$' } },
					{ control: 'number', name: 'number', rule: { minimum: 0, step: 1, integer: true } },
					{ control: 'date', name: 'date', rule: { minimum: '2026-01-01' } },
				],
			}),
		).toStrictEqual([])
	})

	it('reports bounds on every measureless control', () => {
		expect(
			auditSchema({
				fields: [
					{ control: 'color', name: 'color', rule: { minimum: 1, maximum: 2 } },
					{ control: 'confirm', name: 'confirm', rule: { minimum: 1, maximum: 2 } },
					{
						control: 'select',
						name: 'select',
						choices: [],
						rule: { minimum: 1, maximum: 2 },
					},
				],
			}),
		).toStrictEqual([
			'Field "color" has minimum on color',
			'Field "color" has maximum on color',
			'Field "confirm" has minimum on confirm',
			'Field "confirm" has maximum on confirm',
			'Field "select" has minimum on select',
			'Field "select" has maximum on select',
		])
	})

	it('checks authored pattern validity and the exact length boundary', () => {
		expect(
			auditSchema({
				fields: [
					{ control: 'text', name: 'invalid', rule: { pattern: '[' } },
					{ control: 'text', name: 'long', rule: { pattern: 'a'.repeat(PATTERN_LIMIT + 1) } },
				],
			}),
		).toHaveLength(2)
		expect(
			auditSchema({
				fields: [
					{ control: 'text', name: 'boundary', rule: { pattern: 'a'.repeat(PATTERN_LIMIT) } },
				],
			}),
		).toStrictEqual([])
	})

	it('reports reversed comparable bounds and invalid temporal operands', () => {
		expect(
			auditSchema({
				fields: [
					{ control: 'number', name: 'number', rule: { minimum: 3, maximum: 2 } },
					{
						control: 'date',
						name: 'date-order',
						rule: { minimum: '2026-12-31', maximum: '2026-01-01' },
					},
					{ control: 'date', name: 'date-lexical', rule: { minimum: 'bad' } },
					{ control: 'time', name: 'time-lexical', rule: { maximum: '25:00' } },
					{
						control: 'datetime',
						name: 'datetime-lexical',
						rule: { minimum: '2026-08-15 09:30' },
					},
				],
			}),
		).toHaveLength(5)
		expect(
			auditSchema({
				fields: [
					{ control: 'number', name: 'number', rule: { minimum: 2, maximum: 3 } },
					{
						control: 'datetime',
						name: 'datetime',
						rule: { minimum: '2026-08-15T09:30', maximum: '2026-08-15T10:30' },
					},
				],
			}),
		).toStrictEqual([])
	})

	it('refuses negative maxima only for length and count measurements', () => {
		expect(
			auditSchema({
				fields: [
					{ control: 'text', name: 'text', rule: { maximum: -1 } },
					{ control: 'editor', name: 'editor', rule: { maximum: -1 } },
					{ control: 'password', name: 'password', rule: { maximum: -1 } },
					{ control: 'checkbox', name: 'checkbox', choices: [], rule: { maximum: -1 } },
					{ control: 'file', name: 'file', rule: { maximum: -1 } },
				],
			}),
		).toStrictEqual([
			'Field "text" has a negative maximum on text',
			'Field "editor" has a negative maximum on editor',
			'Field "password" has a negative maximum on password',
			'Field "checkbox" has a negative maximum on checkbox',
			'Field "file" has a negative maximum on file',
		])
		expect(
			auditSchema({
				fields: [
					{ control: 'text', name: 'empty', rule: { maximum: 0 } },
					{ control: 'number', name: 'negative', rule: { maximum: -1 } },
				],
			}),
		).toStrictEqual([])
	})

	it('enforces field, group, and choice cardinality budgets at exact boundaries', () => {
		expect(auditSchema(createFieldBudgetSchema(FIELD_LIMIT))).toStrictEqual([])
		expect(auditSchema(createFieldBudgetSchema(FIELD_LIMIT + 1))).toContain(
			`Schema declares more than ${FIELD_LIMIT} fields`,
		)
		expect(auditSchema(createGroupBudgetSchema(GROUP_LIMIT))).toStrictEqual([])
		expect(auditSchema(createGroupBudgetSchema(GROUP_LIMIT + 1))).toContain(
			`Schema declares more than ${GROUP_LIMIT} groups`,
		)
		expect(auditSchema(createChoiceBudgetSchema(CHOICE_LIMIT))).toStrictEqual([])
		expect(auditSchema(createChoiceBudgetSchema(CHOICE_LIMIT + 1))).toContain(
			`Field "choice" offers more than ${CHOICE_LIMIT} choices`,
		)
	})

	it('enforces every name site at the exact UTF-16 boundary', () => {
		for (const entry of createNameBudgetCases(NAME_LIMIT)) {
			expect({
				label: entry.label,
				faults: auditSchema(entry.schema).filter((fault) => fault.includes('name longer')),
			}).toStrictEqual({ label: entry.label, faults: [] })
		}

		for (const entry of createNameBudgetCases(NAME_LIMIT + 1)) {
			expect({
				label: entry.label,
				faults: auditSchema(entry.schema).filter((fault) => fault.includes('name longer')),
			}).toStrictEqual({
				label: entry.label,
				faults: [`Schema contains a name longer than ${NAME_LIMIT}`],
			})
		}
	})

	it('enforces every retained string site at the exact UTF-16 boundary', () => {
		for (const entry of createStringBudgetCases(STRING_LIMIT)) {
			expect({
				label: entry.label,
				faults: auditSchema(entry.schema).filter((fault) => fault.includes('string longer')),
			}).toStrictEqual({ label: entry.label, faults: [] })
		}

		for (const entry of createStringBudgetCases(STRING_LIMIT + 1)) {
			expect({
				label: entry.label,
				faults: auditSchema(entry.schema).filter((fault) => fault.includes('string longer')),
			}).toStrictEqual({
				label: entry.label,
				faults: [`Schema contains a string longer than ${STRING_LIMIT}`],
			})
		}
	})

	it('enforces total retained text and node budgets at exact boundaries', () => {
		expect(auditSchema(createTextBudgetSchema(TEXT_LIMIT))).toStrictEqual([])
		expect(auditSchema(createTextBudgetSchema(TEXT_LIMIT + 1))).toContain(
			`Schema retains more than ${TEXT_LIMIT} string code units`,
		)
		expect(auditSchema(createNodeBudgetSchema(NODE_LIMIT))).toStrictEqual([])
		expect(auditSchema(createNodeBudgetSchema(NODE_LIMIT + 1))).toContain(
			`Schema retains more than ${NODE_LIMIT} nodes`,
		)
	})

	it('counts metadata keys but not schema-owned keys in the total text budget', () => {
		const fault = `Schema retains more than ${TEXT_LIMIT} string code units`

		expect(auditSchema(createTextPopulationSchema('m'.repeat(64), false))).toStrictEqual([])
		expect(auditSchema(createTextPopulationSchema('m'.repeat(65), false))).toContain(fault)
		expect(auditSchema(createTextPopulationSchema('m'.repeat(64), true))).toStrictEqual([])
	})

	it('counts metadata leaves but not metadata key spelling in the total node budget', () => {
		const fault = `Schema retains more than ${NODE_LIMIT} nodes`

		expect(auditSchema(createNodePopulationSchema('m', false))).toStrictEqual([])
		expect(auditSchema(createNodePopulationSchema('m', true))).toContain(fault)
		expect(auditSchema(createNodePopulationSchema('renamed', false))).toStrictEqual([])
	})
})

describe('control and rule matrix', () => {
	it('matches the literal 12 by 9 applicability specification', () => {
		for (const control of [
			'text',
			'editor',
			'password',
			'number',
			'date',
			'time',
			'datetime',
			'color',
			'confirm',
			'select',
			'checkbox',
			'file',
		] satisfies readonly FieldControl[]) {
			for (const rule of [
				'required',
				'minimum',
				'maximum',
				'step',
				'pattern',
				'email',
				'url',
				'integer',
				'alphanumeric',
			] satisfies readonly FieldRuleName[]) {
				expect({ control, rule, value: appliesRule(control, rule) }).toStrictEqual({
					control,
					rule,
					value: RULE_APPLICABILITY[control][rule],
				})
			}
		}
	})

	it('evaluates all 12 by 9 applicable and inert pairs from one table', () => {
		const pairs: string[] = []

		for (const control of FIELD_CONTROLS) {
			for (const rule of MATRIX_RULES) {
				const applicable = appliesRule(control, rule)
				const [authored, passing, failing] = createMatrixCase(control, rule)
				const field = createMatrixField(control, authored)
				const passingValue = applicable ? passing : MATRIX_VALUES[control]
				const passingRules = evaluateField(field, passingValue, {}).map((error) => error.rule)
				const failingValue = applicable ? failing : MATRIX_VALUES[control]
				const failingRules = evaluateField(field, failingValue, {}).map((error) => error.rule)

				pairs.push(`${control}:${rule}`)
				// `confirm` holds a boolean no numeric operand discriminates; its inert bound cells
				// are covered by the control's own evaluation arm.
				expect({ control, rule, passing: passingRules, failing: failingRules }).toStrictEqual({
					control,
					rule,
					passing: [],
					failing: applicable ? [rule] : [],
				})
			}
		}

		expect(pairs).toHaveLength(FIELD_CONTROLS.length * MATRIX_RULES.length)
		expect(new Set(pairs).size).toBe(FIELD_CONTROLS.length * MATRIX_RULES.length)
	})
})

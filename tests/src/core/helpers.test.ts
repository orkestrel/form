import type { FieldRuleName, FormField, FormSchema, FormValues } from '../../../src/core/types.js'
import {
	computeDefaults,
	evaluateField,
	evaluateForm,
	extractGroups,
	formatMessage,
	matchesField,
	matchesValues,
	serializeForm,
} from '../../../src/core/helpers.js'
import { describe, expect, it } from 'vitest'

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
})

describe('evaluateField', () => {
	it('reports required first for every absent control and runs nothing else', () => {
		const required: readonly FieldRuleName[] = ['required']
		let called = false

		expect(
			evaluateField(
				{
					control: 'text',
					name: 'text',
					rule: { required: true, minimum: 2, custom: () => ((called = true), true) },
				},
				undefined,
				{},
			).map((error) => error.rule),
		).toStrictEqual(required)
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
		expect(called).toBe(false)
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

		expect(serialized).toStrictEqual({
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
		expect(JSON.parse(JSON.stringify(serialized))).toStrictEqual(serialized)
		expect(Object.keys(serialized)).toStrictEqual(['name', 'groups', 'fields'])
		expect(JSON.stringify(serialized).indexOf('"choice"')).toBeLessThan(
			JSON.stringify(serialized).indexOf('"files"'),
		)
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

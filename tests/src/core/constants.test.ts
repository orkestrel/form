import {
	ALPHANUMERIC_PATTERN,
	CHOICE_LIMIT,
	COLOR_PATTERN,
	DATE_PATTERN,
	DATETIME_PATTERN,
	EMAIL_PATTERN,
	FIELD_CONTROLS,
	FIELD_LIMIT,
	FORM_STATUSES,
	GROUP_LIMIT,
	INTEGER_PATTERN,
	LIST_LIMIT,
	NAME_LIMIT,
	NODE_LIMIT,
	PATTERN_LIMIT,
	RULE_MESSAGES,
	STRING_LIMIT,
	TEXT_LIMIT,
	TIME_PATTERN,
	URL_PATTERN,
} from '@src/core'
import { describe, expect, it } from 'vitest'

describe('core constants', () => {
	it('lists every control and status in contract order', () => {
		expect(FIELD_CONTROLS).toStrictEqual([
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
		])
		expect(FORM_STATUSES).toStrictEqual(['editing', 'settled', 'abandoned'])
		expect(Object.isFrozen(FIELD_CONTROLS)).toBe(true)
		expect(Object.isFrozen(FORM_STATUSES)).toBe(true)
	})

	it('provides a frozen message for every named rule', () => {
		expect(Object.keys(RULE_MESSAGES).sort()).toStrictEqual([
			'alphanumeric',
			'email',
			'integer',
			'maximum',
			'minimum',
			'pattern',
			'required',
			'step',
			'url',
		])
		expect(RULE_MESSAGES.minimum).toContain('{limit}')
		expect(RULE_MESSAGES.maximum).toContain('{limit}')
		expect(RULE_MESSAGES.step).toContain('{limit}')
		expect(Object.isFrozen(RULE_MESSAGES)).toBe(true)
	})

	it('matches only the supported scalar formats', () => {
		expect(EMAIL_PATTERN.test('ada@example.com')).toBe(true)
		expect(EMAIL_PATTERN.test('ada@example')).toBe(false)
		expect(URL_PATTERN.test('https://example.com/path')).toBe(true)
		expect(URL_PATTERN.test('example.com')).toBe(false)
		expect(ALPHANUMERIC_PATTERN.test('Ada42')).toBe(true)
		expect(ALPHANUMERIC_PATTERN.test('Ada 42')).toBe(false)
		expect(INTEGER_PATTERN.test('-42')).toBe(true)
		expect(INTEGER_PATTERN.test('4.2')).toBe(false)
		expect(COLOR_PATTERN.test('#aBc123')).toBe(true)
		expect(COLOR_PATTERN.test('#abcd')).toBe(false)
		expect(DATE_PATTERN.test('2026-08-15')).toBe(true)
		expect(DATE_PATTERN.test('2026-13-15')).toBe(false)
		expect(TIME_PATTERN.test('23:59:58')).toBe(true)
		expect(TIME_PATTERN.test('24:00')).toBe(false)
		expect(DATETIME_PATTERN.test('2026-08-15T23:59')).toBe(true)
		expect(DATETIME_PATTERN.test('2026-08-15 23:59')).toBe(false)
		expect(PATTERN_LIMIT).toBe(256)
	})

	it('fixes every cardinality and length budget at an exact whole number', () => {
		expect(FIELD_LIMIT).toBe(512)
		expect(GROUP_LIMIT).toBe(64)
		expect(CHOICE_LIMIT).toBe(1024)
		expect(LIST_LIMIT).toBe(1024)
		expect(NAME_LIMIT).toBe(128)
		expect(STRING_LIMIT).toBe(65536)
		expect(TEXT_LIMIT).toBe(1048576)
		expect(NODE_LIMIT).toBe(16384)

		const budgets = [
			FIELD_LIMIT,
			GROUP_LIMIT,
			CHOICE_LIMIT,
			LIST_LIMIT,
			NAME_LIMIT,
			STRING_LIMIT,
			TEXT_LIMIT,
			NODE_LIMIT,
		]

		expect(budgets.filter((budget) => Number.isSafeInteger(budget) && budget > 0)).toHaveLength(8)
	})
})

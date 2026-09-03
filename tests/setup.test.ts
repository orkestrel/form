import type { JSONValue } from '@orkestrel/contract'
import type { FieldValue, FormSchema } from '@src/core'
import {
	FIELD_CONTROLS,
	RULE_MESSAGES,
	STRING_LIMIT,
	TEXT_LIMIT,
	appliesRule,
	auditSchema,
	evaluateField,
	matchesField,
	serializeForm,
} from '@src/core'
import { isArray, isRecord, isString } from '@orkestrel/contract'
import { describe, expect, it } from 'vitest'
import {
	ANSWER_CASES,
	CHANGED_CASES,
	MATRIX_FIELDS,
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
	createSequenceValidator,
	createStringBudgetCases,
	createTextBudgetSchema,
	createTextPopulationSchema,
	passValidation,
} from './setup.js'

const BOUNDARY_STRING = 'x'.repeat(STRING_LIMIT)
const OVERSIZED_STRING = 'x'.repeat(STRING_LIMIT + 1)

/**
 * Read a field value as the list it holds, or as an empty list when it holds a scalar.
 *
 * @param value - The field value to read.
 * @returns The list entries, or an empty list.
 */
function readList(value: FieldValue): readonly string[] {
	return isArray<string>(value) ? value : []
}

/**
 * Collect every string a serialized schema retains, including record keys.
 *
 * @remarks
 * This walks the JSON projection rather than the typed schema, so it reaches every retained site
 * without repeating the site list the fixture builders write to.
 *
 * @param schema - The schema to project and walk.
 * @returns Every retained string in traversal order.
 */
function collectStrings(schema: FormSchema): readonly string[] {
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

/**
 * Measure the longest string a schema retains.
 *
 * @param schema - The schema to measure.
 * @returns The greatest retained string length, or zero when the schema retains none.
 */
function measureLongest(schema: FormSchema): number {
	return collectStrings(schema).reduce((longest, text) => Math.max(longest, text.length), 0)
}

/**
 * Count the code units a schema's fields retain across their controls, names, and metadata.
 *
 * @remarks
 * This sums the produced strings, where the budget builders derive their sizes by subtracting a
 * reserved overhead from a requested total. The measurement and the budget builders disagree on
 * any arithmetic slip.
 *
 * @param schema - The schema to measure.
 * @returns The retained code-unit total.
 */
function countText(schema: FormSchema): number {
	let total = 0

	for (const field of schema.fields) {
		total += field.control.length + field.name.length
		if (field.meta === undefined) continue

		for (const [key, value] of Object.entries(field.meta)) {
			total += key.length
			if (isString(value)) total += value.length
		}
	}

	return total
}

/**
 * Count the leaves a schema's field metadata holds, where a list contributes its entries.
 *
 * @param schema - The schema to measure.
 * @returns The metadata leaf total.
 */
function countLeaves(schema: FormSchema): number {
	let total = 0

	for (const field of schema.fields) {
		if (field.meta === undefined) continue

		for (const value of Object.values(field.meta)) {
			total += isArray(value) ? value.length : 1
		}
	}

	return total
}

describe('answer and change tables', () => {
	it('marks every falsy answer as answered and every blank string as unanswered', () => {
		const answered = ANSWER_CASES.filter((entry) => entry.answer).map((entry) => entry.value)
		const refused = ANSWER_CASES.filter((entry) => !entry.answer).map((entry) => entry.value)
		const keys = ANSWER_CASES.map((entry) => String(JSON.stringify(entry.value)))

		expect(new Set(keys).size).toBe(ANSWER_CASES.length)
		expect(answered.length).toBeGreaterThan(0)
		expect(refused.length).toBeGreaterThan(0)
		expect(answered).toContainEqual([])
		expect(answered).toContain(false)
		expect(answered).toContain(0)
		expect(refused).toContain('')
		expect(refused).toContain(undefined)
		expect(
			refused.some((value) => isString(value) && value.length > 0 && value.trim().length === 0),
		).toBe(true)
	})

	it('covers every presence and content difference over names both records can carry', () => {
		for (const entry of CHANGED_CASES) {
			const held = new Set([...Object.keys(entry.current), ...Object.keys(entry.opened)])

			expect({
				names: entry.names,
				held: entry.names.filter((name) => !held.has(name)),
				repeated: entry.names.length - new Set(entry.names).size,
			}).toStrictEqual({ names: entry.names, held: [], repeated: 0 })
		}

		expect(CHANGED_CASES.some((entry) => entry.names.length === 0)).toBe(true)
		expect(
			CHANGED_CASES.some((entry) =>
				entry.names.some(
					(name) => Object.hasOwn(entry.current, name) && !Object.hasOwn(entry.opened, name),
				),
			),
		).toBe(true)
		expect(
			CHANGED_CASES.some((entry) =>
				entry.names.some(
					(name) => !Object.hasOwn(entry.current, name) && Object.hasOwn(entry.opened, name),
				),
			),
		).toBe(true)
		expect(
			CHANGED_CASES.some((entry) =>
				entry.names.some((name) => {
					const current = entry.current[name]
					const opened = entry.opened[name]
					return current !== undefined && opened !== undefined && isArray(current)
				}),
			),
		).toBe(true)
	})
})

describe('control fixtures', () => {
	it('leaves length alone to refuse an oversized string on every listed field', () => {
		const open = STRING_FIELDS.filter((field) => field.control === 'select')

		expect(new Set(STRING_FIELDS.map((field) => field.control)).size).toBe(STRING_FIELDS.length)
		expect(open.length).toBeGreaterThan(0)

		for (const field of open) {
			// An empty choice list plus `open` leaves membership unable to refuse, so this row's
			// oversized refusal can only be the string ceiling the consuming sweep names.
			expect({
				choices: field.choices.length,
				accepts: matchesField(field, BOUNDARY_STRING),
			}).toStrictEqual({ choices: 0, accepts: true })
		}

		expect(STRING_FIELDS.some((field) => matchesField(field, BOUNDARY_STRING))).toBe(true)
		expect(STRING_FIELDS.every((field) => !matchesField(field, OVERSIZED_STRING))).toBe(true)
	})

	it('pairs every control with a sound field and a value that control accepts', () => {
		for (const control of FIELD_CONTROLS) {
			const field = MATRIX_FIELDS[control]

			expect({
				control,
				declared: field.control,
				faults: auditSchema({ fields: [field] }),
				accepts: matchesField(field, MATRIX_VALUES[control]),
			}).toStrictEqual({ control, declared: control, faults: [], accepts: true })
		}
	})

	it('sweeps every rule the package declares against a row for every control', () => {
		expect(Object.keys(RULE_MESSAGES).sort()).toStrictEqual([...MATRIX_RULES].sort())
		expect(new Set(MATRIX_RULES).size).toBe(MATRIX_RULES.length)
		expect(Object.keys(RULE_APPLICABILITY).sort()).toStrictEqual([...FIELD_CONTROLS].sort())
	})

	it('carries the authored rule onto its control row and separates the pair it returns', () => {
		for (const control of FIELD_CONTROLS) {
			for (const rule of MATRIX_RULES) {
				const [authored, passing, failing] = createMatrixCase(control, rule)
				const field = createMatrixField(control, authored)

				// The builders own the pair, and `evaluateField` is what says the pair is a pair: the
				// passing value carries no failure and the failing value carries this rule's, wherever
				// the rule applies to the control at all.
				expect({
					control,
					rule,
					field,
					passing: evaluateField(field, passing, {}).map((error) => error.rule),
					failing: evaluateField(field, failing, {}).map((error) => error.rule),
				}).toStrictEqual({
					control,
					rule,
					field: { ...MATRIX_FIELDS[control], rule: authored },
					passing: [],
					failing: appliesRule(control, rule) ? [rule] : [],
				})
			}
		}
	})
})

describe('budget fixtures', () => {
	it('produces exactly the requested cardinality of distinct entries in a sound schema', () => {
		const fields = createFieldBudgetSchema(7)
		const groups = createGroupBudgetSchema(5)
		const offered = createChoiceBudgetSchema(9)
		const choices = offered.fields.flatMap((field) =>
			field.control === 'select' ? field.choices : [],
		)

		expect(fields.fields).toHaveLength(7)
		expect(new Set(fields.fields.map((field) => field.name)).size).toBe(7)
		expect(auditSchema(fields)).toStrictEqual([])

		expect(groups.groups ?? []).toHaveLength(5)
		expect(new Set((groups.groups ?? []).map((group) => group.name)).size).toBe(5)
		expect(auditSchema(groups)).toStrictEqual([])

		expect(choices).toHaveLength(9)
		expect(new Set(choices.map((choice) => choice.value)).size).toBe(9)
		expect(auditSchema(offered)).toStrictEqual([])
	})

	it('places the requested length at one site per case and leaves each schema otherwise sound', () => {
		for (const cases of [createNameBudgetCases(40), createStringBudgetCases(40)]) {
			const shapes = cases.map((entry) => JSON.stringify(serializeForm(entry.schema)))

			expect(new Set(cases.map((entry) => entry.label)).size).toBe(cases.length)
			expect(new Set(shapes).size).toBe(cases.length)

			for (const entry of cases) {
				expect({
					label: entry.label,
					faults: auditSchema(entry.schema),
					longest: measureLongest(entry.schema),
				}).toStrictEqual({ label: entry.label, faults: [], longest: 40 })
			}
		}
	})

	it('retains exactly the requested code units while clamping each string to the ceiling', () => {
		expect(countText(createTextBudgetSchema(40_000))).toBe(40_000)
		expect(countText(createTextBudgetSchema(TEXT_LIMIT))).toBe(TEXT_LIMIT)
		expect(countText(createTextBudgetSchema(TEXT_LIMIT + 1))).toBe(TEXT_LIMIT + 1)
		expect(measureLongest(createTextBudgetSchema(TEXT_LIMIT + 1))).toBeLessThanOrEqual(STRING_LIMIT)
	})

	it('charges a metadata key its spelling and a declared rule nothing', () => {
		const plain = createTextPopulationSchema('m'.repeat(64), false)
		const ruled = createTextPopulationSchema('m'.repeat(64), true)

		expect(countText(plain)).toBe(TEXT_LIMIT)
		expect(countText(createTextPopulationSchema('m'.repeat(65), false))).toBe(TEXT_LIMIT + 1)
		expect(countText(ruled)).toBe(TEXT_LIMIT)
		expect(plain.fields.some((field) => field.rule !== undefined)).toBe(false)
		expect(ruled.fields.some((field) => field.rule !== undefined)).toBe(true)
	})

	it('scales metadata leaves one for one above a reserved overhead and clamps below it', () => {
		expect(countLeaves(createNodeBudgetSchema(10)) - countLeaves(createNodeBudgetSchema(9))).toBe(1)
		expect(countLeaves(createNodeBudgetSchema(65)) - countLeaves(createNodeBudgetSchema(64))).toBe(
			1,
		)
		expect(countLeaves(createNodeBudgetSchema(9))).toBe(0)
		expect(countLeaves(createNodeBudgetSchema(3))).toBe(0)
		expect(
			createNodeBudgetSchema(64).fields.every((field) => field.rule?.custom !== undefined),
		).toBe(true)
	})

	it('adds one leaf for the extra key and none for a longer key spelling', () => {
		const plain = countLeaves(createNodePopulationSchema('m', false))

		expect(countLeaves(createNodePopulationSchema('m', true)) - plain).toBe(1)
		expect(countLeaves(createNodePopulationSchema('renamed', false))).toBe(plain)
	})

	it('selects every offered choice and sizes each entry to the requested length', () => {
		const [field, value] = createCheckboxLimit(5)
		const [sized, sizedValue] = createCheckboxLimit(3, 16)
		const choices = field.control === 'checkbox' ? field.choices : []

		expect(choices).toHaveLength(5)
		expect(new Set(choices.map((choice) => choice.value)).size).toBe(5)
		expect(readList(value)).toStrictEqual(choices.map((choice) => choice.value))
		expect(matchesField(field, value)).toBe(true)

		expect(readList(sizedValue).map((entry) => entry.length)).toStrictEqual([16, 16, 16])
		expect(new Set(readList(sizedValue)).size).toBe(3)
		expect(matchesField(sized, sizedValue)).toBe(true)
	})
})

describe('custom validator fixtures', () => {
	it('answers from a script that clamps to its last entry and restarts per validator', () => {
		const flaky = createSequenceValidator(['Not yet', 'Still not', true])
		const answers = [
			flaky(undefined, {}),
			flaky(undefined, {}),
			flaky(undefined, {}),
			flaky(undefined, {}),
		]
		const fresh = createSequenceValidator(['Not yet', 'Still not', true])

		expect(answers).toStrictEqual(['Not yet', 'Still not', true, true])
		expect(fresh(undefined, {})).toBe('Not yet')
		expect(createSequenceValidator([])(undefined, {})).toBe(true)
		expect(passValidation()).toBe(true)
	})
})

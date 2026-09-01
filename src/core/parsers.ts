import type { FieldValue, FormField, FormSchema, FormValues } from './types.js'
import {
	attempt,
	isArray,
	isRecord,
	isString,
	parseNumber,
	readArrayEntries,
} from '@orkestrel/contract'
import { cloneValue } from './cloners.js'
import { STRING_LIMIT } from './constants.js'
import { auditSchema, defineEntry, freezeEntry, matchesField, serializeForm } from './helpers.js'
import { isFormSchema } from './validators.js'

/**
 * Parse unknown wire data into an owned, semantically sound form schema.
 *
 * @param input - The unknown schema value to parse.
 * @returns An owned schema with custom rules removed, or `undefined` on refusal.
 */
export function parseForm(input: unknown): FormSchema | undefined {
	const outcome = attempt(() => {
		if (!isRecord(input)) return undefined

		const schema: Record<string, unknown> = {}
		for (const key of Reflect.ownKeys(input)) {
			if (!isString(key)) return undefined
			defineEntry(schema, key, input[key])
		}

		const fields = schema.fields
		if (!isArray(fields)) return undefined

		const read = readArrayEntries(fields)
		if (!read.success || !read.value.dense) return undefined

		const copies: unknown[] = []
		for (let index = 0; index < read.value.entries.length; index += 1) {
			const field = read.value.entries[index]
			if (!isRecord(field)) {
				copies.push(field)
				continue
			}

			const copy: Record<string, unknown> = {}
			for (const key of Reflect.ownKeys(field)) {
				if (!isString(key)) return undefined
				defineEntry(copy, key, field[key])
			}

			const rule = copy.rule
			if (isRecord(rule)) {
				const projected: Record<string, unknown> = {}
				for (const key of Reflect.ownKeys(rule)) {
					if (!isString(key)) return undefined
					if (key !== 'custom') {
						defineEntry(projected, key, rule[key])
					}
				}
				copy.rule = projected
			}

			copies.push(copy)
		}

		schema.fields = copies
		if (!isFormSchema(schema) || auditSchema(schema).length !== 0) return undefined

		const parsed = serializeForm(schema)
		return isFormSchema(parsed) && auditSchema(parsed).length === 0 ? parsed : undefined
	})

	return outcome.success ? outcome.value : undefined
}

/**
 * Parse one answer against its field control.
 *
 * @param field - The field that defines the accepted value.
 * @param input - The unknown value to parse.
 * @returns The typed or lexically coerced field value, or `undefined` on refusal.
 */
export function parseValue(field: FormField, input: unknown): FieldValue | undefined {
	const outcome = attempt(() => {
		if (matchesField(field, input)) return cloneValue(input)
		if (field.control === 'number') {
			if (isString(input) && input.length > STRING_LIMIT) return undefined
			const value = parseNumber(input)
			return value !== undefined && matchesField(field, value) ? value : undefined
		}
		if (field.control === 'confirm') {
			if (input === 'true') return true
			if (input === 'false') return false
		}
		return undefined
	})

	return outcome.success ? outcome.value : undefined
}

/**
 * Parse a strict answer record against the fields declared by a schema.
 *
 * @param schema - The schema that owns the accepted field names and controls.
 * @param input - The unknown answer record to parse.
 * @returns An owned answer record, or `undefined` when any key or value is refused.
 */
export function parseValues(schema: FormSchema, input: unknown): FormValues | undefined {
	const outcome = attempt(() => {
		if (!isRecord(input)) return undefined

		const values: Record<string, FieldValue> = {}
		for (const key of Reflect.ownKeys(input)) {
			if (!isString(key) || !Object.hasOwn(input, key)) return undefined

			const field = schema.fields.find((candidate) => candidate.name === key)
			if (field === undefined) return undefined

			const value = parseValue(field, input[key])
			if (value === undefined) return undefined

			freezeEntry(values, key, value)
		}

		return Object.freeze(values)
	})

	return outcome.success ? outcome.value : undefined
}

import type { JSONRecord } from '@orkestrel/contract'
import type { FieldChoice, FieldRule, FieldValue, FormField, FormSchema } from './types.js'
import { cloneJSONRecord, isArray, isContractError } from '@orkestrel/contract'
import { FormError } from './errors.js'

/**
 * Clone one form value into an owned frozen snapshot.
 *
 * @param value - The field value to own.
 * @returns The scalar unchanged, or a frozen copy of the list.
 */
export function cloneValue(value: readonly string[]): readonly string[]
export function cloneValue(value: FieldValue): FieldValue
export function cloneValue(value: FieldValue): FieldValue {
	return isArray(value) ? Object.freeze(value.slice()) : value
}

/**
 * Clone a field's choices into an owned frozen snapshot.
 *
 * @param choices - The choices to own.
 * @returns A frozen list of frozen choice records.
 */
export function cloneChoices(choices: readonly FieldChoice[]): readonly FieldChoice[] {
	return Object.freeze(choices.map((choice) => Object.freeze({ ...choice })))
}

/**
 * Clone one form field into an owned frozen snapshot.
 *
 * @param field - The field to own.
 * @returns A frozen field with every nested collection owned.
 * @throws A {@link FormError} coded `SCHEMA` when accessor-bearing metadata cannot be owned.
 */
export function cloneFormField(field: FormField): FormField {
	const rule: { rule?: Readonly<FieldRule> } =
		field.rule === undefined ? {} : { rule: Object.freeze({ ...field.rule }) }
	let meta: { meta?: JSONRecord } = {}

	if (field.meta !== undefined) {
		try {
			meta = { meta: cloneJSONRecord(field.meta) }
		} catch (error) {
			if (!isContractError(error)) throw error
			throw new FormError('SCHEMA', `Field "${field.name}" has metadata that cannot be owned`, {
				field: field.name,
			})
		}
	}

	switch (field.control) {
		case 'select':
			return Object.freeze({ ...field, ...rule, ...meta, choices: cloneChoices(field.choices) })
		case 'checkbox':
			return Object.freeze({
				...field,
				...rule,
				...meta,
				choices: cloneChoices(field.choices),
				...(field.default === undefined ? {} : { default: cloneValue(field.default) }),
			})
		case 'file':
			return Object.freeze({
				...field,
				...rule,
				...meta,
				...(field.accept === undefined ? {} : { accept: cloneValue(field.accept) }),
			})
		case 'text':
		case 'editor':
		case 'password':
		case 'number':
		case 'date':
		case 'time':
		case 'datetime':
		case 'color':
		case 'confirm':
			return Object.freeze({ ...field, ...rule, ...meta })
	}
}

/**
 * Clone a form schema into an owned frozen snapshot.
 *
 * @param schema - The schema to own.
 * @returns A frozen schema with every nested record and list owned.
 */
export function cloneFormSchema(schema: FormSchema): FormSchema {
	const groups = schema.groups

	return Object.freeze({
		...schema,
		...(groups === undefined
			? {}
			: { groups: Object.freeze(groups.map((group) => Object.freeze({ ...group }))) }),
		fields: Object.freeze(schema.fields.map((field) => cloneFormField(field))),
	})
}

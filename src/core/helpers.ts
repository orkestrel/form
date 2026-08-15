import type { JSONRecord, JSONValue } from '@orkestrel/contract'
import type {
	FieldError,
	FieldRuleName,
	FieldValue,
	FormField,
	FormGroup,
	FormSchema,
	FormValues,
} from './types.js'
import {
	attempt,
	isArray,
	isBoolean,
	isFiniteNumber,
	isInteger,
	isJSONValue,
	isRecord,
	isString,
	parseJSON,
} from '@orkestrel/contract'
import {
	ALPHANUMERIC_PATTERN,
	COLOR_PATTERN,
	DATE_PATTERN,
	DATETIME_PATTERN,
	EMAIL_PATTERN,
	INTEGER_PATTERN,
	PATTERN_LIMIT,
	RULE_MESSAGES,
	TIME_PATTERN,
	URL_PATTERN,
} from './constants.js'

/**
 * Check whether a value has the shape required by one field control.
 *
 * @param field - The field that owns the value.
 * @param value - The unknown value to inspect.
 * @returns Whether the control can hold the value.
 */
export function matchesField(field: FormField, value: unknown): value is FieldValue {
	switch (field.control) {
		case 'text':
		case 'editor':
		case 'password':
			return isString(value)
		case 'number':
			return isFiniteNumber(value)
		case 'date':
			return isString(value) && DATE_PATTERN.test(value)
		case 'time':
			return isString(value) && TIME_PATTERN.test(value)
		case 'datetime':
			return isString(value) && DATETIME_PATTERN.test(value)
		case 'color':
			return isString(value) && COLOR_PATTERN.test(value)
		case 'confirm':
			return isBoolean(value)
		case 'select':
			return (
				isString(value) &&
				(field.open === true || field.choices.some((choice) => choice.value === value))
			)
		case 'checkbox':
			return (
				isArray(value) &&
				value.every(
					(entry) => isString(entry) && field.choices.some((choice) => choice.value === entry),
				) &&
				new Set(value).size === value.length
			)
		case 'file':
			return (
				isArray(value) &&
				value.every((entry) => isString(entry)) &&
				(field.multiple === true || value.length <= 1)
			)
	}
}

/**
 * Evaluate one field rule against its current value.
 *
 * @param field - The field and rule to evaluate.
 * @param value - The current value, or absence.
 * @param values - Every value available to a custom rule.
 * @param messages - Optional rule-specific message replacements.
 * @returns Every failure in rule order.
 */
export function evaluateField(
	field: FormField,
	value: FieldValue | undefined,
	values: FormValues,
	messages?: Readonly<Partial<Record<FieldRuleName, string>>>,
): readonly FieldError[] {
	const errors: FieldError[] = []
	const rule = field.rule

	if (value === undefined) {
		if (rule?.required === true) {
			errors.push({
				field: field.name,
				message: formatMessage('required', undefined, messages),
				rule: 'required',
			})
		}
		return Object.freeze(errors)
	}

	if (rule === undefined) return Object.freeze(errors)

	if (rule.minimum !== undefined) {
		let failed = false

		switch (field.control) {
			case 'text':
			case 'editor':
			case 'password':
				failed = isString(value) && isFiniteNumber(rule.minimum) && value.length < rule.minimum
				break
			case 'number':
				failed = isFiniteNumber(value) && isFiniteNumber(rule.minimum) && value < rule.minimum
				break
			case 'date':
			case 'time':
			case 'datetime':
				failed = isString(value) && isString(rule.minimum) && value < rule.minimum
				break
			case 'checkbox':
			case 'file':
				failed = isArray(value) && isFiniteNumber(rule.minimum) && value.length < rule.minimum
				break
			case 'color':
			case 'confirm':
			case 'select':
				break
		}

		if (failed) {
			errors.push({
				field: field.name,
				message: formatMessage('minimum', rule.minimum, messages),
				rule: 'minimum',
			})
		}
	}

	if (rule.maximum !== undefined) {
		let failed = false

		switch (field.control) {
			case 'text':
			case 'editor':
			case 'password':
				failed = isString(value) && isFiniteNumber(rule.maximum) && value.length > rule.maximum
				break
			case 'number':
				failed = isFiniteNumber(value) && isFiniteNumber(rule.maximum) && value > rule.maximum
				break
			case 'date':
			case 'time':
			case 'datetime':
				failed = isString(value) && isString(rule.maximum) && value > rule.maximum
				break
			case 'checkbox':
			case 'file':
				failed = isArray(value) && isFiniteNumber(rule.maximum) && value.length > rule.maximum
				break
			case 'color':
			case 'confirm':
			case 'select':
				break
		}

		if (failed) {
			errors.push({
				field: field.name,
				message: formatMessage('maximum', rule.maximum, messages),
				rule: 'maximum',
			})
		}
	}

	if (field.control === 'number' && rule.step !== undefined && isFiniteNumber(value)) {
		const base = isFiniteNumber(rule.minimum) ? rule.minimum : 0
		const multiple = (value - base) / rule.step

		if (
			!isFiniteNumber(rule.step) ||
			rule.step === 0 ||
			!isFiniteNumber(multiple) ||
			Math.abs(multiple - Math.round(multiple)) > 1e-9
		) {
			errors.push({
				field: field.name,
				message: formatMessage('step', rule.step, messages),
				rule: 'step',
			})
		}
	}

	if (
		field.control !== 'number' &&
		field.control !== 'confirm' &&
		field.control !== 'checkbox' &&
		field.control !== 'file' &&
		isString(value)
	) {
		if (rule.pattern !== undefined) {
			const pattern = rule.pattern

			if (pattern.length > PATTERN_LIMIT) {
				errors.push({
					field: field.name,
					message: formatMessage('pattern', undefined, messages),
					rule: 'pattern',
				})
			} else {
				const outcome = attempt(() => new RegExp(pattern).test(value))

				if (!outcome.success || !outcome.value) {
					errors.push({
						field: field.name,
						message: formatMessage('pattern', undefined, messages),
						rule: 'pattern',
					})
				}
			}
		}

		if (rule.email === true && !EMAIL_PATTERN.test(value)) {
			errors.push({
				field: field.name,
				message: formatMessage('email', undefined, messages),
				rule: 'email',
			})
		}

		if (rule.url === true && !URL_PATTERN.test(value)) {
			errors.push({
				field: field.name,
				message: formatMessage('url', undefined, messages),
				rule: 'url',
			})
		}

		if (rule.alphanumeric === true && !ALPHANUMERIC_PATTERN.test(value)) {
			errors.push({
				field: field.name,
				message: formatMessage('alphanumeric', undefined, messages),
				rule: 'alphanumeric',
			})
		}

		if (rule.integer === true && !INTEGER_PATTERN.test(value)) {
			errors.push({
				field: field.name,
				message: formatMessage('integer', undefined, messages),
				rule: 'integer',
			})
		}
	}

	if (field.control === 'number' && rule.integer === true && !isInteger(value)) {
		errors.push({
			field: field.name,
			message: formatMessage('integer', undefined, messages),
			rule: 'integer',
		})
	}

	if (rule.custom !== undefined) {
		const result = rule.custom(value, values)

		if (isString(result)) errors.push({ field: field.name, message: result })
	}

	return Object.freeze(errors)
}

/**
 * Evaluate every active field in schema order.
 *
 * @param schema - The form schema to evaluate.
 * @param values - The values keyed by field name.
 * @param messages - Optional rule-specific message replacements.
 * @returns Every field failure in schema and rule order.
 */
export function evaluateForm(
	schema: FormSchema,
	values: FormValues,
	messages?: Readonly<Partial<Record<FieldRuleName, string>>>,
): readonly FieldError[] {
	const errors: FieldError[] = []

	for (const field of schema.fields) {
		if (field.disabled !== true) {
			errors.push(...evaluateField(field, values[field.name], values, messages))
		}
	}

	return Object.freeze(errors)
}

/**
 * Compute the values explicitly seeded by a schema.
 *
 * @param schema - The schema whose defaults to collect.
 * @returns A value record containing only fields with defaults.
 */
export function computeDefaults(schema: FormSchema): FormValues {
	const defaults: Record<string, FieldValue> = {}

	for (const field of schema.fields) {
		switch (field.control) {
			case 'checkbox':
				if (field.default !== undefined) {
					defaults[field.name] = Object.freeze(field.default.slice())
				}
				break
			case 'password':
			case 'file':
				break
			case 'text':
			case 'editor':
			case 'number':
			case 'date':
			case 'time':
			case 'datetime':
			case 'color':
			case 'confirm':
			case 'select':
				if (field.default !== undefined) defaults[field.name] = field.default
				break
		}
	}

	return Object.freeze(defaults)
}

/**
 * Compare two form value records by keys and value content.
 *
 * @param a - The first value record.
 * @param b - The second value record.
 * @returns Whether both records contain the same answers.
 */
export function matchesValues(a: FormValues, b: FormValues): boolean {
	const keys = Object.keys(a)

	if (keys.length !== Object.keys(b).length) return false

	return keys.every((key) => {
		if (!Object.hasOwn(b, key)) return false

		const left = a[key]
		const right = b[key]

		if (isArray(left) || isArray(right)) {
			return (
				isArray(left) &&
				isArray(right) &&
				left.length === right.length &&
				left.every((entry, index) => entry === right[index])
			)
		}

		return left === right
	})
}

/**
 * Resolve and interpolate one rule message.
 *
 * @param rule - The rule whose message to resolve.
 * @param limit - The optional operand substituted for `{limit}`.
 * @param messages - Optional rule-specific message replacements.
 * @returns The resolved failure text.
 */
export function formatMessage(
	rule: FieldRuleName,
	limit?: number | string,
	messages?: Readonly<Partial<Record<FieldRuleName, string>>>,
): string {
	const message = messages?.[rule] ?? RULE_MESSAGES[rule]
	return limit === undefined ? message : message.replaceAll('{limit}', String(limit))
}

/**
 * Project a schema into JSON while removing custom validators and absent values.
 *
 * @param schema - The schema to project.
 * @returns A deep JSON copy of the serializable schema.
 */
export function serializeForm(schema: FormSchema): JSONRecord {
	const output: Record<string, JSONValue> = {}

	if (schema.name !== undefined) output.name = schema.name
	if (schema.label !== undefined) output.label = schema.label
	if (schema.help !== undefined) output.help = schema.help
	if (schema.groups !== undefined) {
		output.groups = schema.groups.map((group): JSONRecord => {
			const entry: Record<string, JSONValue> = { name: group.name, label: group.label }
			if (group.help !== undefined) entry.help = group.help
			return entry
		})
	}

	output.fields = schema.fields.map((field): JSONRecord => {
		const entry: Record<string, JSONValue> = {
			control: field.control,
			name: field.name,
		}

		if (field.label !== undefined) entry.label = field.label
		if (field.help !== undefined) entry.help = field.help
		if (field.group !== undefined) entry.group = field.group
		if (field.hidden !== undefined) entry.hidden = field.hidden
		if (field.disabled !== undefined) entry.disabled = field.disabled
		if (field.locked !== undefined) entry.locked = field.locked

		switch (field.control) {
			case 'text':
			case 'editor':
			case 'number':
				if (field.default !== undefined) entry.default = field.default
				if (field.placeholder !== undefined) entry.placeholder = field.placeholder
				break
			case 'password':
				if (field.mask !== undefined) entry.mask = field.mask
				break
			case 'date':
			case 'time':
			case 'datetime':
			case 'color':
			case 'confirm':
				if (field.default !== undefined) entry.default = field.default
				break
			case 'select':
				entry.choices = field.choices.map((choice): JSONRecord => {
					const option: Record<string, JSONValue> = {
						value: choice.value,
						label: choice.label,
					}
					if (choice.help !== undefined) option.help = choice.help
					if (choice.disabled !== undefined) option.disabled = choice.disabled
					return option
				})
				if (field.default !== undefined) entry.default = field.default
				if (field.open !== undefined) entry.open = field.open
				break
			case 'checkbox':
				entry.choices = field.choices.map((choice): JSONRecord => {
					const option: Record<string, JSONValue> = {
						value: choice.value,
						label: choice.label,
					}
					if (choice.help !== undefined) option.help = choice.help
					if (choice.disabled !== undefined) option.disabled = choice.disabled
					return option
				})
				if (field.default !== undefined) entry.default = field.default.slice()
				break
			case 'file':
				if (field.accept !== undefined) entry.accept = field.accept.slice()
				if (field.multiple !== undefined) entry.multiple = field.multiple
				break
		}

		if (field.rule !== undefined) {
			const rule: Record<string, JSONValue> = {}

			if (field.rule.required !== undefined) rule.required = field.rule.required
			if (field.rule.minimum !== undefined) rule.minimum = field.rule.minimum
			if (field.rule.maximum !== undefined) rule.maximum = field.rule.maximum
			if (field.rule.step !== undefined) rule.step = field.rule.step
			if (field.rule.pattern !== undefined) rule.pattern = field.rule.pattern
			if (field.rule.email !== undefined) rule.email = field.rule.email
			if (field.rule.url !== undefined) rule.url = field.rule.url
			if (field.rule.integer !== undefined) rule.integer = field.rule.integer
			if (field.rule.alphanumeric !== undefined) rule.alphanumeric = field.rule.alphanumeric
			entry.rule = rule
		}

		return entry
	})

	const serialized = JSON.stringify(output)
	const projected = serialized === undefined ? undefined : parseJSON(serialized)

	return isJSONValue(projected) && isRecord(projected) ? projected : {}
}

/**
 * Select referenced groups in first-reference field order.
 *
 * @param schema - The schema whose group references to resolve.
 * @returns The referenced schema groups without duplicates.
 */
export function extractGroups(schema: FormSchema): readonly FormGroup[] {
	const groups: FormGroup[] = []

	if (schema.groups === undefined) return Object.freeze(groups)

	for (const field of schema.fields) {
		if (field.group !== undefined && !groups.some((group) => group.name === field.group)) {
			const group = schema.groups.find((entry) => entry.name === field.group)
			if (group !== undefined) groups.push(group)
		}
	}

	return Object.freeze(groups)
}

/**
 * Audit a structurally valid schema for domain invariants.
 *
 * @param schema - The form schema to audit.
 * @returns Human-readable invariant violations, or an empty list when the schema is sound.
 */
export function auditSchema(schema: FormSchema): readonly string[] {
	const faults: string[] = []
	const fields = new Set<string>()
	const groups = new Set<string>()

	if (schema.groups !== undefined) {
		for (const group of schema.groups) {
			if (groups.has(group.name)) faults.push(`Group "${group.name}" is declared more than once`)
			groups.add(group.name)
		}
	}

	for (const field of schema.fields) {
		if (field.name.length === 0) faults.push('Field "" has an empty name')
		if (fields.has(field.name)) faults.push(`Field "${field.name}" is declared more than once`)
		fields.add(field.name)

		if (field.group !== undefined && !groups.has(field.group)) {
			faults.push(`Field "${field.name}" references missing group "${field.group}"`)
		}

		switch (field.control) {
			case 'password':
			case 'file':
				break
			case 'text':
			case 'editor':
			case 'number':
			case 'date':
			case 'time':
			case 'datetime':
			case 'color':
			case 'confirm':
			case 'select':
			case 'checkbox':
				if (field.default !== undefined && !matchesField(field, field.default)) {
					faults.push(`Field "${field.name}" has an invalid default`)
				}
				break
		}

		const rule = field.rule
		if (rule === undefined) continue

		const temporal =
			field.control === 'date' || field.control === 'time' || field.control === 'datetime'

		if (isString(rule.minimum) && !temporal) {
			faults.push(`Field "${field.name}" has a string minimum on ${field.control}`)
		}
		if (isString(rule.maximum) && !temporal) {
			faults.push(`Field "${field.name}" has a string maximum on ${field.control}`)
		}
		if (isFiniteNumber(rule.minimum) && temporal) {
			faults.push(`Field "${field.name}" has a numeric minimum on ${field.control}`)
		}
		if (isFiniteNumber(rule.maximum) && temporal) {
			faults.push(`Field "${field.name}" has a numeric maximum on ${field.control}`)
		}

		if (rule.step !== undefined && field.control !== 'number') {
			faults.push(`Field "${field.name}" has step on ${field.control}`)
		}
		if (rule.step !== undefined && rule.step <= 0) {
			faults.push(`Field "${field.name}" has a non-positive step`)
		}

		const stringless =
			field.control === 'number' ||
			field.control === 'confirm' ||
			field.control === 'checkbox' ||
			field.control === 'file'

		if (rule.pattern !== undefined && stringless) {
			faults.push(`Field "${field.name}" has pattern on ${field.control}`)
		}
		if (rule.email === true && stringless) {
			faults.push(`Field "${field.name}" has email on ${field.control}`)
		}
		if (rule.url === true && stringless) {
			faults.push(`Field "${field.name}" has url on ${field.control}`)
		}
		if (rule.alphanumeric === true && stringless) {
			faults.push(`Field "${field.name}" has alphanumeric on ${field.control}`)
		}
		if (
			rule.integer === true &&
			(field.control === 'confirm' || field.control === 'checkbox' || field.control === 'file')
		) {
			faults.push(`Field "${field.name}" has integer on ${field.control}`)
		}

		if (rule.pattern !== undefined) {
			if (rule.pattern.length > PATTERN_LIMIT) {
				faults.push(`Field "${field.name}" has a pattern longer than ${PATTERN_LIMIT}`)
			} else {
				try {
					RegExp(rule.pattern)
				} catch {
					faults.push(`Field "${field.name}" has an invalid pattern`)
				}
			}
		}

		if (
			(isFiniteNumber(rule.minimum) &&
				isFiniteNumber(rule.maximum) &&
				rule.minimum > rule.maximum) ||
			(isString(rule.minimum) && isString(rule.maximum) && rule.minimum > rule.maximum)
		) {
			faults.push(`Field "${field.name}" has minimum greater than maximum`)
		}

		if (field.control === 'date') {
			if (isString(rule.minimum) && !DATE_PATTERN.test(rule.minimum)) {
				faults.push(`Field "${field.name}" has an invalid date minimum`)
			}
			if (isString(rule.maximum) && !DATE_PATTERN.test(rule.maximum)) {
				faults.push(`Field "${field.name}" has an invalid date maximum`)
			}
		}

		if (field.control === 'time') {
			if (isString(rule.minimum) && !TIME_PATTERN.test(rule.minimum)) {
				faults.push(`Field "${field.name}" has an invalid time minimum`)
			}
			if (isString(rule.maximum) && !TIME_PATTERN.test(rule.maximum)) {
				faults.push(`Field "${field.name}" has an invalid time maximum`)
			}
		}

		if (field.control === 'datetime') {
			if (isString(rule.minimum) && !DATETIME_PATTERN.test(rule.minimum)) {
				faults.push(`Field "${field.name}" has an invalid datetime minimum`)
			}
			if (isString(rule.maximum) && !DATETIME_PATTERN.test(rule.maximum)) {
				faults.push(`Field "${field.name}" has an invalid datetime maximum`)
			}
		}
	}

	return Object.freeze(faults)
}

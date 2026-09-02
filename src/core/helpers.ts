import type { JSONRecord, JSONValue } from '@orkestrel/contract'
import type {
	EvaluationOptions,
	FieldError,
	FieldControl,
	FieldRuleName,
	FieldValue,
	FormField,
	FormGroup,
	FormSchema,
	FormValues,
} from './types.js'
import {
	attempt,
	cloneJSONRecord,
	isArray,
	isBoolean,
	isFiniteNumber,
	isInteger,
	isContractError,
	isRecord,
	isString,
	readArrayEntries,
} from '@orkestrel/contract'
import { cloneValue } from './cloners.js'
import {
	ALPHANUMERIC_PATTERN,
	CHOICE_LIMIT,
	COLOR_PATTERN,
	DATE_PATTERN,
	DATETIME_PATTERN,
	EMAIL_PATTERN,
	FIELD_CONTROLS,
	FIELD_LIMIT,
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
} from './constants.js'
import { FormError } from './errors.js'

/**
 * Writes one own enumerable data property onto a record.
 *
 * @param target - The record to write into.
 * @param name - The property name to write.
 * @param value - The value to store.
 *
 * @remarks
 * Plain assignment runs an inherited setter, so writing a `__proto__` key that way reaches
 * `Object.prototype` and leaves the record without the entry. Defining the property writes the
 * record itself, whatever the prototype chain declares. The entry stays writable and configurable.
 *
 * @example
 * ```ts
 * const values: Record<string, number> = {}
 * defineEntry(values, '__proto__', 1)
 * Object.hasOwn(values, '__proto__') // true
 * ```
 */
export function defineEntry<T>(target: Record<string, T>, name: string, value: T): void {
	Object.defineProperty(target, name, {
		value,
		enumerable: true,
		configurable: true,
		writable: true,
	})
}

/**
 * Writes one own enumerable data property that cannot be rewritten or removed.
 *
 * @param target - The record to write into.
 * @param name - The property name to write.
 * @param value - The value to store.
 *
 * @remarks
 * The prototype-safe write of {@link defineEntry}, frozen: the entry is neither writable nor
 * configurable, so the record a parser hands back cannot be edited through the key it just filled.
 *
 * @example
 * ```ts
 * const values: Record<string, number> = {}
 * freezeEntry(values, '__proto__', 1)
 * Object.getOwnPropertyDescriptor(values, '__proto__')?.writable // false
 * ```
 */
export function freezeEntry<T>(target: Record<string, T>, name: string, value: T): void {
	Object.defineProperty(target, name, {
		value,
		enumerable: true,
		configurable: false,
		writable: false,
	})
}

/**
 * Checks whether a value has the shape required by one field control.
 *
 * @param field - The field that owns the value.
 * @param value - The unknown value to inspect.
 * @returns True if the control can hold the value; false otherwise.
 */
export function matchesField(field: FormField, value: unknown): value is FieldValue {
	if (isString(value) && value.length > STRING_LIMIT) return false

	let entries: readonly unknown[] | undefined
	if (isArray(value)) {
		const length = attempt(() => value.length)
		if (!length.success || length.value > LIST_LIMIT) return false

		const read = readArrayEntries(value)
		if (!read.success || !read.value.dense) return false

		entries = read.value.entries
		if (entries.some((entry) => !isString(entry) || entry.length > STRING_LIMIT)) return false
	}

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
				!field.choices.some((choice) => choice.value === value && choice.disabled === true) &&
				(field.open === true ||
					field.choices.some((choice) => choice.value === value && choice.disabled !== true))
			)
		case 'checkbox':
			return (
				entries !== undefined &&
				entries.every(
					(entry) =>
						isString(entry) &&
						field.choices.some((choice) => choice.value === entry && choice.disabled !== true),
				) &&
				new Set(entries).size === entries.length
			)
		case 'file':
			return entries !== undefined && (field.multiple === true || entries.length <= 1)
	}
}

/**
 * Decides whether a raw binding value projects to an answered field.
 *
 * @remarks
 * Bind with `fill(name, matchesAnswer(raw) ? raw : undefined)`. This projection treats an absent
 * value and a string containing only whitespace as unanswered. Every other field value is an
 * answer, including an empty list, `false`, and zero. Core evaluation does not use this projection:
 * its `required` rule remains presence-only.
 *
 * @param value - The raw field value, or absence.
 * @returns True if the binding preserves the value as an answer; false otherwise.
 */
export function matchesAnswer(value: FieldValue | undefined): boolean {
	return value !== undefined && (!isString(value) || value.trim().length > 0)
}

/**
 * Checks whether a named rule applies to one field control.
 *
 * @remarks
 * The runtime control-membership check keeps this boundary total for JavaScript callers that
 * bypass the declared {@link FieldControl} contract.
 *
 * @param control - The field control to inspect.
 * @param rule - The named rule to inspect.
 * @returns True if the control evaluates that rule; false otherwise.
 */
export function appliesRule(control: FieldControl, rule: FieldRuleName): boolean {
	if (!FIELD_CONTROLS.some((candidate) => candidate === control)) return false

	switch (rule) {
		case 'required':
			return true
		case 'minimum':
		case 'maximum':
			return control !== 'color' && control !== 'confirm' && control !== 'select'
		case 'step':
			return control === 'number'
		case 'pattern':
		case 'email':
		case 'url':
		case 'alphanumeric':
			return (
				control !== 'number' &&
				control !== 'confirm' &&
				control !== 'checkbox' &&
				control !== 'file'
			)
		case 'integer':
			return control !== 'confirm' && control !== 'checkbox' && control !== 'file'
	}

	return false
}

/**
 * Evaluates one field rule against its current value.
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
		if (rule?.required === true && appliesRule(field.control, 'required')) {
			errors.push(createFieldError(field, 'required', undefined, messages))
		}
	}

	if (rule === undefined) return Object.freeze(errors)

	if (rule.minimum !== undefined && appliesRule(field.control, 'minimum')) {
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
			errors.push(createFieldError(field, 'minimum', rule.minimum, messages))
		}
	}

	if (rule.maximum !== undefined && appliesRule(field.control, 'maximum')) {
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
			errors.push(createFieldError(field, 'maximum', rule.maximum, messages))
		}
	}

	if (rule.step !== undefined && appliesRule(field.control, 'step') && isFiniteNumber(value)) {
		const base = isFiniteNumber(rule.minimum) ? rule.minimum : 0
		const multiple = (value - base) / rule.step

		if (
			!isFiniteNumber(rule.step) ||
			rule.step === 0 ||
			!isFiniteNumber(multiple) ||
			Math.abs(multiple - Math.round(multiple)) > 1e-9
		) {
			errors.push(createFieldError(field, 'step', rule.step, messages))
		}
	}

	if (isString(value)) {
		if (rule.pattern !== undefined && appliesRule(field.control, 'pattern')) {
			const pattern = rule.pattern

			if (pattern.length > PATTERN_LIMIT) {
				errors.push(createFieldError(field, 'pattern', undefined, messages))
			} else {
				const outcome = attempt(() => new RegExp(pattern).test(value))

				if (!outcome.success || !outcome.value) {
					errors.push(createFieldError(field, 'pattern', undefined, messages))
				}
			}
		}

		if (rule.email === true && appliesRule(field.control, 'email') && !EMAIL_PATTERN.test(value)) {
			errors.push(createFieldError(field, 'email', undefined, messages))
		}

		if (rule.url === true && appliesRule(field.control, 'url') && !URL_PATTERN.test(value)) {
			errors.push(createFieldError(field, 'url', undefined, messages))
		}

		if (
			rule.alphanumeric === true &&
			appliesRule(field.control, 'alphanumeric') &&
			!ALPHANUMERIC_PATTERN.test(value)
		) {
			errors.push(createFieldError(field, 'alphanumeric', undefined, messages))
		}

		if (
			rule.integer === true &&
			appliesRule(field.control, 'integer') &&
			!INTEGER_PATTERN.test(value)
		) {
			errors.push(createFieldError(field, 'integer', undefined, messages))
		}
	}

	if (
		value !== undefined &&
		field.control === 'number' &&
		rule.integer === true &&
		appliesRule(field.control, 'integer') &&
		!isInteger(value)
	) {
		errors.push(createFieldError(field, 'integer', undefined, messages))
	}

	if (rule.custom !== undefined) {
		const result = rule.custom(value, values)

		if (isString(result)) errors.push(Object.freeze({ field: field.name, message: result }))
	}

	return Object.freeze(errors)
}

/**
 * Evaluates every active field in schema order.
 *
 * @param schema - The form schema to evaluate.
 * @param values - The values keyed by field name.
 * @param options - Optional message replacements and the effective disabled field set.
 * @returns Every field failure in schema and rule order.
 */
export function evaluateForm(
	schema: FormSchema,
	values: FormValues,
	options?: EvaluationOptions,
): readonly FieldError[] {
	const errors: FieldError[] = []

	for (const field of schema.fields) {
		const active =
			options?.disabled === undefined ? field.disabled !== true : !options.disabled.has(field.name)

		if (active) {
			const value = Object.hasOwn(values, field.name) ? values[field.name] : undefined
			errors.push(...evaluateField(field, value, values, options?.messages))
		}
	}

	return Object.freeze(errors)
}

/**
 * Computes the values explicitly seeded by a schema.
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
					defineEntry(defaults, field.name, cloneValue(field.default))
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
				if (field.default !== undefined) {
					defineEntry(defaults, field.name, field.default)
				}
				break
		}
	}

	return Object.freeze(defaults)
}

/**
 * Compares two field values by scalar identity or ordered list content.
 *
 * @param a - The first field value.
 * @param b - The second field value.
 * @returns True if both values contain the same answer; false otherwise.
 */
export function matchesValue(a: FieldValue, b: FieldValue): boolean {
	if (isArray(a) || isArray(b)) {
		return (
			isArray(a) &&
			isArray(b) &&
			a.length === b.length &&
			a.every((entry, index) => entry === b[index])
		)
	}

	return a === b
}

/**
 * Extracts the names whose answers differ between two form value records.
 *
 * @remarks
 * Presence is compared in both directions before present values are compared through
 * {@link matchesValue}. The returned set is a new snapshot, exposed as readonly because later
 * changes to either input never alter its membership.
 *
 * @param current - The values held now.
 * @param opened - The values held when the form opened.
 * @returns A readonly snapshot of changed field names.
 */
export function extractChanges(current: FormValues, opened: FormValues): ReadonlySet<string> {
	const names = new Set([...Object.keys(current), ...Object.keys(opened)])
	const changed = new Set<string>()

	for (const name of names) {
		const hasCurrent = Object.hasOwn(current, name)
		const hasOpened = Object.hasOwn(opened, name)

		if (hasCurrent !== hasOpened) {
			changed.add(name)
			continue
		}

		const now = current[name]
		const before = opened[name]
		if (now === undefined || before === undefined || !matchesValue(now, before)) changed.add(name)
	}

	return changed
}

/**
 * Compares two form value records by keys and value content.
 *
 * @param a - The first value record.
 * @param b - The second value record.
 * @returns True if both records contain the same answers; false otherwise.
 */
export function matchesValues(a: FormValues, b: FormValues): boolean {
	return extractChanges(a, b).size === 0
}

/**
 * Resolves and interpolates one rule message.
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
 * Creates one named-rule failure against a field.
 *
 * @param field - The field the rule failed on.
 * @param rule - The named rule that failed.
 * @param limit - The rule's operand, substituted for `{limit}`, or absence when it carries none.
 * @param messages - Optional rule-specific message replacements.
 * @returns A frozen {@link FieldError} carrying the field's name, the resolved text, and the rule.
 *
 * @remarks
 * A `custom` validator and the form's `invalidate` method both report a message of their own
 * under no rule name, so neither builds its failure here.
 *
 * @example
 * ```ts
 * const field: FormField = { control: 'text', name: 'nickname', rule: { minimum: 3 } }
 * const error = createFieldError(field, 'minimum', 3)
 * error.message // 'Must be at least 3'
 * ```
 */
export function createFieldError(
	field: FormField,
	rule: FieldRuleName,
	limit: number | string | undefined,
	messages?: Readonly<Partial<Record<FieldRuleName, string>>>,
): FieldError {
	return Object.freeze({ field: field.name, message: formatMessage(rule, limit, messages), rule })
}

/**
 * Projects a schema into JSON while removing custom validators and absent values.
 *
 * @param schema - The schema to project.
 * @returns A deep JSON copy of the serializable schema.
 * @throws A {@link FormError} coded `SCHEMA` when accessor-bearing metadata cannot be owned. A
 *   non-contract throw while reading metadata escapes unchanged.
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
		const meta = field.meta
		if (meta !== undefined) {
			try {
				entry.meta = cloneJSONRecord(meta)
			} catch (error) {
				if (!isContractError(error)) throw error
				throw new FormError('SCHEMA', `Field "${field.name}" has metadata that cannot be owned`, {
					field: field.name,
				})
			}
		}

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
				if (field.default !== undefined) entry.default = field.default
				break
			case 'file':
				if (field.accept !== undefined) entry.accept = field.accept
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
			if (Object.keys(rule).length > 0) entry.rule = rule
		}

		return entry
	})

	return cloneJSONRecord(output)
}

/**
 * Selects referenced groups in first-reference field order.
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
 * Audits a structurally valid schema for domain invariants.
 *
 * @param schema - The form schema to audit.
 * @returns Human-readable invariant violations, or an empty list when the schema is sound.
 */
export function auditSchema(schema: FormSchema): readonly string[] {
	const faults: string[] = []
	const fields = new Set<string>()
	const groups = new Set<string>()
	let choiceExceeded: string | undefined
	let nameExceeded = schema.name !== undefined && schema.name.length > NAME_LIMIT

	if (schema.fields.length > FIELD_LIMIT) {
		faults.push(`Schema declares more than ${FIELD_LIMIT} fields`)
	}
	if (schema.groups !== undefined && schema.groups.length > GROUP_LIMIT) {
		faults.push(`Schema declares more than ${GROUP_LIMIT} groups`)
	}

	if (schema.groups !== undefined) {
		const count = Math.min(schema.groups.length, GROUP_LIMIT + 1)
		for (let index = 0; index < count; index += 1) {
			const group = schema.groups[index]
			if (group !== undefined && group.name.length > NAME_LIMIT) nameExceeded = true
		}
	}

	const fieldCount = Math.min(schema.fields.length, FIELD_LIMIT + 1)
	for (let index = 0; index < fieldCount; index += 1) {
		const field = schema.fields[index]
		if (field === undefined) continue

		if (
			field.name.length > NAME_LIMIT ||
			(field.group !== undefined && field.group.length > NAME_LIMIT)
		) {
			nameExceeded = true
		}
		if (
			choiceExceeded === undefined &&
			(field.control === 'select' || field.control === 'checkbox') &&
			field.choices.length > CHOICE_LIMIT
		) {
			choiceExceeded = field.name
		}
	}

	if (choiceExceeded !== undefined) {
		faults.push(`Field "${choiceExceeded}" offers more than ${CHOICE_LIMIT} choices`)
	}
	if (nameExceeded) faults.push(`Schema contains a name longer than ${NAME_LIMIT}`)

	const pending: unknown[] = [schema]
	const metadata: boolean[] = [false]
	let position = 0
	let stringExceeded = false
	let textExceeded = false
	let nodeExceeded = false
	let text = 0

	while (position < pending.length) {
		const node = pending[position]
		const inMeta = metadata[position] === true
		position += 1

		if (isString(node)) {
			if (node.length > STRING_LIMIT) stringExceeded = true
			text = Math.min(TEXT_LIMIT + 1, text + node.length)
			if (text > TEXT_LIMIT) textExceeded = true
			continue
		}

		if (isArray(node)) {
			const length = attempt(() => node.length)
			if (!length.success || length.value > NODE_LIMIT - pending.length) {
				nodeExceeded = true
				continue
			}

			const read = readArrayEntries(node)
			if (!read.success || !read.value.dense) continue

			for (let index = 0; index < read.value.entries.length; index += 1) {
				const entry = read.value.entries[index]
				if (entry !== undefined) {
					pending.push(entry)
					metadata.push(inMeta)
				}
			}
			continue
		}

		if (!isRecord(node)) continue

		const keys = attempt(() => Object.keys(node))
		if (!keys.success) continue

		for (const key of keys.value) {
			if (inMeta) {
				if (key.length > STRING_LIMIT) stringExceeded = true
				text = Math.min(TEXT_LIMIT + 1, text + key.length)
				if (text > TEXT_LIMIT) textExceeded = true
			}

			const value = attempt(() => node[key])
			if (!value.success || value.value === undefined) continue
			if (pending.length >= NODE_LIMIT) {
				nodeExceeded = true
				continue
			}

			pending.push(value.value)
			metadata.push(inMeta || key === 'meta')
		}
	}

	if (stringExceeded) faults.push(`Schema contains a string longer than ${STRING_LIMIT}`)
	if (textExceeded) faults.push(`Schema retains more than ${TEXT_LIMIT} string code units`)
	if (nodeExceeded) faults.push(`Schema retains more than ${NODE_LIMIT} nodes`)

	if (schema.groups !== undefined) {
		const count = Math.min(schema.groups.length, GROUP_LIMIT + 1)
		for (let index = 0; index < count; index += 1) {
			const group = schema.groups[index]
			if (group === undefined) continue
			if (groups.has(group.name)) faults.push(`Group "${group.name}" is declared more than once`)
			groups.add(group.name)
		}
	}

	for (let fieldIndex = 0; fieldIndex < fieldCount; fieldIndex += 1) {
		const field = schema.fields[fieldIndex]
		if (field === undefined) continue
		if (field.name.length === 0) faults.push('Field "" has an empty name')
		if (field.name === '__proto__') faults.push('Field "__proto__" has a refused name')
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

		if (field.control === 'select' || field.control === 'checkbox') {
			const choices = new Set<string>()
			const count = Math.min(field.choices.length, CHOICE_LIMIT + 1)
			let enabled = 0

			for (let index = 0; index < count; index += 1) {
				const choice = field.choices[index]
				if (choice === undefined) continue
				if (choice.disabled !== true) enabled += 1
				if (choices.has(choice.value)) {
					faults.push(`Field "${field.name}" offers choice "${choice.value}" more than once`)
				}
				choices.add(choice.value)
			}

			if (
				field.control === 'select' &&
				field.rule?.required === true &&
				field.open !== true &&
				enabled === 0
			) {
				faults.push(`Field "${field.name}" is required but offers no enabled choice`)
			}

			const minimum = field.rule?.minimum
			if (
				field.control === 'checkbox' &&
				isFiniteNumber(minimum) &&
				minimum > 0 &&
				minimum > enabled
			) {
				faults.push(
					`Field "${field.name}" has minimum ${minimum} but offers only ${enabled} enabled ${enabled === 1 ? 'choice' : 'choices'}`,
				)
			}
		}

		const rule = field.rule
		if (rule === undefined) continue

		const temporal =
			field.control === 'date' || field.control === 'time' || field.control === 'datetime'
		if (rule.minimum !== undefined && !appliesRule(field.control, 'minimum')) {
			faults.push(`Field "${field.name}" has minimum on ${field.control}`)
		} else if (isString(rule.minimum) && !temporal) {
			faults.push(`Field "${field.name}" has a string minimum on ${field.control}`)
		}
		if (rule.maximum !== undefined && !appliesRule(field.control, 'maximum')) {
			faults.push(`Field "${field.name}" has maximum on ${field.control}`)
		} else if (isString(rule.maximum) && !temporal) {
			faults.push(`Field "${field.name}" has a string maximum on ${field.control}`)
		}
		if (isFiniteNumber(rule.minimum) && temporal) {
			faults.push(`Field "${field.name}" has a numeric minimum on ${field.control}`)
		}
		if (isFiniteNumber(rule.maximum) && temporal) {
			faults.push(`Field "${field.name}" has a numeric maximum on ${field.control}`)
		}
		if (
			isFiniteNumber(rule.maximum) &&
			rule.maximum < 0 &&
			(field.control === 'text' ||
				field.control === 'editor' ||
				field.control === 'password' ||
				field.control === 'checkbox' ||
				field.control === 'file')
		) {
			faults.push(`Field "${field.name}" has a negative maximum on ${field.control}`)
		}

		if (rule.step !== undefined && !appliesRule(field.control, 'step')) {
			faults.push(`Field "${field.name}" has step on ${field.control}`)
		}
		if (rule.step !== undefined && rule.step <= 0) {
			faults.push(`Field "${field.name}" has a non-positive step`)
		}

		if (rule.pattern !== undefined && !appliesRule(field.control, 'pattern')) {
			faults.push(`Field "${field.name}" has pattern on ${field.control}`)
		}
		if (rule.email === true && !appliesRule(field.control, 'email')) {
			faults.push(`Field "${field.name}" has email on ${field.control}`)
		}
		if (rule.url === true && !appliesRule(field.control, 'url')) {
			faults.push(`Field "${field.name}" has url on ${field.control}`)
		}
		if (rule.alphanumeric === true && !appliesRule(field.control, 'alphanumeric')) {
			faults.push(`Field "${field.name}" has alphanumeric on ${field.control}`)
		}
		if (rule.integer === true && !appliesRule(field.control, 'integer')) {
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

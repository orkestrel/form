import type {
	FieldChoice,
	FieldControl,
	FieldError,
	FieldRule,
	FieldValue,
	FormField,
	FormGroup,
	FormSchema,
	FormStatus,
	FormValues,
} from './types.js'
import {
	arrayOf,
	attempt,
	isBoolean,
	isBoundedJSONRecord,
	isFiniteNumber,
	isFunction,
	isRecord,
	isString,
	literalOf,
	recordOf,
	unionOf,
} from '@orkestrel/contract'
import { FIELD_CONTROLS, FORM_STATUSES } from './constants.js'

/**
 * Determine whether an unknown value is a declared field control.
 *
 * @param input - The value to inspect.
 * @returns Whether the value is a field control.
 */
export function isFieldControl(input: unknown): input is FieldControl {
	return FIELD_CONTROLS.some((control) => control === input)
}

/**
 * Determine whether an unknown value is a form lifecycle status.
 *
 * @param input - The value to inspect.
 * @returns Whether the value is a form status.
 */
export function isFormStatus(input: unknown): input is FormStatus {
	return FORM_STATUSES.some((status) => status === input)
}

/**
 * Determine whether an unknown value has a form field value shape.
 *
 * @param input - The value to inspect.
 * @returns Whether the value is a field value.
 */
export function isFieldValue(input: unknown): input is FieldValue {
	return unionOf(isString, isFiniteNumber, isBoolean, arrayOf(isString))(input)
}

/**
 * Determine whether an unknown value is one exact field choice record.
 *
 * @param input - The value to inspect.
 * @returns Whether the value is a field choice.
 */
export function isFieldChoice(input: unknown): input is FieldChoice {
	const keys = attempt(
		() => isRecord(input) && Reflect.ownKeys(input).every((key) => isString(key)),
	)
	if (!keys.success || !keys.value) return false

	return recordOf({ value: isString, label: isString, help: isString, disabled: isBoolean }, [
		'help',
		'disabled',
	])(input)
}

/**
 * Determine whether an unknown value is one exact field rule record.
 *
 * @param input - The value to inspect.
 * @returns Whether the value is a structurally valid field rule.
 */
export function isFieldRule(input: unknown): input is FieldRule {
	const keys = attempt(
		() => isRecord(input) && Reflect.ownKeys(input).every((key) => isString(key)),
	)
	if (!keys.success || !keys.value) return false

	return recordOf(
		{
			required: isBoolean,
			minimum: unionOf(isFiniteNumber, isString),
			maximum: unionOf(isFiniteNumber, isString),
			step: isFiniteNumber,
			pattern: isString,
			email: isBoolean,
			url: isBoolean,
			integer: isBoolean,
			alphanumeric: isBoolean,
			custom: isFunction,
		},
		true,
	)(input)
}

/**
 * Determine whether an unknown value is one exact discriminated form field.
 *
 * @remarks
 * Metadata is admitted structurally as bounded JSON. An accessor-bearing metadata record is
 * refused later when {@link cloneFormField} takes ownership, because ownership accepts enumerable
 * data properties only.
 *
 * @param input - The value to inspect.
 * @returns Whether the value is a structurally valid form field.
 */
export function isFormField(input: unknown): input is FormField {
	const outcome = attempt(() => {
		if (!isRecord(input) || !Object.hasOwn(input, 'control') || !Object.hasOwn(input, 'name')) {
			return false
		}

		const control = input.control
		if (!isFieldControl(control)) return false

		const keys = Reflect.ownKeys(input)
		const exact = keys.every((key) => {
			if (!isString(key)) return false

			switch (control) {
				case 'text':
				case 'editor':
					return [
						'control',
						'name',
						'label',
						'help',
						'group',
						'hidden',
						'disabled',
						'locked',
						'rule',
						'meta',
						'default',
						'placeholder',
					].includes(key)
				case 'password':
					return [
						'control',
						'name',
						'label',
						'help',
						'group',
						'hidden',
						'disabled',
						'locked',
						'rule',
						'meta',
						'mask',
					].includes(key)
				case 'number':
					return [
						'control',
						'name',
						'label',
						'help',
						'group',
						'hidden',
						'disabled',
						'locked',
						'rule',
						'meta',
						'default',
						'placeholder',
					].includes(key)
				case 'date':
				case 'time':
				case 'datetime':
				case 'color':
				case 'confirm':
					return [
						'control',
						'name',
						'label',
						'help',
						'group',
						'hidden',
						'disabled',
						'locked',
						'rule',
						'meta',
						'default',
					].includes(key)
				case 'select':
					return [
						'control',
						'name',
						'label',
						'help',
						'group',
						'hidden',
						'disabled',
						'locked',
						'rule',
						'meta',
						'choices',
						'default',
						'open',
					].includes(key)
				case 'checkbox':
					return [
						'control',
						'name',
						'label',
						'help',
						'group',
						'hidden',
						'disabled',
						'locked',
						'rule',
						'meta',
						'choices',
						'default',
					].includes(key)
				case 'file':
					return [
						'control',
						'name',
						'label',
						'help',
						'group',
						'hidden',
						'disabled',
						'locked',
						'rule',
						'meta',
						'accept',
						'multiple',
					].includes(key)
			}
		})

		if (!exact) return false

		const name = input.name
		const hasLabel = Object.hasOwn(input, 'label')
		const label = hasLabel ? input.label : undefined
		const hasHelp = Object.hasOwn(input, 'help')
		const help = hasHelp ? input.help : undefined
		const hasGroup = Object.hasOwn(input, 'group')
		const group = hasGroup ? input.group : undefined
		const hasHidden = Object.hasOwn(input, 'hidden')
		const hidden = hasHidden ? input.hidden : undefined
		const hasDisabled = Object.hasOwn(input, 'disabled')
		const disabled = hasDisabled ? input.disabled : undefined
		const hasLocked = Object.hasOwn(input, 'locked')
		const locked = hasLocked ? input.locked : undefined
		const hasRule = Object.hasOwn(input, 'rule')
		const rule = hasRule ? input.rule : undefined
		const hasMeta = Object.hasOwn(input, 'meta')
		const meta = hasMeta ? input.meta : undefined

		if (
			!isString(name) ||
			(hasLabel && !isString(label)) ||
			(hasHelp && !isString(help)) ||
			(hasGroup && !isString(group)) ||
			(hasHidden && !isBoolean(hidden)) ||
			(hasDisabled && !isBoolean(disabled)) ||
			(hasLocked && !isBoolean(locked)) ||
			(hasRule && !isFieldRule(rule)) ||
			(hasMeta && !isBoundedJSONRecord(meta))
		) {
			return false
		}

		switch (control) {
			case 'text':
			case 'editor': {
				const hasDefault = Object.hasOwn(input, 'default')
				const fallback = hasDefault ? input.default : undefined
				const hasPlaceholder = Object.hasOwn(input, 'placeholder')
				const placeholder = hasPlaceholder ? input.placeholder : undefined
				return (!hasDefault || isString(fallback)) && (!hasPlaceholder || isString(placeholder))
			}
			case 'password': {
				const hasMask = Object.hasOwn(input, 'mask')
				const mask = hasMask ? input.mask : undefined
				return !hasMask || isString(mask)
			}
			case 'number': {
				const hasDefault = Object.hasOwn(input, 'default')
				const fallback = hasDefault ? input.default : undefined
				const hasPlaceholder = Object.hasOwn(input, 'placeholder')
				const placeholder = hasPlaceholder ? input.placeholder : undefined
				return (
					(!hasDefault || isFiniteNumber(fallback)) && (!hasPlaceholder || isString(placeholder))
				)
			}
			case 'date':
			case 'time':
			case 'datetime':
			case 'color': {
				const hasDefault = Object.hasOwn(input, 'default')
				const fallback = hasDefault ? input.default : undefined
				return !hasDefault || isString(fallback)
			}
			case 'confirm': {
				const hasDefault = Object.hasOwn(input, 'default')
				const fallback = hasDefault ? input.default : undefined
				return !hasDefault || isBoolean(fallback)
			}
			case 'select': {
				if (!Object.hasOwn(input, 'choices')) return false
				const choices = input.choices
				const hasDefault = Object.hasOwn(input, 'default')
				const fallback = hasDefault ? input.default : undefined
				const hasOpen = Object.hasOwn(input, 'open')
				const open = hasOpen ? input.open : undefined
				return (
					arrayOf(isFieldChoice)(choices) &&
					(!hasDefault || isString(fallback)) &&
					(!hasOpen || isBoolean(open))
				)
			}
			case 'checkbox': {
				if (!Object.hasOwn(input, 'choices')) return false
				const choices = input.choices
				const hasDefault = Object.hasOwn(input, 'default')
				const fallback = hasDefault ? input.default : undefined
				return arrayOf(isFieldChoice)(choices) && (!hasDefault || arrayOf(isString)(fallback))
			}
			case 'file': {
				const hasAccept = Object.hasOwn(input, 'accept')
				const accept = hasAccept ? input.accept : undefined
				const hasMultiple = Object.hasOwn(input, 'multiple')
				const multiple = hasMultiple ? input.multiple : undefined
				return (!hasAccept || arrayOf(isString)(accept)) && (!hasMultiple || isBoolean(multiple))
			}
		}
	})

	return outcome.success && outcome.value
}

/**
 * Determine whether an unknown value is one exact form group record.
 *
 * @param input - The value to inspect.
 * @returns Whether the value is a form group.
 */
export function isFormGroup(input: unknown): input is FormGroup {
	const keys = attempt(
		() => isRecord(input) && Reflect.ownKeys(input).every((key) => isString(key)),
	)
	if (!keys.success || !keys.value) return false

	return recordOf({ name: isString, label: isString, help: isString }, ['help'])(input)
}

/**
 * Determine whether an unknown value is one exact structural form schema.
 *
 * @param input - The value to inspect.
 * @returns Whether the value is a structurally valid form schema.
 */
export function isFormSchema(input: unknown): input is FormSchema {
	const keys = attempt(
		() => isRecord(input) && Reflect.ownKeys(input).every((key) => isString(key)),
	)
	if (!keys.success || !keys.value) return false

	return recordOf(
		{
			name: isString,
			label: isString,
			help: isString,
			groups: arrayOf(isFormGroup),
			fields: arrayOf(isFormField),
		},
		['name', 'label', 'help', 'groups'],
	)(input)
}

/**
 * Determine whether an unknown value is a record of field values.
 *
 * @param input - The value to inspect.
 * @returns Whether the value is a form values record.
 */
export function isFormValues(input: unknown): input is FormValues {
	const outcome = attempt(() => {
		if (!isRecord(input)) return false
		return Reflect.ownKeys(input).every(
			(key) => isString(key) && Object.hasOwn(input, key) && isFieldValue(input[key]),
		)
	})

	return outcome.success && outcome.value
}

/**
 * Determine whether an unknown value is one exact field error record.
 *
 * @param input - The value to inspect.
 * @returns Whether the value is a field error.
 */
export function isFieldError(input: unknown): input is FieldError {
	const keys = attempt(
		() => isRecord(input) && Reflect.ownKeys(input).every((key) => isString(key)),
	)
	if (!keys.success || !keys.value) return false

	return recordOf(
		{
			field: isString,
			message: isString,
			rule: literalOf(
				'required',
				'minimum',
				'maximum',
				'step',
				'pattern',
				'email',
				'url',
				'integer',
				'alphanumeric',
			),
		},
		['rule'],
	)(input)
}

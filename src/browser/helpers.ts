import type { FieldValue, FormField } from '../core/types.js'
import type { FormControl } from './types.js'
import { matchesAnswer, matchesField } from '../core/helpers.js'
import { FormBindingError } from './errors.js'

/**
 * Checks a native control population against a field's declared value shape.
 * @param field - The declared field.
 * @param controls - Associated controls sharing its name.
 * @returns True if the population has an unambiguous compatible shape; false otherwise.
 * @example
 * ```ts
 * matchesFormControls({ control: 'text', name: 'name' }, [document.createElement('input')]) // true
 * ```
 */
export function matchesFormControls(field: FormField, controls: readonly FormControl[]): boolean {
	if (controls.length === 0) return true
	if (controls.length > 1 && field.control !== 'checkbox' && field.control !== 'select')
		return false
	return controls.every((control) => {
		if (control instanceof HTMLTextAreaElement)
			return field.control === 'editor' && controls.length === 1
		if (control instanceof HTMLSelectElement) {
			return (
				controls.length === 1 &&
				(control.multiple ? field.control === 'checkbox' : field.control === 'select')
			)
		}
		switch (field.control) {
			case 'text':
				return ['text', 'search', 'email', 'url', 'tel', 'hidden'].includes(control.type)
			case 'password':
				return control.type === 'password'
			case 'number':
				return control.type === 'number' || control.type === 'range'
			case 'datetime':
				return control.type === 'datetime-local'
			case 'confirm':
				return control.type === 'checkbox'
			case 'checkbox':
				return (
					control.type === 'checkbox' &&
					controls.every((entry) => entry instanceof HTMLInputElement)
				)
			case 'select':
				return (
					control.type === 'radio' &&
					controls.every((entry) => entry instanceof HTMLInputElement && entry.type === 'radio')
				)
			case 'editor':
				return false
			default:
				return control.type === field.control
		}
	})
}

/**
 * Reads one compatible native population using the document's blank-to-absence semantics.
 * @param field - The field declaring the answer shape.
 * @param controls - Controls sharing the field's name, in native order.
 * @returns The native answer, or undefined for an absent answer or empty population.
 * @throws Thrown when the population or answer is incompatible, including numeric bad input.
 * @example
 * ```ts
 * const input = document.createElement('input')
 * input.value = 'Ada'
 * readFormControls({ control: 'text', name: 'name' }, [input]) // 'Ada'
 * ```
 */
export function readFormControls(
	field: FormField,
	controls: readonly FormControl[],
): FieldValue | undefined {
	if (!matchesFormControls(field, controls)) {
		throw new FormBindingError('CONTROL', `Incompatible controls for "${field.name}"`, {
			field: field.name,
		})
	}
	const first = controls[0]
	if (first === undefined) return undefined
	let value: FieldValue | undefined
	if (field.control === 'checkbox') {
		value =
			first instanceof HTMLSelectElement
				? Array.from(first.selectedOptions, (option) => option.value)
				: controls
						.filter((control) => control instanceof HTMLInputElement && control.checked)
						.map((control) => control.value)
	} else if (field.control === 'select' && first instanceof HTMLInputElement) {
		value = controls.find(
			(control) => control instanceof HTMLInputElement && control.checked,
		)?.value
	} else if (field.control === 'confirm' && first instanceof HTMLInputElement) {
		value = first.checked
	} else if (field.control === 'number' && first instanceof HTMLInputElement) {
		if (first.validity.badInput)
			throw new FormBindingError('CONTROL', 'Enter a number', { field: field.name })
		value = first.value === '' ? undefined : first.valueAsNumber
	} else if (field.control === 'file' && first instanceof HTMLInputElement) {
		value = Array.from(first.files ?? [], (file) => file.name)
	} else {
		value = first.value
	}
	if (!matchesAnswer(value)) return undefined
	if (value !== undefined && !matchesField(field, value)) {
		throw new FormBindingError('CONTROL', `Incompatible native answer for "${field.name}"`, {
			field: field.name,
		})
	}
	return value
}

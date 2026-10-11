import type { FormControl } from './types.js'
import { isInstance } from '@orkestrel/contract'

/**
 * Checks whether a value is a native answer control.
 * @param value - The value to inspect.
 * @returns True if the value is an input, select, or textarea; false otherwise.
 * @example
 * ```ts
 * isFormControl(document.createElement('input')) // true
 * ```
 */
export function isFormControl(value: unknown): value is FormControl {
	return (
		(typeof HTMLInputElement !== 'undefined' && isInstance(value, HTMLInputElement)) ||
		(typeof HTMLSelectElement !== 'undefined' && isInstance(value, HTMLSelectElement)) ||
		(typeof HTMLTextAreaElement !== 'undefined' && isInstance(value, HTMLTextAreaElement))
	)
}

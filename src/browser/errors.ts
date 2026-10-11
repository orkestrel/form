import type { FormBindingErrorCode } from './types.js'
import { isInstance } from '@orkestrel/contract'

/** Reports an incompatible control, overlapping submission, or native DOM failure. */
export class FormBindingError extends Error {
	readonly code: FormBindingErrorCode
	readonly context: Readonly<Record<string, unknown>> | undefined

	/**
	 * Creates a native binding refusal.
	 * @param code - The refusal category.
	 * @param message - The explanation.
	 * @param context - The associated field or cause.
	 */
	constructor(
		code: FormBindingErrorCode,
		message: string,
		context?: Readonly<Record<string, unknown>>,
	) {
		super(message)
		this.name = 'FormBindingError'
		this.code = code
		this.context = context === undefined ? undefined : Object.freeze({ ...context })
	}
}

/**
 * Checks whether a value is a native binding refusal.
 * @param value - The value to inspect.
 * @returns True if the value is a native binding refusal; false otherwise.
 * @example
 * ```ts
 * isFormBindingError(new FormBindingError('CONTROL', 'Duplicate text controls')) // true
 * ```
 */
export function isFormBindingError(value: unknown): value is FormBindingError {
	return isInstance(value, FormBindingError)
}

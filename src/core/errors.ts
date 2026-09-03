import type { JSONRecord } from '@orkestrel/contract'
import type { FormErrorCode } from './types.js'

/**
 * Represents an error raised by the form domain.
 *
 * @example
 * ```ts
 * const error = new FormError('FIELD', 'The schema declares no field named "nickname"', {
 * 	field: 'nickname',
 * })
 *
 * error.code // 'FIELD'
 * error.context // { field: 'nickname' }
 * ```
 */
export class FormError extends Error {
	/** Holds the machine-readable reason for this failure. */
	readonly code: FormErrorCode

	/** Holds structured values that locate or explain this failure. */
	readonly context?: JSONRecord

	/**
	 * Creates a form error.
	 *
	 * @param code - The machine-readable reason.
	 * @param message - The human-readable failure text.
	 * @param context - Optional structured failure details.
	 */
	constructor(code: FormErrorCode, message: string, context?: JSONRecord) {
		super(message)
		this.name = 'FormError'
		this.code = code
		if (context !== undefined) this.context = context
	}
}

/**
 * Determines whether an unknown value is a form error.
 *
 * @param input - The value to inspect.
 * @returns True if the value is a {@link FormError} instance; false otherwise.
 */
export function isFormError(input: unknown): input is FormError {
	return input instanceof FormError
}

import type { FormErrorCode, FormErrorContext } from './types.js'

/** An error raised by the form domain. */
export class FormError extends Error {
	/** The machine-readable reason for this failure. */
	readonly code: FormErrorCode

	/** Structured values that locate or explain this failure. */
	readonly context?: FormErrorContext

	/**
	 * Create a form error.
	 *
	 * @param code - The machine-readable reason.
	 * @param message - The human-readable failure text.
	 * @param context - Optional structured failure details.
	 */
	constructor(code: FormErrorCode, message: string, context?: FormErrorContext) {
		super(message)
		this.name = 'FormError'
		this.code = code
		if (context !== undefined) this.context = context
	}
}

/**
 * Determine whether an unknown value is a form error.
 *
 * @param input - The value to inspect.
 * @returns Whether the value is a {@link FormError} instance.
 */
export function isFormError(input: unknown): input is FormError {
	return input instanceof FormError
}

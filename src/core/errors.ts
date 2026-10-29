import type { JSONRecord } from '@orkestrel/contract'
import { holds, INTRINSICS, isInstance, isString, isRecord, isJSONValue } from '@orkestrel/contract'
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
		Object.defineProperty(this, Symbol.for('@orkestrel/form.FormError'), { value: this })
		this.name = 'FormError'
		this.code = code
		if (context !== undefined) this.context = context
	}
}

/**
 * Determines whether an unknown value is a form error.
 *
 * @remarks
 * Accepts self-branded errors across package copies and subclasses without checking their name.
 * Refuses unbranded look-alikes, plain objects, and transparent proxies.
 *
 * @param input - The value to inspect.
 * @returns True if the value is a {@link FormError} instance; false otherwise.
 */
export function isFormError(input: unknown): input is FormError {
	return holds(() => {
		if (!isInstance(input, Error) || INTRINSICS.prototype(input) === Error.prototype) return false
		if (INTRINSICS.describe(input, Symbol.for('@orkestrel/form.FormError'))?.value !== input)
			return false
		const code: unknown = INTRINSICS.reflect.read(input, 'code')
		const context: unknown = INTRINSICS.reflect.read(input, 'context')
		return (
			isString(code) &&
			['SCHEMA', 'FIELD', 'CONTROL', 'SETTLED', 'ABANDONED', 'PENDING'].includes(code) &&
			isString(INTRINSICS.reflect.read(input, 'message')) &&
			(context === undefined || (isRecord(context) && isJSONValue(context)))
		)
	})
}

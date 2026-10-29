import type { FormBindingErrorCode } from './types.js'
import { holds, INTRINSICS, isFunction, isInstance, isObject, isString } from '@orkestrel/contract'

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
		Object.defineProperty(this, Symbol.for('@orkestrel/form.FormBindingError'), { value: this })
		this.name = 'FormBindingError'
		this.code = code
		this.context = context === undefined ? undefined : Object.freeze({ ...context })
	}
}

/**
 * Checks whether a value is a native binding refusal.
 * @remarks
 * Accepts self-branded errors across package copies and subclasses without checking their name.
 * Refuses unbranded look-alikes, plain objects, and transparent proxies.
 * @param value - The value to inspect.
 * @returns True if the value is a native binding refusal; false otherwise.
 * @example
 * ```ts
 * isFormBindingError(new FormBindingError('CONTROL', 'Duplicate text controls')) // true
 * ```
 */
export function isFormBindingError(value: unknown): value is FormBindingError {
	return holds(() => {
		if (!isInstance(value, Error) || INTRINSICS.prototype(value) === Error.prototype) return false
		if (INTRINSICS.describe(value, Symbol.for('@orkestrel/form.FormBindingError'))?.value !== value)
			return false
		const code: unknown = INTRINSICS.reflect.read(value, 'code')
		const context: unknown = INTRINSICS.reflect.read(value, 'context')
		return (
			isString(code) &&
			['CONTROL', 'PENDING', 'DOM'].includes(code) &&
			isString(INTRINSICS.reflect.read(value, 'message')) &&
			(context === undefined || isObject(context) || isFunction(context))
		)
	})
}

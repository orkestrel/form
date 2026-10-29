import type { JSONRecord } from '@orkestrel/contract'
import type { FormErrorCode } from './types.js'
import {
	holds,
	INTRINSICS,
	isInstance,
	isString,
	isRecord,
	GUARD_DEPTH_LIMIT,
} from '@orkestrel/contract'

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
		if (
			!isString(code) ||
			!['SCHEMA', 'FIELD', 'CONTROL', 'SETTLED', 'ABANDONED', 'PENDING'].includes(code) ||
			!isString(INTRINSICS.reflect.read(input, 'message'))
		)
			return false
		if (context === undefined) return true
		if (!isRecord(context)) return false
		const pending: Array<{ readonly value: unknown; readonly ancestors: readonly object[] }> = [
			{ value: context, ancestors: [] },
		]
		for (const { value, ancestors } of pending) {
			if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) continue
			if (!Array.isArray(value) && !isRecord(value)) return false
			if (ancestors.length >= GUARD_DEPTH_LIMIT || ancestors.includes(value)) return false
			const path = [...ancestors, value]
			const children = Array.isArray(value)
				? Array.from({ length: value.length }, (_, index): unknown => value[index])
				: Object.values(value)
			for (const child of children) pending.push({ value: child, ancestors: path })
		}
		return true
	})
}

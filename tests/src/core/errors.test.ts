import type { JSONRecord } from '@orkestrel/contract'
import { FormError, isFormError } from '@src/core'
import { describe, expect, it } from 'vitest'

describe('FormError', () => {
	it('accepts a NaN context admitted by JSONRecord', () => {
		// Base: e013983:src/core/errors.ts:47.
		expect(isFormError(new FormError('FIELD', 'failure', { measurement: Number.NaN }))).toBe(true)
	})

	it('accepts infinite context values admitted by JSONRecord', () => {
		// Base: e013983:src/core/errors.ts:47.
		expect(
			isFormError(new FormError('FIELD', 'failure', { measurements: [Infinity, -Infinity] })),
		).toBe(true)
	})

	it('refuses cyclic deep unreadable and non-record contexts', () => {
		const cycle: Record<string, unknown> = {}
		cycle.self = cycle
		const deep = Array.from({ length: 513 }).reduce<unknown>((value) => ({ value }), null)
		for (const context of [cycle, deep, new Date(), { value: undefined }]) {
			const error = new FormError('FIELD', 'failure')
			Object.defineProperty(error, 'context', { value: context })
			expect(isFormError(error)).toBe(false)
		}
		const error = new FormError('FIELD', 'failure')
		Object.defineProperty(error, 'context', {
			get() {
				throw new Error('unreadable')
			},
		})
		expect(isFormError(error)).toBe(false)
	})

	it('retains its code, message, context, and stable name', () => {
		const context: JSONRecord = { field: 'missing' }
		const error = new FormError('FIELD', 'The field does not exist', context)

		expect(error).toBeInstanceOf(Error)
		expect(error.name).toBe('FormError')
		expect(error.message).toBe('The field does not exist')
		expect(error.code).toBe('FIELD')
		expect(error.context).toStrictEqual({ field: 'missing' })
		expect(isFormError(error)).toBe(true)
	})

	it('leaves context absent when none is supplied', () => {
		const error = new FormError('SCHEMA', 'Invalid schema')

		expect(error.context).toBeUndefined()
	})

	it('rejects values that are not FormError instances', () => {
		expect(isFormError(new Error('plain'))).toBe(false)
		expect(isFormError(null)).toBe(false)
		expect(isFormError({ name: 'FormError', code: 'FIELD' })).toBe(false)
	})
})

import { FormError, isFormError } from '../../../src/core/errors.js'
import { describe, expect, it } from 'vitest'

describe('FormError', () => {
	it('retains its code, message, context, and stable name', () => {
		const error = new FormError('FIELD', 'The field does not exist', { field: 'missing' })

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

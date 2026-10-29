import { FormBindingError, isFormBindingError } from '@src/browser'
import { describe, expect, it } from 'vitest'

describe('isFormBindingError', () => {
	it('accepts a class-instance context', () => {
		class Context {
			readonly [key: string]: unknown
			readonly offset = 8
		}

		const context: Readonly<Record<string, unknown>> = new Context()
		const error = new FormBindingError('CONTROL', 'invalid control', context)
		Object.defineProperty(error, 'context', { value: context })
		expect(error.context).toBe(context)
		expect(isFormBindingError(error)).toBe(true)
	})

	it('accepts a callable context', () => {
		const members: Readonly<Record<string, unknown>> = { offset: 8 }
		const context = Object.assign(() => undefined, members)
		const error = new FormBindingError('CONTROL', 'invalid control', context)
		Object.defineProperty(error, 'context', { value: context })
		expect(error.context).toBe(context)
		expect(isFormBindingError(error)).toBe(true)
	})
})

import { describe, expect, it } from 'vitest'
import { createNativeFormFixture, editNativeAnswer, readNativeInput } from './setupBrowser.js'

describe('native form fixtures', () => {
	it('builds attached native controls, edits them, and releases its resources', () => {
		const fixture = createNativeFormFixture(
			{ fields: [{ name: 'name', control: 'text' }] },
			'<form><input name="name"></form>',
		)
		try {
			expect(fixture.host.isConnected).toBe(true)
			editNativeAnswer(fixture.host, 'name', 'Ada')
			expect(readNativeInput(fixture.host, 'name').value).toBe('Ada')
			expect(() => readNativeInput(fixture.host, 'missing')).toThrow('Missing input')
			expect(() => editNativeAnswer(fixture.host, 'missing', '')).toThrow('Missing control')
		} finally {
			fixture.destroy()
		}
		expect(fixture.host.isConnected).toBe(false)
		expect(fixture.binding.destroyed).toBe(true)
	})

	it('refuses missing forms and cleans failed construction', () => {
		expect(() => createNativeFormFixture({ fields: [] }, '<span></span>')).toThrow(
			'requires a form',
		)
		expect(() =>
			createNativeFormFixture(
				{ fields: [{ name: 'name', control: 'text' }] },
				'<form><input name="name"><input name="name"></form>',
			),
		).toThrow('Incompatible controls')
	})
})

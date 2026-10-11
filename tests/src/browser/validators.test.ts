import { FormBindingError, isFormBindingError, isFormControl } from '@src/browser'
import { createHostileValues } from '@orkestrel/test'
import { expect, it } from 'vitest'

it('narrows real controls and refuses unrelated or hostile values without throwing', () => {
	expect(isFormControl(document.createElement('input'))).toBe(true)
	expect(isFormControl(document.createElement('textarea'))).toBe(true)
	expect(isFormControl(document.createElement('select'))).toBe(true)
	expect(isFormControl(document.createElement('button'))).toBe(false)
	expect(isFormBindingError(new FormBindingError('DOM', 'Unavailable', { field: 'name' }))).toBe(
		true,
	)
	for (const value of [...createHostileValues(), undefined, null, 1, 'input', {}]) {
		expect(isFormControl(value)).toBe(false)
		expect(isFormBindingError(value)).toBe(false)
	}
})

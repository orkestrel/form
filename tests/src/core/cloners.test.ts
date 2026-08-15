import type { FieldChoice, FormField, FormSchema } from '@src/core'
import { cloneChoices, cloneFormField, cloneFormSchema, cloneValue } from '@src/core'
import { describe, expect, it } from 'vitest'

describe('form cloners', () => {
	it('owns list values while preserving scalar values', () => {
		const list = ['one']
		const clone = cloneValue(list)

		list.push('two')

		expect(clone).toStrictEqual(['one'])
		expect(clone).not.toBe(list)
		expect(Object.isFrozen(clone)).toBe(true)
		expect(cloneValue('answer')).toBe('answer')
	})

	it('owns and freezes choices', () => {
		const choices: FieldChoice[] = [{ value: 'one', label: 'One' }]
		const clone = cloneChoices(choices)

		choices[0] = { value: 'two', label: 'Two' }

		expect(clone).toStrictEqual([{ value: 'one', label: 'One' }])
		expect(Object.isFrozen(clone)).toBe(true)
		expect(Object.isFrozen(clone[0])).toBe(true)
	})

	it('owns every nested field collection', () => {
		const choices: FieldChoice[] = [{ value: 'one', label: 'One' }]
		const selected = ['one']
		const field: FormField = {
			control: 'checkbox',
			name: 'choices',
			choices,
			default: selected,
			rule: { required: true },
		}
		const clone = cloneFormField(field)

		choices.push({ value: 'two', label: 'Two' })
		selected.push('two')

		expect(clone).toStrictEqual({
			control: 'checkbox',
			name: 'choices',
			choices: [{ value: 'one', label: 'One' }],
			default: ['one'],
			rule: { required: true },
		})
		expect(Object.isFrozen(clone)).toBe(true)
		expect(Object.isFrozen(clone.rule)).toBe(true)
	})

	it('owns every nested schema record and list', () => {
		const groups = [{ name: 'group', label: 'Group' }]
		const fields: FormField[] = [{ control: 'text', name: 'name' }]
		const schema: FormSchema = {
			groups,
			fields,
		}
		const clone = cloneFormSchema(schema)

		groups[0] = { name: 'changed', label: 'Changed' }
		fields.push({ control: 'text', name: 'late' })

		expect(clone.groups).toStrictEqual([{ name: 'group', label: 'Group' }])
		expect(Object.isFrozen(clone)).toBe(true)
		expect(Object.isFrozen(clone.groups)).toBe(true)
		expect(Object.isFrozen(clone.fields)).toBe(true)
	})
})

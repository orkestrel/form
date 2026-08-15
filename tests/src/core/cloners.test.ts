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
		const meta = { renderer: { tone: 'quiet' }, tags: ['primary'] }
		const field: FormField = {
			control: 'checkbox',
			name: 'choices',
			choices,
			default: selected,
			rule: { required: true },
			meta,
		}
		const clone = cloneFormField(field)

		choices.push({ value: 'two', label: 'Two' })
		selected.push('two')
		meta.renderer.tone = 'loud'
		meta.tags.push('changed')

		expect(clone).toEqual({
			control: 'checkbox',
			name: 'choices',
			choices: [{ value: 'one', label: 'One' }],
			default: ['one'],
			rule: { required: true },
			meta: { renderer: { tone: 'quiet' }, tags: ['primary'] },
		})
		expect(Object.isFrozen(clone)).toBe(true)
		expect(Object.isFrozen(clone.rule)).toBe(true)
		if (clone.meta === undefined) throw new Error('Expected cloned metadata')
		expect(clone.meta).not.toBe(meta)
		expect(Object.getPrototypeOf(clone.meta)).toBeNull()
		expect(Object.getPrototypeOf(clone.meta.renderer)).toBeNull()
		expect(Object.isFrozen(clone.meta)).toBe(true)
		expect(Object.isFrozen(clone.meta.renderer)).toBe(true)
		expect(Object.isFrozen(clone.meta.tags)).toBe(true)
	})

	it('owns metadata for every field branch', () => {
		const meta = { renderer: 'terminal' }
		const fields: readonly FormField[] = [
			{ control: 'text', name: 'text', meta },
			{ control: 'editor', name: 'editor', meta },
			{ control: 'password', name: 'password', meta },
			{ control: 'number', name: 'number', meta },
			{ control: 'date', name: 'date', meta },
			{ control: 'time', name: 'time', meta },
			{ control: 'datetime', name: 'datetime', meta },
			{ control: 'color', name: 'color', meta },
			{ control: 'confirm', name: 'confirm', meta },
			{ control: 'select', name: 'select', choices: [], meta },
			{ control: 'checkbox', name: 'checkbox', choices: [], meta },
			{ control: 'file', name: 'file', meta },
		]

		for (const field of fields) {
			const clone = cloneFormField(field)
			if (clone.meta === undefined) throw new Error('Expected cloned metadata')
			expect(clone.meta).toEqual({ renderer: 'terminal' })
			expect(clone.meta).not.toBe(meta)
		}
	})

	it('owns every nested schema record and list', () => {
		const groups = [{ name: 'group', label: 'Group' }]
		const meta = { nested: { label: 'Original' } }
		const fields: FormField[] = [{ control: 'text', name: 'name', meta }]
		const schema: FormSchema = {
			groups,
			fields,
		}
		const clone = cloneFormSchema(schema)

		groups[0] = { name: 'changed', label: 'Changed' }
		fields.push({ control: 'text', name: 'late' })
		meta.nested.label = 'Changed'

		expect(clone.groups).toStrictEqual([{ name: 'group', label: 'Group' }])
		expect(Object.isFrozen(clone)).toBe(true)
		expect(Object.isFrozen(clone.groups)).toBe(true)
		expect(Object.isFrozen(clone.fields)).toBe(true)
		expect(clone.fields[0]?.meta).toEqual({ nested: { label: 'Original' } })
	})
})

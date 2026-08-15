import type { FormSchema } from '@src/core'
import { createForm, Form, isFormError } from '@src/core'
import { attempt } from '@orkestrel/contract'
import { createRecorder } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'

const SCHEMA: FormSchema = {
	label: 'Sign up',
	fields: [
		{ control: 'text', name: 'email', label: 'Email', rule: { required: true, email: true } },
		{ control: 'confirm', name: 'terms', label: 'I accept the terms', rule: { required: true } },
	],
}

describe('createForm', () => {
	it('opens a form over the schema it is given', () => {
		const form = createForm(SCHEMA)

		expect(form).toBeInstanceOf(Form)
		expect(form.status).toBe('editing')
		expect(form.schema.label).toBe('Sign up')
		expect(form.field('email')?.label).toBe('Email')
		expect(form.errors.map((error) => error.field)).toStrictEqual(['email', 'terms'])
	})

	it('drives a whole answer through the interface it returns', async () => {
		const submits = createRecorder<readonly [Record<string, unknown>]>()
		const form = createForm(SCHEMA, { on: { submit: submits.handler } })

		form.fill({ email: 'ada@example.com', terms: true })

		const result = form.submit()
		const value = result.success ? result.value : undefined

		expect(value).toStrictEqual({ email: 'ada@example.com', terms: true })
		expect(submits.calls).toStrictEqual([[{ email: 'ada@example.com', terms: true }]])
		expect(form.status).toBe('settled')
		await expect(form.answer).resolves.toBe(value)
	})

	it('takes the same construction path, so it refuses the same schema', () => {
		const outcome = attempt(() =>
			createForm({
				fields: [
					{ control: 'text', name: 'email' },
					{ control: 'text', name: 'email' },
				],
			}),
		)
		const thrown = outcome.success ? undefined : outcome.error

		expect(isFormError(thrown) ? thrown.code : undefined).toBe('SCHEMA')
	})

	it('seeds the answers the options carry', () => {
		const form = createForm(SCHEMA, { values: { email: 'ada@example.com' } })

		expect(form.values).toStrictEqual({ email: 'ada@example.com' })
		expect(form.dirty).toBe(false)
		expect(form.errors.map((error) => error.field)).toStrictEqual(['terms'])
	})
})

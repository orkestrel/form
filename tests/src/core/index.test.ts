import type {
	CheckboxField,
	FieldRuleName,
	FormEventMap,
	FormOptions,
	FormResult,
	FormSchema,
	PasswordField,
	SelectField,
} from '@src/core'
import * as entry from '@src/core'
import { Emitter } from '@orkestrel/emitter'
import { createRecorder } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'

// This schema is the contract's compile-time proof: it declares every FormField variant, and
// `npm run check` reads this file. A password field carries no default by contract, so seeding
// one here would fail that check.
const SCHEMA: FormSchema = {
	name: 'signup',
	label: 'Sign up',
	help: 'Every control the package models, in one schema.',
	groups: [
		{ name: 'account', label: 'Account' },
		{ name: 'profile', label: 'Profile', help: 'Tell people who you are.' },
	],
	fields: [
		{
			control: 'text',
			name: 'email',
			label: 'Email',
			group: 'account',
			placeholder: 'ada@example.com',
			rule: { required: true, email: true },
		},
		{ control: 'editor', name: 'bio', label: 'Bio', group: 'profile', rule: { maximum: 240 } },
		{
			control: 'password',
			name: 'secret',
			label: 'Password',
			group: 'account',
			mask: '*',
			rule: {
				required: true,
				minimum: 8,
				custom: (value, values) => (value === values.repeat ? true : 'Both passwords must match'),
			},
		},
		{
			control: 'number',
			name: 'age',
			label: 'Age',
			group: 'profile',
			rule: { integer: true, minimum: 18, step: 1 },
		},
		{ control: 'date', name: 'born', label: 'Date of birth', rule: { maximum: '2008-01-01' } },
		{ control: 'time', name: 'reminder', label: 'Reminder', default: '09:00' },
		{ control: 'datetime', name: 'starts', label: 'Starts', default: '2026-01-01T09:00' },
		{ control: 'color', name: 'accent', label: 'Accent', default: '#336699' },
		{ control: 'confirm', name: 'terms', label: 'I accept the terms', rule: { required: true } },
		{
			control: 'select',
			name: 'payment',
			label: 'Payment',
			open: true,
			choices: [
				{ value: 'card', label: 'Card' },
				{ value: 'transfer', label: 'Transfer', help: 'Two working days.', disabled: true },
			],
		},
		{
			control: 'checkbox',
			name: 'topics',
			label: 'Topics',
			default: ['releases'],
			choices: [
				{ value: 'releases', label: 'Releases' },
				{ value: 'events', label: 'Events' },
			],
			rule: { maximum: 2 },
		},
		{
			control: 'file',
			name: 'avatar',
			label: 'Avatar',
			accept: ['image/png', '.jpg'],
			multiple: true,
			hidden: true,
			locked: true,
		},
	],
}

describe('src core entry', () => {
	it('publishes the exact engine runtime surface', () => {
		expect(Object.keys(entry).sort()).toStrictEqual([
			'ALPHANUMERIC_PATTERN',
			'COLOR_PATTERN',
			'DATETIME_PATTERN',
			'DATE_PATTERN',
			'DEFAULT_MASK',
			'EMAIL_PATTERN',
			'FIELD_CONTROLS',
			'FORM_STATUSES',
			'Form',
			'FormError',
			'INTEGER_PATTERN',
			'PATTERN_LIMIT',
			'RULE_MESSAGES',
			'TIME_PATTERN',
			'URL_PATTERN',
			'auditSchema',
			'computeDefaults',
			'createForm',
			'evaluateField',
			'evaluateForm',
			'extractGroups',
			'formatMessage',
			'isFieldChoice',
			'isFieldControl',
			'isFieldError',
			'isFieldRule',
			'isFieldValue',
			'isFormError',
			'isFormField',
			'isFormGroup',
			'isFormSchema',
			'isFormStatus',
			'isFormValues',
			'matchesField',
			'matchesValues',
			'parseForm',
			'parseValue',
			'parseValues',
			'serializeForm',
		])
	})

	it('narrows a select field to its own choices through the control discriminant', () => {
		const select = SCHEMA.fields.find((field): field is SelectField => field.control === 'select')

		expect(select?.choices.map((choice) => choice.value)).toStrictEqual(['card', 'transfer'])
		expect(select?.open).toBe(true)
	})

	it('narrows a checkbox field to a list-valued default', () => {
		const checkbox = SCHEMA.fields.find(
			(field): field is CheckboxField => field.control === 'checkbox',
		)

		expect(checkbox?.default).toStrictEqual(['releases'])
		expect(checkbox?.rule?.maximum).toBe(2)
	})

	it('runs a custom rule against the rest of the form', () => {
		const password = SCHEMA.fields.find(
			(field): field is PasswordField => field.control === 'password',
		)
		const custom = password?.rule?.custom

		expect(password?.mask).toBe('*')
		expect(custom?.('opensesame', { repeat: 'opensesame' })).toBe(true)
		expect(custom?.('opensesame', { repeat: 'sesame' })).toBe('Both passwords must match')
	})

	it('wires form options into a real emitter over the form event map', () => {
		const fills = createRecorder<FormEventMap['fill']>()
		const submits = createRecorder<FormEventMap['submit']>()
		const clears = createRecorder<FormEventMap['clear']>()
		const required: FieldRuleName = 'required'
		const options: FormOptions = {
			values: { email: 'ada@example.com' },
			messages: { required: 'This one is needed' },
			on: { fill: fills.handler, submit: submits.handler, clear: clears.handler },
		}
		const emitter = new Emitter<FormEventMap>({ on: options.on ?? {} })

		emitter.emit('fill', 'email', 'ada@example.com')
		emitter.emit('fill', 'email', undefined)
		emitter.emit('submit', { email: 'ada@example.com' })
		emitter.emit('clear')
		emitter.destroy()

		expect(options.messages?.[required]).toBe('This one is needed')
		expect(fills.calls).toStrictEqual([
			['email', 'ada@example.com'],
			['email', undefined],
		])
		expect(submits.calls).toStrictEqual([[{ email: 'ada@example.com' }]])
		expect(clears.count).toBe(1)
	})

	it('narrows a form result to values or to field errors', () => {
		const passed: FormResult = { success: true, value: { email: 'ada@example.com' } }
		const failed: FormResult = {
			success: false,
			error: [{ field: 'email', message: 'This one is needed', rule: 'required' }],
		}

		expect(passed.success ? passed.value.email : undefined).toBe('ada@example.com')
		expect(failed.success ? [] : failed.error.map((error) => error.rule)).toStrictEqual([
			'required',
		])
	})
})

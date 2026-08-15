import type {
	FieldChoice,
	FieldError,
	FormEventMap,
	FormField,
	FormSchema,
	FormValues,
	TextField,
} from '@src/core'
import { Form, isFormError, isFormSchema } from '@src/core'
import { attempt } from '@orkestrel/contract'
import { createRecorder, waitForDelay } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'

// One schema carries the cases most tests need: two required fields make the form invalid from
// birth, `topics` and `nickname` seed defaults, `referral` is disabled so it is neither checked
// nor submitted, and `token` is hidden and locked so it is both.
const SCHEMA: FormSchema = {
	label: 'Sign up',
	groups: [{ name: 'account', label: 'Account' }],
	fields: [
		{
			control: 'text',
			name: 'email',
			label: 'Email',
			group: 'account',
			rule: { required: true, email: true },
		},
		{ control: 'confirm', name: 'terms', label: 'I accept the terms', rule: { required: true } },
		{
			control: 'checkbox',
			name: 'topics',
			label: 'Topics',
			default: ['releases'],
			choices: [
				{ value: 'releases', label: 'Releases' },
				{ value: 'events', label: 'Events' },
			],
		},
		{ control: 'text', name: 'nickname', label: 'Nickname', default: 'ada' },
		{ control: 'text', name: 'referral', label: 'Referral', disabled: true, default: 'friend' },
		{ control: 'text', name: 'token', label: 'Token', hidden: true, locked: true, default: 'abc' },
	],
}

const BIRTH: readonly FieldError[] = [
	{ field: 'email', message: 'This field is required', rule: 'required' },
	{ field: 'terms', message: 'This field is required', rule: 'required' },
]

const ANSWERED: FormValues = { email: 'ada@example.com', terms: true }

describe('Form construction', () => {
	it('refuses a schema whose invariants the audit rejects', () => {
		const outcome = attempt(
			() =>
				new Form({
					fields: [
						{ control: 'text', name: 'email' },
						{ control: 'text', name: 'email' },
					],
				}),
		)
		const thrown = outcome.success ? undefined : outcome.error

		expect(isFormError(thrown)).toBe(true)
		expect(isFormError(thrown) ? thrown.code : undefined).toBe('SCHEMA')
		expect(isFormError(thrown) ? thrown.context?.problems : undefined).toStrictEqual([
			'Field "email" is declared more than once',
		])
	})

	it('refuses a value the structural guard reads as no form schema at all', () => {
		// A field carrying a key its control does not declare is assignable to FormField and still
		// fails the exact structural guard, which is the only door to that branch.
		const stray: TextField & { readonly stray: boolean } = {
			control: 'text',
			name: 'email',
			stray: true,
		}
		const outcome = attempt(() => new Form({ fields: [stray] }))
		const thrown = outcome.success ? undefined : outcome.error

		expect(isFormError(thrown) ? thrown.code : undefined).toBe('SCHEMA')
		expect(isFormError(thrown) ? thrown.context?.problems : undefined).toStrictEqual([
			'The schema is not a form schema',
		])
	})

	it('refuses a seeded value naming a field the schema does not declare', () => {
		const outcome = attempt(() => new Form(SCHEMA, { values: { postcode: 'SW1A' } }))
		const thrown = outcome.success ? undefined : outcome.error

		expect(isFormError(thrown) ? thrown.code : undefined).toBe('FIELD')
		expect(isFormError(thrown) ? thrown.context?.field : undefined).toBe('postcode')
	})

	it('refuses a seeded value the field control cannot hold', () => {
		const outcome = attempt(() => new Form(SCHEMA, { values: { terms: 'yes' } }))
		const thrown = outcome.success ? undefined : outcome.error

		expect(isFormError(thrown) ? thrown.code : undefined).toBe('CONTROL')
		expect(isFormError(thrown) ? thrown.context?.control : undefined).toBe('confirm')
	})

	it('opens invalid when a required field starts unanswered', () => {
		const form = new Form(SCHEMA)

		expect(form.status).toBe('editing')
		expect(form.errors).toStrictEqual(BIRTH)
		expect(form.valid).toBe(false)
		expect(form.dirty).toBe(false)
		expect(form.values).toStrictEqual({
			topics: ['releases'],
			nickname: 'ada',
			referral: 'friend',
			token: 'abc',
		})
	})

	it('treats prototype-shadowing field names as ordinary own answer keys', () => {
		const form = new Form({
			fields: [
				{ control: 'text', name: 'constructor', rule: { required: true } },
				{ control: 'text', name: 'prototype' },
			],
		})

		expect(form.errors).toStrictEqual([
			{ field: 'constructor', message: 'This field is required', rule: 'required' },
		])

		form.fill({ constructor: 'built', prototype: 'owned' })

		expect(form.values).toStrictEqual({ constructor: 'built', prototype: 'owned' })
		expect(Object.hasOwn(form.values, 'constructor')).toBe(true)
	})

	it('refuses the __proto__ field name at the schema door', () => {
		const outcome = attempt(
			() => new Form({ fields: [{ control: 'text', name: '__proto__', default: 'owned' }] }),
		)
		const thrown = outcome.success ? undefined : outcome.error

		expect(isFormError(thrown) ? thrown.code : undefined).toBe('SCHEMA')
	})

	it('overlays seeded values onto the schema defaults as the baseline', () => {
		const form = new Form(SCHEMA, { values: { nickname: 'grace', email: 'ada@example.com' } })

		expect(form.values.nickname).toBe('grace')
		expect(form.dirty).toBe(false)
		expect(form.errors).toStrictEqual([
			{ field: 'terms', message: 'This field is required', rule: 'required' },
		])

		form.fill('nickname', 'ada')

		expect(form.dirty).toBe(true)
	})

	it('replaces a rule message with the one the options name', () => {
		const form = new Form(SCHEMA, { messages: { required: 'This one is needed' } })

		expect(form.errors.map((error) => error.message)).toStrictEqual([
			'This one is needed',
			'This one is needed',
		])
	})

	it('owns the schema, so a later edit by the caller reaches nothing', () => {
		const choices: FieldChoice[] = [{ value: 'releases', label: 'Releases' }]
		const topics: string[] = ['releases']
		const fields: FormField[] = [{ control: 'checkbox', name: 'topics', choices, default: topics }]
		const form = new Form({ fields })
		const owned = form.field('topics')

		fields.push({ control: 'text', name: 'late' })
		choices.push({ value: 'events', label: 'Events' })
		topics.push('events')

		expect(form.schema.fields.length).toBe(1)
		expect(form.field('late')).toBeUndefined()
		expect(owned?.control === 'checkbox' ? owned.choices.length : 0).toBe(1)
		expect(form.values).toStrictEqual({ topics: ['releases'] })
		expect(Object.isFrozen(form.schema)).toBe(true)
		expect(isFormSchema(form.schema)).toBe(true)
	})
})

describe('Form state', () => {
	it('hands out a fresh frozen snapshot of the answers on every read', () => {
		const form = new Form(SCHEMA)

		expect(form.values).not.toBe(form.values)
		expect(Object.isFrozen(form.values)).toBe(true)
		expect(form.touched).not.toBe(form.touched)
		expect(Object.isFrozen(form.errors)).toBe(true)
		expect(form.errors.every((error) => Object.isFrozen(error))).toBe(true)
	})

	it('derives validity from the current error list', () => {
		const form = new Form(SCHEMA)

		expect(form.valid).toBe(false)

		form.fill(ANSWERED)

		expect(form.errors).toStrictEqual([])
		expect(form.valid).toBe(true)

		form.invalidate('email', 'That address is already registered')

		expect(form.valid).toBe(false)
	})

	it('derives dirtiness from the answers, so restoring one clears it', () => {
		const form = new Form(SCHEMA)

		form.fill('nickname', 'grace')

		expect(form.dirty).toBe(true)

		form.fill('nickname', 'ada')

		expect(form.dirty).toBe(false)
	})

	it('reads an equal but distinct list answer as unmoved', () => {
		const form = new Form(SCHEMA)
		const fills = createRecorder<FormEventMap['fill']>()
		const topics: readonly string[] = ['releases']
		form.emitter.on('fill', fills.handler)

		form.fill('topics', topics)

		expect(form.values.topics).not.toBe(topics)
		expect(form.dirty).toBe(false)
		expect(fills.count).toBe(0)
	})

	it('finds a field by name in every status', () => {
		const form = new Form(SCHEMA)

		expect(form.field('email')?.label).toBe('Email')
		expect(form.field('postcode')).toBeUndefined()

		form.destroy()

		expect(form.field('email')?.label).toBe('Email')
	})
})

describe('Form fill', () => {
	it('writes nothing when any entry of a bulk fill is refused', () => {
		const form = new Form(SCHEMA)
		const fills = createRecorder<FormEventMap['fill']>()
		form.emitter.on('fill', fills.handler)

		const outcome = attempt(() => form.fill({ email: 'ada@example.com', terms: 'yes' }))
		const thrown = outcome.success ? undefined : outcome.error

		expect(isFormError(thrown) ? thrown.code : undefined).toBe('CONTROL')
		expect(form.values.email).toBeUndefined()
		expect(fills.count).toBe(0)
	})

	it('refuses an entry naming a field the schema does not declare', () => {
		const form = new Form(SCHEMA)
		const outcome = attempt(() => form.fill({ postcode: 'SW1A' }))
		const thrown = outcome.success ? undefined : outcome.error

		expect(isFormError(thrown) ? thrown.code : undefined).toBe('FIELD')
	})

	it('announces one fill per changed entry and nothing for an unchanged one', () => {
		const form = new Form(SCHEMA)
		const fills = createRecorder<FormEventMap['fill']>()
		form.emitter.on('fill', fills.handler)

		form.fill({ email: 'ada@example.com', nickname: 'ada' })

		expect(fills.calls).toStrictEqual([['email', 'ada@example.com']])
	})

	it('removes an answer when the value is undefined', () => {
		const form = new Form(SCHEMA)
		const fills = createRecorder<FormEventMap['fill']>()
		form.emitter.on('fill', fills.handler)

		form.fill('nickname', undefined)

		expect(Object.hasOwn(form.values, 'nickname')).toBe(false)
		expect(fills.calls).toStrictEqual([['nickname', undefined]])

		form.fill('nickname', undefined)

		expect(fills.count).toBe(1)
	})

	it('orders a fill before the validate its answer caused', () => {
		const form = new Form(SCHEMA)
		const events: string[] = []
		form.emitter.on('fill', (name) => events.push(`fill:${name}`))
		form.emitter.on('validate', (errors) => events.push(`validate:${errors.length}`))

		form.fill(ANSWERED)

		expect(events).toStrictEqual(['fill:email', 'fill:terms', 'validate:0'])
	})

	it('withholds validate when an answer moves and the error list does not', () => {
		const form = new Form(SCHEMA)
		const validations = createRecorder<FormEventMap['validate']>()
		form.emitter.on('validate', validations.handler)

		form.fill('nickname', 'grace')

		expect(form.errors).toStrictEqual(BIRTH)
		expect(validations.count).toBe(0)

		form.fill('email', 'nope')

		expect(validations.calls).toStrictEqual([
			[
				[
					{ field: 'email', message: 'Must be a valid email address', rule: 'email' },
					{ field: 'terms', message: 'This field is required', rule: 'required' },
				],
			],
		])
	})

	it('holds a list answer as its own copy', () => {
		const form = new Form(SCHEMA)
		const topics: string[] = ['releases', 'events']

		form.fill('topics', topics)
		topics.push('releases')

		expect(form.values.topics).toStrictEqual(['releases', 'events'])
	})
})

describe('Form touch', () => {
	it('records a visited field without announcing anything', () => {
		const form = new Form(SCHEMA)
		const validations = createRecorder<FormEventMap['validate']>()
		form.emitter.on('validate', validations.handler)

		form.touch('email')
		form.touch('email')

		expect([...form.touched]).toStrictEqual(['email'])
		expect(validations.count).toBe(0)
	})

	it('refuses a name the schema does not declare', () => {
		const form = new Form(SCHEMA)
		const outcome = attempt(() => form.touch('postcode'))
		const thrown = outcome.success ? undefined : outcome.error

		expect(isFormError(thrown) ? thrown.code : undefined).toBe('FIELD')
		expect(form.touched.size).toBe(0)
	})
})

describe('Form invalidate', () => {
	it('appends an external failure after the rule failures', () => {
		const form = new Form(SCHEMA)
		const validations = createRecorder<FormEventMap['validate']>()
		form.emitter.on('validate', validations.handler)

		form.invalidate('email', 'That address is already registered')

		expect(form.errors).toStrictEqual([
			...BIRTH,
			{ field: 'email', message: 'That address is already registered' },
		])
		expect(validations.count).toBe(1)
	})

	it('replaces the failure a second call names for the same field', () => {
		const form = new Form(SCHEMA)

		form.invalidate('email', 'That address is already registered')
		form.invalidate('email', 'That address is blocked')

		expect(form.errors.filter((error) => error.rule === undefined)).toStrictEqual([
			{ field: 'email', message: 'That address is blocked' },
		])
	})

	it('withholds validate when the same failure is recorded twice', () => {
		const form = new Form(SCHEMA)
		const validations = createRecorder<FormEventMap['validate']>()
		form.emitter.on('validate', validations.handler)

		form.invalidate('email', 'That address is already registered')
		form.invalidate('email', 'That address is already registered')

		expect(validations.count).toBe(1)
	})

	it('drops the failure when that field is filled again', () => {
		const form = new Form(SCHEMA)

		form.invalidate('email', 'That address is already registered')
		form.fill('email', 'ada@example.com')

		expect(form.errors).toStrictEqual([
			{ field: 'terms', message: 'This field is required', rule: 'required' },
		])
	})

	it('drops every failure when the form is cleared', () => {
		const form = new Form(SCHEMA)

		form.invalidate('nickname', 'Somebody already uses that name')
		form.clear()

		expect(form.errors).toStrictEqual(BIRTH)
	})

	it('stores no external failure for a disabled field', () => {
		const form = new Form(SCHEMA)

		form.invalidate('referral', 'That referral is unavailable')

		expect(form.errors).toStrictEqual(BIRTH)
		form.fill('referral', 'other')
		form.touch('referral')
		expect(form.values.referral).toBe('other')
		expect(form.touched.has('referral')).toBe(true)
	})
})

describe('Form submit', () => {
	it('touches every enabled field and stays open when an answer fails', () => {
		const form = new Form(SCHEMA)
		const events: string[] = []
		form.emitter.on('validate', () => events.push('validate'))
		form.emitter.on('submit', () => events.push('submit'))

		const result = form.submit()

		expect(result.success).toBe(false)
		expect(result.success ? undefined : result.error).toBe(form.errors)
		expect([...form.touched]).toStrictEqual(['email', 'terms', 'topics', 'nickname', 'token'])
		expect(form.status).toBe('editing')
		// The error list was already current, so a failed submit has nothing new to announce.
		expect(events).toStrictEqual([])
	})

	it('settles on the answers, dropping the disabled field and keeping the hidden one', async () => {
		const form = new Form(SCHEMA)
		const events: string[] = []
		form.emitter.on('validate', () => events.push('validate'))
		form.emitter.on('submit', (values) => events.push(`submit:${Object.keys(values).join(',')}`))

		form.fill(ANSWERED)
		events.length = 0

		const result = form.submit()
		const value = result.success ? result.value : undefined

		expect(value).toStrictEqual({
			email: 'ada@example.com',
			terms: true,
			topics: ['releases'],
			nickname: 'ada',
			token: 'abc',
		})
		expect(form.status).toBe('settled')
		expect(events).toStrictEqual(['submit:email,terms,topics,nickname,token'])
		await expect(form.answer).resolves.toBe(value)
	})

	it('refuses every write once the form has settled', () => {
		const form = new Form(SCHEMA)

		form.fill(ANSWERED)
		form.submit()

		expect(refusalsOf(form)).toStrictEqual(['SETTLED', 'SETTLED', 'SETTLED', 'SETTLED', 'SETTLED'])
	})
})

describe('Form clear', () => {
	it('returns the answers to the baseline and announces the clear before the validate', () => {
		const form = new Form(SCHEMA)
		const events: string[] = []
		form.emitter.on('clear', () => events.push('clear'))
		form.emitter.on('validate', (errors) => events.push(`validate:${errors.length}`))

		form.fill(ANSWERED)
		form.touch('nickname')
		events.length = 0
		form.clear()

		expect(form.values).toStrictEqual({
			topics: ['releases'],
			nickname: 'ada',
			referral: 'friend',
			token: 'abc',
		})
		expect(form.touched.size).toBe(0)
		expect(form.errors).toStrictEqual(BIRTH)
		expect(form.dirty).toBe(false)
		expect(form.status).toBe('editing')
		expect(events).toStrictEqual(['clear', 'validate:2'])
	})

	it('announces the clear alone when the error list does not move', () => {
		const form = new Form(SCHEMA)
		const events: string[] = []
		form.emitter.on('clear', () => events.push('clear'))
		form.emitter.on('validate', () => events.push('validate'))

		form.fill('nickname', 'grace')
		form.clear()

		expect(events).toStrictEqual(['clear'])
	})
})

describe('Form destroy', () => {
	it('abandons an unsettled form, rejecting its answer', async () => {
		const form = new Form(SCHEMA)
		const events: string[] = []
		form.emitter.on('abandon', () => events.push(`abandon:${form.status}`))

		form.destroy()

		expect(events).toStrictEqual(['abandon:abandoned'])
		expect(form.status).toBe('abandoned')
		await expect(form.answer).rejects.toMatchObject({ code: 'ABANDONED' })
	})

	it('destroys the emitter last, so nothing reaches a listener afterwards', () => {
		const form = new Form(SCHEMA)
		const abandons = createRecorder<FormEventMap['abandon']>()
		form.emitter.on('abandon', abandons.handler)

		form.destroy()
		form.emitter.emit('abandon')

		expect(abandons.count).toBe(1)
		expect(form.emitter.destroyed).toBe(true)
	})

	it('does nothing the second time it is called', () => {
		const form = new Form(SCHEMA)
		const abandons = createRecorder<FormEventMap['abandon']>()
		form.emitter.on('abandon', abandons.handler)

		form.destroy()
		form.destroy()

		expect(abandons.count).toBe(1)
		expect(form.status).toBe('abandoned')
	})

	it('leaves a settled form settled and announces nothing', () => {
		const form = new Form(SCHEMA)
		const abandons = createRecorder<FormEventMap['abandon']>()
		form.emitter.on('abandon', abandons.handler)

		form.fill(ANSWERED)
		form.submit()
		form.destroy()

		expect(form.status).toBe('settled')
		expect(abandons.count).toBe(0)
		expect(form.emitter.destroyed).toBe(true)
	})

	it('refuses abandoned forms as ABANDONED and settled forms as SETTLED after destroy', () => {
		const abandoned = new Form(SCHEMA)
		abandoned.destroy()

		const settled = new Form(SCHEMA)
		settled.fill(ANSWERED)
		settled.submit()
		settled.destroy()

		expect(refusalsOf(abandoned)).toStrictEqual([
			'ABANDONED',
			'ABANDONED',
			'ABANDONED',
			'ABANDONED',
			'ABANDONED',
		])
		expect(refusalsOf(settled)).toStrictEqual([
			'SETTLED',
			'SETTLED',
			'SETTLED',
			'SETTLED',
			'SETTLED',
		])
	})

	it('finishes a fill event batch before applying listener-requested teardown', async () => {
		const events: string[] = []
		const refusals: string[] = []
		const form = new Form(
			{
				fields: [
					{ control: 'text', name: 'first' },
					{ control: 'text', name: 'second' },
				],
			},
			{
				on: {
					fill: (name) => {
						events.push(name)
						form.destroy()
						const outcome = attempt(() => form.touch(name))
						if (!outcome.success && isFormError(outcome.error)) {
							refusals.push(outcome.error.code)
						}
					},
				},
			},
		)

		form.fill({ first: 'one', second: 'two' })

		expect(events).toStrictEqual(['first', 'second'])
		expect(refusals).toStrictEqual(['ABANDONED', 'ABANDONED'])
		expect(form.status).toBe('abandoned')
		expect(form.emitter.destroyed).toBe(true)
		await expect(form.answer).rejects.toMatchObject({ code: 'ABANDONED' })
	})

	it('keeps every getter answering on the state the form ended with', () => {
		const form = new Form(SCHEMA)

		form.fill('email', 'ada@example.com')
		form.touch('email')
		form.destroy()

		expect(form.values.email).toBe('ada@example.com')
		expect(form.errors).toStrictEqual([
			{ field: 'terms', message: 'This field is required', rule: 'required' },
		])
		expect(form.valid).toBe(false)
		expect(form.dirty).toBe(true)
		expect([...form.touched]).toStrictEqual(['email'])
		expect(form.schema.label).toBe('Sign up')
	})

	it('survives destroying a form whose answer nobody awaited', async () => {
		// That rejection has no handler of the caller's. Without the form's own, Node reports an
		// unhandled rejection on the next turn and Vitest fails the run rather than this assertion.
		new Form(SCHEMA).destroy()

		await waitForDelay(10)

		expect(true).toBe(true)
	})
})

describe('Form rules', () => {
	it('runs a custom rule once per fill and shows it every answer', () => {
		const seen: FormValues[] = []
		const schema: FormSchema = {
			fields: [
				{
					control: 'text',
					name: 'secret',
					default: 'open',
					rule: {
						custom: (value, values) => {
							seen.push(values)
							return value === values.repeat ? true : 'Both entries must match'
						},
					},
				},
				{ control: 'text', name: 'repeat', default: 'open' },
			],
		}
		const form = new Form(schema)

		expect(seen.length).toBe(1)

		form.fill('secret', 'sesame')

		expect(seen.length).toBe(2)
		expect(form.errors).toStrictEqual([{ field: 'secret', message: 'Both entries must match' }])

		form.fill('secret', 'sesame')

		expect(seen.length).toBe(3)
		expect(seen[2]).toStrictEqual({ secret: 'sesame', repeat: 'open' })

		form.fill('repeat', 'sesame')

		expect(seen.length).toBe(4)
		expect(form.valid).toBe(true)
	})

	it('routes a throwing listener to the options error handler and keeps its siblings', () => {
		const failures: Array<readonly [unknown, string]> = []
		const heard: string[] = []
		const form = new Form(SCHEMA, {
			on: {
				fill: () => {
					throw new Error('listener exploded')
				},
			},
			error: (error, event) => failures.push([error, event]),
		})
		form.emitter.on('fill', (name) => heard.push(name))

		form.fill('nickname', 'grace')

		expect(failures.length).toBe(1)
		expect(failures[0]?.[1]).toBe('fill')
		expect(heard).toStrictEqual(['nickname'])
		expect(form.values.nickname).toBe('grace')
	})
})

// Every mutating method, tried against one ended form, reported as the code each refusal carried.
function refusalsOf(form: Form): readonly string[] {
	const outcomes = [
		attempt(() => form.fill('nickname', 'grace')),
		attempt(() => form.touch('nickname')),
		attempt(() => form.invalidate('nickname', 'Somebody already uses that name')),
		attempt(() => form.submit()),
		attempt(() => form.clear()),
	]

	return outcomes.map((outcome) => {
		if (outcome.success) return 'none'
		return isFormError(outcome.error) ? outcome.error.code : 'other'
	})
}

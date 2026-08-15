// The consumer-side guides-parity drop-in: runs `@orkestrel/guide`'s checks against
// this repo's own `guides/README.md` manifest. The five constants below are this
// package's own, and are the only part a sibling package changes.
//
// The suite transcribes and executes the flagship fence set from `guides/form.md`. It name-checks
// and parity-checks the remaining fences but does not run them. Change a flagship fence, change its
// transcription.

import { describe, expect, it } from 'vitest'
import {
	createGuide,
	createSource,
	createSourceManager,
	fenceImports,
	findMissing,
	findUnexampled,
	findUnlisted,
	isExternalLink,
	missingSymbols,
	parseManifest,
	resolveLink,
	symbolKey,
} from '@orkestrel/guide'
import { readFileSync } from 'node:fs'
import { createRecorder, requireValue } from '@orkestrel/test'
import { readInventory } from '@orkestrel/test/server'
import type {
	CheckboxField,
	ConfirmField,
	DateField,
	FieldValidator,
	FormSchema,
	NumberField,
	PasswordField,
	TextField,
} from '@src/core'
import {
	auditSchema,
	appliesRule,
	cloneChoices,
	cloneFormField,
	cloneFormSchema,
	cloneValue,
	computeDefaults,
	createForm,
	EMAIL_PATTERN,
	evaluateField,
	evaluateForm,
	extractChanges,
	extractGroups,
	Form,
	formatMessage,
	isFieldChoice,
	isFieldControl,
	isFieldError,
	isFieldRule,
	isFieldValue,
	isFormError,
	isFormField,
	isFormGroup,
	isFormSchema,
	isFormStatus,
	isFormValues,
	LIST_LIMIT,
	matchesAnswer,
	matchesField,
	matchesValue,
	matchesValues,
	parseForm,
	parseValue,
	parseValues,
	PATTERN_LIMIT,
	serializeForm,
	STRING_LIMIT,
} from '@src/core'

/** Every fence language this package's guides are allowed to use. */
const FENCE_LANGUAGES = Object.freeze(['ts'])
/** The fence language whose blocks count as worked examples. */
const EXAMPLE_LANGUAGE = 'ts'
/** Each import specifier this package's own guides may resolve against. */
const MODULES = Object.freeze({
	'@orkestrel/form': 'src/core',
	'@src/core': 'src/core',
})
/**
 * Declarations deliberately kept out of the barrel, as `symbolKey` strings.
 *
 * A class that one-class-per-file evicted from its single consumer cannot become a
 * local, so it stays exported without being public. Naming it here is what makes that
 * intentional rather than forgotten — and the second assertion below fails when a name
 * here stops being stranded, so the list cannot rot.
 *
 * This package has none: `Form` is constructible from a schema a consumer already
 * holds, so it is barrelled beside `createForm` rather than interned.
 */
const INTERNAL: readonly string[] = Object.freeze([])

/** Root-level files this package's guides link to. `readInventory` walks directories only. */
const ROOT_FILES = Object.freeze(['AGENTS.md', 'README.md'])

const root = new URL('../', import.meta.url)
const files: Record<string, string> = {
	...readInventory(root, ['src', 'guides', 'tests'], { extensions: ['.ts', '.md'] }),
}
for (const name of ROOT_FILES) files[name] = readFileSync(new URL(name, root), 'utf8')
const manifest = parseManifest(
	requireValue(files['guides/README.md'], 'Missing file: guides/README.md'),
	'guides',
)
const sources = createSourceManager({ files, modules: MODULES })
const readme = createGuide(requireValue(files['README.md'], 'Missing file: README.md'))

it('imports only real exports in every root README ```ts fence', () => {
	const fences = readme.fences().filter((fence) => fence.language === EXAMPLE_LANGUAGE)
	for (const fence of fences) {
		for (const { specifier, names } of fenceImports(fence.code)) {
			const imported = sources.source(specifier)
			if (imported === undefined) continue
			const surface = imported.surface().map((symbol) => symbol.name)
			expect(findMissing(names, surface)).toEqual([])
		}
	}
})

it('manifest lists at least one guide', () => {
	expect(manifest.length).toBeGreaterThan(0)
})

for (const entry of manifest) {
	const guide = createGuide(requireValue(files[entry.spec], `Missing file: ${entry.spec}`))
	const source = createSource({ files, module: entry.source })

	describe(`${entry.concept}`, () => {
		it('uses only listed fence languages', () => {
			expect(findUnlisted(guide.fences(), FENCE_LANGUAGES)).toEqual([])
		})

		it('extracts a non-empty documented surface', () => {
			expect(guide.surface().length).toBeGreaterThan(0)
		})
		it('re-exports every direct declaration that is not named internal', () => {
			const stranded = missingSymbols(source.exports(), source.surface())
			expect(stranded.filter((key) => !INTERNAL.includes(key))).toEqual([])
		})
		it('names no symbol internal that the barrel already exports', () => {
			const stranded = missingSymbols(source.exports(), source.surface())
			expect(INTERNAL.filter((key) => !stranded.includes(key))).toEqual([])
		})
		it('re-exports only direct declarations', () => {
			expect(missingSymbols(source.surface(), source.exports())).toEqual([])
		})
		it('documents every barrel export', () => {
			expect(missingSymbols(source.surface(), guide.surface())).toEqual([])
		})
		it('documents only barrel exports', () => {
			expect(missingSymbols(guide.surface(), source.surface())).toEqual([])
		})

		it('exposes no hidden module-scope declarations', () => {
			expect(source.hidden().map(symbolKey)).toEqual([])
		})

		for (const group of guide.methods()) {
			const members = source.methods(group.interface)
			const entity = group.interface.replace(/Interface$/u, '')
			describe(`${group.interface}`, () => {
				it('documents at least one method', () => {
					expect(group.methods.length).toBeGreaterThan(0)
				})
				it('documents every interface method', () => {
					expect(findMissing(members, group.methods)).toEqual([])
				})
				it('documents no phantom method', () => {
					expect(findMissing(group.methods, members)).toEqual([])
				})
				it(`${entity} exposes no undocumented method`, () => {
					const extra =
						entity === group.interface ? [] : findMissing(source.methods(entity), group.methods)
					expect(extra).toEqual([])
				})
			})
		}

		it('documents an example for every Surface function', () => {
			const fences = guide
				.fences()
				.filter((fence) => fence.language === EXAMPLE_LANGUAGE)
				.map((fence) => fence.code)
			const names = guide
				.surface()
				.filter((symbol) => symbol.kind === 'function')
				.map((symbol) => symbol.name)
			expect(findUnexampled(names, fences, source.examples())).toEqual([])
		})

		for (const group of guide.methods()) {
			const entity = group.interface.replace(/Interface$/u, '')
			describe(`${group.interface} examples`, () => {
				it('documents an example for every method', () => {
					const fences = guide
						.fences()
						.filter((fence) => fence.language === EXAMPLE_LANGUAGE)
						.map((fence) => fence.code)
					const examples =
						entity === group.interface
							? source.examples(group.interface)
							: source.examples(group.interface).concat(source.examples(entity))
					expect(findUnexampled(group.methods, fences, examples)).toEqual([])
				})
			})
		}

		it('imports only real exports in every ```ts fence', () => {
			const fences = guide.fences().filter((fence) => fence.language === EXAMPLE_LANGUAGE)
			for (const fence of fences) {
				for (const { specifier, names } of fenceImports(fence.code)) {
					const imported = sources.source(specifier)
					if (imported === undefined) continue
					const surface = imported.surface().map((symbol) => symbol.name)
					expect(findMissing(names, surface)).toEqual([])
				}
			}
		})

		it('resolves every relative link', () => {
			const broken = guide
				.links()
				.filter((href) => !isExternalLink(href))
				.map((href) => resolveLink(entry.spec, href))
				.filter((path) => !source.exists(path))
			expect(broken).toEqual([])
		})
		it('links only to test files that exist', () => {
			const missing = guide
				.tests()
				.map((href) => resolveLink(entry.spec, href))
				.filter((path) => !source.exists(path))
			expect(missing).toEqual([])
		})
	})
}

// Each block below transcribes one flagship fence of `guides/form.md` and asserts the
// values that fence's comments claim. A fence documenting a value the code contradicts
// fails here; name resolution above would pass it.
describe('form.md fences', () => {
	it('settles the Surface opening example', async () => {
		const form = createForm({
			label: 'Sign up',
			fields: [
				{ control: 'text', name: 'email', label: 'Email', rule: { required: true, email: true } },
				{
					control: 'confirm',
					name: 'terms',
					label: 'I accept the terms',
					rule: { required: true },
				},
			],
		})

		form.fill({ email: 'ada@example.com', terms: true })
		expect(form.submit()).toStrictEqual({
			success: true,
			value: { email: 'ada@example.com', terms: true },
		})
		await expect(form.answer).resolves.toStrictEqual({ email: 'ada@example.com', terms: true })
	})

	it('keeps meta out of evaluation and verbatim on the wire', () => {
		const schema: FormSchema = {
			fields: [{ control: 'text', name: 'email', meta: { icon: 'mail', order: 2 } }],
		}

		expect(evaluateForm(schema, {})).toStrictEqual([])

		const wire = JSON.stringify(serializeForm(schema))
		expect(wire).toBe(
			'{"fields":[{"control":"text","name":"email","meta":{"icon":"mail","order":2}}]}',
		)
		expect(JSON.stringify(parseForm(JSON.parse(wire)))).toBe(wire)

		expect(isFormGroup({ name: 'account', label: 'Account', meta: {} })).toBe(false)
		expect(isFieldChoice({ value: 'a', label: 'A', meta: {} })).toBe(false)

		const form = createForm(schema)
		expect(form.field('email')?.meta).toEqual({ icon: 'mail', order: 2 })
		expect(Object.getPrototypeOf(form.field('email')?.meta ?? {})).toBeNull()
	})

	it('evaluates the numeric rules and resolves their messages', () => {
		const volume: NumberField = {
			control: 'number',
			name: 'volume',
			rule: { minimum: 0, maximum: 11, step: 1 },
		}

		expect(evaluateField(volume, 12, {})).toStrictEqual([
			{ field: 'volume', message: 'Must be at most 11', rule: 'maximum' },
		])
		expect(evaluateField(volume, 0.5, {})).toStrictEqual([
			{ field: 'volume', message: 'Must be a multiple of 1', rule: 'step' },
		])

		expect(formatMessage('minimum', 8)).toBe('Must be at least 8')
		expect(formatMessage('required', undefined, { required: 'We need this one' })).toBe(
			'We need this one',
		)
	})

	it('counts every value but undefined and whitespace as an answer', () => {
		expect(matchesAnswer(undefined)).toBe(false)
		expect(matchesAnswer('')).toBe(false)
		expect(matchesAnswer('   ')).toBe(false)
		expect(matchesAnswer('ada')).toBe(true)
		expect(matchesAnswer([])).toBe(true)
		expect(matchesAnswer(false)).toBe(true)
		expect(matchesAnswer(0)).toBe(true)

		const form = createForm({
			fields: [{ control: 'text', name: 'email', rule: { required: true } }],
		})

		const raw = '   '
		form.fill('email', matchesAnswer(raw) ? raw : undefined)

		expect(form.values.email).toBeUndefined()
		expect(form.errors.length).toBe(1)
	})

	it('runs the custom seam against the rest of the form', () => {
		const matches: FieldValidator = (value, values) =>
			value === values.password ? true : 'Both passwords must match'
		const again: PasswordField = { control: 'password', name: 'again', rule: { custom: matches } }

		expect(evaluateField(again, 'hunter3', { password: 'hunter2' })).toStrictEqual([
			{ field: 'again', message: 'Both passwords must match' },
		])
	})

	it('runs a custom rule on an absent value for a required-when check', () => {
		const whenBusiness: FieldValidator = (value, values) =>
			values.account === 'business' && value === undefined ? 'A VAT number is required' : true
		const vat: TextField = { control: 'text', name: 'vat', rule: { custom: whenBusiness } }

		expect(evaluateField(vat, undefined, { account: 'business' })).toStrictEqual([
			{ field: 'vat', message: 'A VAT number is required' },
		])
		expect(evaluateField(vat, undefined, { account: 'personal' })).toStrictEqual([])
	})

	it('closes an address list with a custom rule and the exported email pattern', () => {
		const addresses: FieldValidator = (value) =>
			typeof value !== 'string' ||
			value
				.split(',')
				.map((entry) => entry.trim())
				.every((entry) => EMAIL_PATTERN.test(entry))
				? true
				: 'Every address must be valid'
		const to: TextField = { control: 'text', name: 'to', rule: { custom: addresses } }

		expect(evaluateField(to, 'ada@example.com, grace@example.com', {})).toStrictEqual([])
		expect(evaluateField(to, 'ada@example.com, nope', {})).toStrictEqual([
			{ field: 'to', message: 'Every address must be valid' },
		])
	})

	it('refuses a pattern longer than the limit at both gates', () => {
		const long: TextField = {
			control: 'text',
			name: 'code',
			rule: { pattern: 'a'.repeat(PATTERN_LIMIT + 1) },
		}

		expect(PATTERN_LIMIT).toBe(256)
		expect(auditSchema({ fields: [long] })).toStrictEqual([
			'Field "code" has a pattern longer than 256',
		])
		expect(evaluateField(long, 'aaa', {})).toStrictEqual([
			{ field: 'code', message: 'Must match the required format', rule: 'pattern' },
		])
	})

	it('refuses an over-budget name, string, list, and value at their own doors', () => {
		expect(auditSchema({ fields: [{ control: 'text', name: 'n'.repeat(129) }] })).toStrictEqual([
			'Schema contains a name longer than 128',
		])
		expect(
			auditSchema({
				fields: [{ control: 'text', name: 'a', label: 'x'.repeat(STRING_LIMIT + 1) }],
			}),
		).toStrictEqual(['Schema contains a string longer than 65536'])

		const topics: CheckboxField = {
			control: 'checkbox',
			name: 't',
			choices: [{ value: 'a', label: 'A' }],
		}

		expect(
			matchesField(
				topics,
				Array.from({ length: LIST_LIMIT + 1 }, () => 'a'),
			),
		).toBe(false)
		expect(matchesField({ control: 'text', name: 'a' }, 'x'.repeat(STRING_LIMIT + 1))).toBe(false)
	})

	it('reports the audit diagnostics the guide quotes', () => {
		expect(
			auditSchema({
				fields: [
					{ control: 'text', name: 'a' },
					{ control: 'text', name: 'a' },
				],
			}),
		).toStrictEqual(['Field "a" is declared more than once'])
		expect(
			auditSchema({ fields: [{ control: 'number', name: 'n', rule: { minimum: '3' } }] }),
		).toStrictEqual(['Field "n" has a string minimum on number'])
		expect(
			auditSchema({
				fields: [
					{
						control: 'select',
						name: 'plan',
						disabled: true,
						choices: [{ value: 'legacy', label: 'Legacy', disabled: true }],
						rule: { required: true },
					},
				],
			}),
		).toStrictEqual(['Field "plan" is required but offers no enabled choice'])
		expect(
			auditSchema({ fields: [{ control: 'text', name: 'code', rule: { maximum: -1 } }] }),
		).toStrictEqual(['Field "code" has a negative maximum on text'])
		expect(auditSchema({ fields: [{ control: 'text', name: 'email' }] })).toStrictEqual([])
	})

	it('accepts a lexically valid date that no calendar has', () => {
		const when: DateField = { control: 'date', name: 'when' }

		expect(matchesField(when, '2026-02-31')).toBe(true)
		expect(matchesField(when, '2026-13-01')).toBe(false)
	})

	it('walks the lifecycle example', () => {
		const form = createForm({
			fields: [
				{ control: 'text', name: 'email', rule: { required: true, email: true } },
				{ control: 'confirm', name: 'terms', rule: { required: true } },
			],
		})

		expect(form.errors.length).toBe(2)
		expect(form.valid).toBe(false)
		expect(form.dirty).toBe(false)
		expect(form.status).toBe('editing')

		expect(form.field('email')?.control).toBe('text')
		form.touch('email')
		expect(form.touched.has('email')).toBe(true)

		form.fill('email', 'ada@example.com')
		expect(form.dirty).toBe(true)
		expect(form.errors.length).toBe(1)

		expect(form.submit().success).toBe(false)
		expect(Array.from(form.touched)).toStrictEqual(['email', 'terms'])

		form.fill('terms', true)
		expect(form.submit()).toStrictEqual({
			success: true,
			value: { email: 'ada@example.com', terms: true },
		})
		expect(form.status).toBe('settled')
	})

	it('keeps a disabled field out of evaluation and out of the submit', () => {
		const form = createForm({
			fields: [
				{ control: 'text', name: 'email', rule: { required: true } },
				{
					control: 'text',
					name: 'legacy',
					disabled: true,
					default: 'kept',
					rule: { required: true, email: true },
				},
			],
		})

		expect(form.values).toStrictEqual({ legacy: 'kept' })
		expect(form.errors.length).toBe(1)

		form.fill('email', 'ada@example.com')
		expect(form.submit()).toStrictEqual({ success: true, value: { email: 'ada@example.com' } })
	})

	it('expands a group in one line and takes it out of the form', () => {
		const form = createForm({
			groups: [{ name: 'billing', label: 'Billing' }],
			fields: [
				{ control: 'text', name: 'card', group: 'billing', rule: { required: true } },
				{ control: 'text', name: 'zip', group: 'billing', rule: { required: true } },
				{ control: 'text', name: 'email', rule: { required: true } },
			],
		})

		const billing = form.schema.fields.filter((field) => field.group === 'billing')
		form.disable(billing.map((field) => field.name))

		expect(Array.from(form.disabled)).toStrictEqual(['card', 'zip'])
		expect(form.errors.length).toBe(1)
	})

	it('announces only real moves, and announces a clear reset with clear alone', () => {
		const moved: string[] = []

		const form = createForm(
			{
				fields: [
					{ control: 'text', name: 'email', rule: { required: true } },
					{ control: 'text', name: 'nickname', rule: { required: true } },
					{ control: 'text', name: 'legacy', disabled: true, default: 'kept' },
				],
			},
			{
				on: {
					fill: (name) => moved.push(`fill ${name}`),
					disable: (name) => moved.push(`disable ${name}`),
					enable: (name) => moved.push(`enable ${name}`),
				},
			},
		)

		expect(Array.from(form.disabled)).toStrictEqual(['legacy'])
		expect(form.errors.length).toBe(2)

		form.disable('nickname')
		expect(Array.from(form.disabled)).toStrictEqual(['nickname', 'legacy'])
		expect(form.errors.length).toBe(1)
		form.disable('nickname')

		form.fill('email', 'ada@example.com')
		form.invalidate('email', 'That address is already registered')
		expect(form.errors).toStrictEqual([
			{ field: 'email', message: 'That address is already registered' },
		])

		form.disable('email')
		expect(form.errors).toStrictEqual([])
		form.enable('email')
		expect(form.errors).toStrictEqual([
			{ field: 'email', message: 'That address is already registered' },
		])

		expect(() => form.disable(['email', 'nope'])).toThrow(
			expect.objectContaining({ code: 'FIELD' }),
		)
		expect(form.disabled.has('email')).toBe(false)

		form.clear()
		expect(Array.from(form.disabled)).toStrictEqual(['legacy'])
		expect(form.values).toStrictEqual({ legacy: 'kept' })
		expect(moved).toStrictEqual(['disable nickname', 'fill email', 'disable email', 'enable email'])
	})

	it('replaces the schema declarations with the supplied disabled set', () => {
		const schema: FormSchema = {
			fields: [
				{ control: 'text', name: 'card', rule: { required: true } },
				{ control: 'text', name: 'email', rule: { required: true } },
			],
		}

		expect(evaluateForm(schema, {}, { disabled: new Set(['card']) })).toStrictEqual([
			{ field: 'email', message: 'This field is required', rule: 'required' },
		])
		expect(
			evaluateForm(
				schema,
				{},
				{
					messages: { required: 'Needed' },
					disabled: new Set(['card']),
				},
			),
		).toStrictEqual([{ field: 'email', message: 'Needed', rule: 'required' }])
	})

	it('invalidates from outside and clears back to the defaults', () => {
		const form = createForm({
			fields: [
				{ control: 'text', name: 'email', rule: { required: true, email: true } },
				{
					control: 'select',
					name: 'plan',
					choices: [{ value: 'free', label: 'Free' }],
					default: 'free',
				},
			],
		})

		expect(form.baseline).toStrictEqual({ plan: 'free' })

		form.fill('email', 'ada@example.com')
		expect(form.valid).toBe(true)
		expect(form.dirty).toBe(true)
		expect(Array.from(extractChanges(form.values, form.baseline))).toStrictEqual(['email'])

		form.invalidate('email', 'That address is already registered')
		expect(form.errors).toStrictEqual([
			{ field: 'email', message: 'That address is already registered' },
		])
		expect(form.valid).toBe(false)

		form.fill('email', 'grace@example.com')
		expect(form.errors).toStrictEqual([])

		form.clear()
		expect(form.values).toStrictEqual({ plan: 'free' })
		expect(form.dirty).toBe(false)
	})

	it('resolves a parked answer from another task', async () => {
		const form = createForm({
			fields: [{ control: 'text', name: 'name', rule: { required: true } }],
		})
		const parked = form.answer

		form.fill('name', 'Ada')
		form.submit()

		await expect(parked).resolves.toStrictEqual({ name: 'Ada' })
	})

	it('rejects a parked answer when the form is abandoned', async () => {
		const abandoned = createForm({ fields: [{ control: 'text', name: 'name' }] })
		const pending = abandoned.answer

		abandoned.destroy()
		expect(abandoned.status).toBe('abandoned')

		await expect(pending).rejects.toSatisfy(
			(error: unknown) => isFormError(error) && error.code === 'ABANDONED',
		)
	})

	it('keeps a refused attempt open and commits only on the submit that passes', () => {
		const form = createForm({
			fields: [{ control: 'text', name: 'email', rule: { required: true, email: true } }],
		})

		expect(form.submit().success).toBe(false)
		expect(form.status).toBe('editing')
		expect(Array.from(form.touched)).toStrictEqual(['email'])

		form.fill('email', 'ada@example.com')

		const refused = form.values.email === 'ada@example.com'
		if (refused) form.invalidate('email', 'That address is already registered')
		expect(form.valid).toBe(false)
		expect(form.status).toBe('editing')

		form.fill('email', 'grace@example.com')
		expect(form.submit().success).toBe(true)
		expect(form.status).toBe('settled')
	})

	it('announces the events the guide lists, in order', () => {
		const seen: string[] = []
		const errors = createRecorder<[unknown, string]>()

		const form = createForm(
			{ fields: [{ control: 'text', name: 'email', rule: { required: true } }] },
			{
				on: {
					fill: (name, value) => seen.push(`fill ${name} ${String(value)}`),
					validate: (found) => seen.push(`validate ${found.length}`),
					submit: () => seen.push('submit'),
				},
				error: errors.handler,
			},
		)

		form.emitter.on('abandon', () => seen.push('abandon'))

		form.fill('email', 'ada@example.com')
		form.submit()

		expect(seen).toStrictEqual(['fill email ada@example.com', 'validate 0', 'submit'])
		expect(errors.count).toBe(0)
	})

	it('round-trips a schema through JSON exactly', () => {
		const schema: FormSchema = {
			name: 'signup',
			label: 'Sign up',
			groups: [{ name: 'account', label: 'Account' }],
			fields: [
				{ control: 'text', name: 'email', group: 'account', rule: { required: true, email: true } },
				{
					control: 'checkbox',
					name: 'topics',
					choices: [{ value: 'a', label: 'A' }],
					default: ['a'],
				},
			],
		}

		const wire = JSON.stringify(serializeForm(schema))
		const received = parseForm(JSON.parse(wire))

		expect(JSON.stringify(serializeForm(requireValue(received)))).toBe(wire)
		expect(parseForm({ fields: 'not a list' })).toBeUndefined()
	})

	it('coerces exactly the two wire shapes it documents', () => {
		const age: NumberField = { control: 'number', name: 'age' }
		const ok: ConfirmField = { control: 'confirm', name: 'ok' }
		const schema: FormSchema = { fields: [age, ok] }

		expect(parseValue(age, '42')).toBe(42)
		expect(parseValue(age, 'abc')).toBeUndefined()
		expect(parseValue(ok, 'true')).toBe(true)
		expect(parseValue(ok, 'yes')).toBeUndefined()

		expect(parseValues(schema, { age: '42', ok: 'true' })).toStrictEqual({ age: 42, ok: true })
		expect(parseValues(schema, { nope: '1' })).toBeUndefined()
	})

	it('answers the guard example the way the guide prints it', () => {
		expect(isFieldControl('datetime')).toBe(true)
		expect(isFieldControl('radio')).toBe(false)
		expect(isFormStatus('settled')).toBe(true)
		expect(isFieldValue(['a', 'b'])).toBe(true)
		expect(isFieldValue({})).toBe(false)
		expect(isFieldChoice({ value: 'a', label: 'A' })).toBe(true)
		expect(isFieldChoice({ value: 'a', label: 'A', colour: 'red' })).toBe(false)
		expect(isFieldRule({ required: true, minimum: 8 })).toBe(true)
		expect(isFormField({ control: 'text', name: 'email' })).toBe(true)
		expect(isFormField({ control: 'text' })).toBe(false)
		expect(isFormGroup({ name: 'account', label: 'Account' })).toBe(true)
		expect(isFormSchema({ fields: [{ control: 'text', name: 'a' }] })).toBe(true)
		expect(isFormValues({ a: 'b', c: 2 })).toBe(true)
		expect(isFieldError({ field: 'a', message: 'b', rule: 'required' })).toBe(true)
	})

	it('owns every clone the guide shows', () => {
		const topics = ['releases']
		const owned = cloneValue(topics)

		expect(owned === topics).toBe(false)
		expect(Object.isFrozen(owned)).toBe(true)
		expect(cloneValue('text')).toBe('text')

		expect(Object.isFrozen(cloneChoices([{ value: 'a', label: 'A' }]))).toBe(true)
		expect(Object.isFrozen(cloneFormField({ control: 'text', name: 'email' }))).toBe(true)
		expect(Object.isFrozen(cloneFormSchema({ fields: [{ control: 'text', name: 'email' }] }))).toBe(
			true,
		)
	})

	it('derives the same answers without a form', () => {
		const schema: FormSchema = {
			groups: [
				{ name: 'account', label: 'Account' },
				{ name: 'unused', label: 'Unused' },
			],
			fields: [
				{ control: 'text', name: 'email', group: 'account', default: 'ada@example.com' },
				{ control: 'confirm', name: 'terms', default: false },
				{ control: 'password', name: 'secret' },
			],
		}

		expect(computeDefaults(schema)).toStrictEqual({ email: 'ada@example.com', terms: false })
		expect(extractGroups(schema)).toStrictEqual([{ name: 'account', label: 'Account' }])
		expect(evaluateForm(schema, {})).toStrictEqual([])
		expect(appliesRule('number', 'step')).toBe(true)
		expect(matchesValue(['a'], ['a'])).toBe(true)
		expect(matchesValues({ topics: ['a'] }, { topics: ['a'] })).toBe(true)
	})

	it('codes each refusal the errors table names', () => {
		expect(() => createForm({ fields: [{ control: 'text', name: '' }] })).toThrow(
			expect.objectContaining({ code: 'SCHEMA' }),
		)

		const form = createForm({ fields: [{ control: 'number', name: 'age' }] })

		expect(() => form.fill('nope', 1)).toThrow(expect.objectContaining({ code: 'FIELD' }))
		expect(() => form.fill('age', 'twelve')).toThrow(expect.objectContaining({ code: 'CONTROL' }))
		expect(form.values).toStrictEqual({})
	})

	it('constructs the class the same way the factory does', () => {
		const form = new Form({
			fields: [{ control: 'text', name: 'email', rule: { required: true } }],
		})

		form.fill('email', 'ada@example.com')
		expect(form.submit().success).toBe(true)
	})
})

describe('README.md Usage fence', () => {
	it('executes its three value claims', async () => {
		const form = createForm({
			label: 'Sign up',
			fields: [
				{ control: 'text', name: 'email', label: 'Email', rule: { required: true, email: true } },
				{
					control: 'password',
					name: 'secret',
					label: 'Password',
					rule: { required: true, minimum: 12 },
				},
				{
					control: 'confirm',
					name: 'terms',
					label: 'I accept the terms',
					rule: { required: true },
				},
			],
		})
		const parked = form.answer

		form.fill({ email: 'ada@example.com', secret: 'correct horse battery' })
		expect(form.errors).toStrictEqual([
			{ field: 'terms', message: 'This field is required', rule: 'required' },
		])

		form.fill('terms', true)
		const result = form.submit()
		expect(result.success).toBe(true)
		await expect(parked).resolves.toStrictEqual({
			email: 'ada@example.com',
			secret: 'correct horse battery',
			terms: true,
		})
	})
})

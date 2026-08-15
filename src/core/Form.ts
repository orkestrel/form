import type { EmitterInterface } from '@orkestrel/emitter'
import type {
	FieldError,
	FieldRuleName,
	FieldValue,
	FormEventMap,
	FormField,
	FormInterface,
	FormOptions,
	FormResult,
	FormSchema,
	FormStatus,
	FormValues,
} from './types.js'
import { isArray, isString } from '@orkestrel/contract'
import { Emitter } from '@orkestrel/emitter'
import { cloneFormSchema, cloneValue } from './cloners.js'
import { FormError } from './errors.js'
import {
	auditSchema,
	computeDefaults,
	evaluateForm,
	matchesField,
	matchesValues,
} from './helpers.js'
import { isFormSchema } from './validators.js'

/**
 * A form: a schema, the answers given against it, and the errors they carry.
 *
 * @remarks
 * The form owns its schema, so a later edit to the schema the caller passed changes nothing here.
 *
 * `errors` is always current: it is recomputed at construction and after every mutation, and the
 * `validate` event fires exactly when that list's content changes. There is no separate check.
 *
 * `valid` and `dirty` are derived on read, never stored, so neither can drift from the answers.
 *
 * @example
 * ```ts
 * const form = new Form({
 * 	fields: [{ control: 'text', name: 'email', rule: { required: true, email: true } }],
 * })
 *
 * form.fill('email', 'ada@example.com')
 * const result = form.submit()
 * if (result.success) await form.answer
 * ```
 */
export class Form implements FormInterface {
	readonly #emitter: Emitter<FormEventMap>
	readonly #schema: FormSchema
	readonly #messages: Readonly<Partial<Record<FieldRuleName, string>>> | undefined
	readonly #baseline: FormValues
	readonly #values: Record<string, FieldValue>
	readonly #touched = new Set<string>()
	readonly #invalidations = new Map<string, string>()
	readonly #resolvers = Promise.withResolvers<FormValues>()
	#errors: readonly FieldError[] = Object.freeze([])
	#status: FormStatus = 'editing'
	#emissions = 0
	#pending = false

	/**
	 * Open a form against a schema.
	 *
	 * @param schema - The form to ask. It is copied, and the copy is what the form asks.
	 * @param options - The form's settings.
	 * @throws A {@link FormError} coded `SCHEMA` when the schema is malformed, `FIELD` when
	 *   `options.values` names a field the schema does not declare, and `CONTROL` when a seeded
	 *   value is one its field's control cannot hold.
	 */
	constructor(schema: FormSchema, options?: FormOptions) {
		const problems = isFormSchema(schema)
			? auditSchema(schema)
			: ['The schema is not a form schema']

		if (problems.length > 0) {
			throw new FormError('SCHEMA', `The form schema is unusable: ${problems.join('; ')}`, {
				problems: [...problems],
			})
		}

		this.#schema = cloneFormSchema(schema)
		this.#messages =
			options?.messages === undefined ? undefined : Object.freeze({ ...options.messages })

		const baseline: Record<string, FieldValue> = {}

		for (const [name, value] of Object.entries(computeDefaults(this.#schema))) {
			Object.defineProperty(baseline, name, {
				value,
				enumerable: true,
				configurable: true,
				writable: true,
			})
		}

		for (const [name, value] of Object.entries(options?.values ?? {})) {
			const field = this.#requireField(name)

			if (!matchesField(field, value)) {
				throw new FormError(
					'CONTROL',
					`The ${field.control} field "${name}" cannot hold that value`,
					{ field: name, control: field.control },
				)
			}

			Object.defineProperty(baseline, name, {
				value: cloneValue(value),
				enumerable: true,
				configurable: true,
				writable: true,
			})
		}

		this.#baseline = Object.freeze(baseline)
		this.#values = {}
		for (const [name, value] of Object.entries(baseline)) {
			Object.defineProperty(this.#values, name, {
				value,
				enumerable: true,
				configurable: true,
				writable: true,
			})
		}
		// Nobody has to await `answer`. Without a rejection handler of its own, destroying an
		// unawaited form would reject a promise no one is watching and take the host down with it.
		this.#resolvers.promise.catch(() => undefined)
		// FormOptions carries `on` and `error` exactly as EmitterOptions declares them, so passing
		// the options through threads both without rebuilding a record `exactOptionalPropertyTypes`
		// would then reject for its explicit `undefined` members.
		this.#emitter = new Emitter<FormEventMap>(options)
		this.#evaluate()
	}

	/** The form's event emitter. */
	get emitter(): EmitterInterface<FormEventMap> {
		return this.#emitter
	}

	/** The schema this form asks, owned and frozen. */
	get schema(): FormSchema {
		return this.#schema
	}

	/** The answers held right now. */
	get values(): FormValues {
		const values: Record<string, FieldValue> = {}

		for (const name of Object.keys(this.#values)) {
			if (Object.hasOwn(this.#values, name)) {
				Object.defineProperty(values, name, {
					value: this.#values[name],
					enumerable: true,
					configurable: true,
					writable: true,
				})
			}
		}

		return Object.freeze(values)
	}

	/** Every error the current answers carry. */
	get errors(): readonly FieldError[] {
		return this.#errors
	}

	/** The names of the fields somebody has visited. */
	get touched(): ReadonlySet<string> {
		return new Set(this.#touched)
	}

	/** Where the form sits in its life. */
	get status(): FormStatus {
		return this.#status
	}

	/** Whether the current answers pass every rule. */
	get valid(): boolean {
		return this.#errors.length === 0
	}

	/** Whether any answer has moved since the form opened. */
	get dirty(): boolean {
		return !matchesValues(this.values, this.#baseline)
	}

	/**
	 * The answers, once the form settles.
	 *
	 * @remarks
	 * It resolves with the submitted values on the first valid submit, and rejects with a
	 * {@link FormError} coded `ABANDONED` when the form is destroyed before settling.
	 */
	get answer(): Promise<FormValues> {
		return this.#resolvers.promise
	}

	/**
	 * Find one field by name.
	 *
	 * @param name - The field's name.
	 * @returns The field, or `undefined` when the schema declares no such name.
	 */
	field(name: string): FormField | undefined {
		return this.#schema.fields.find((field) => field.name === name)
	}

	/**
	 * Answer several fields at once.
	 *
	 * @param values - The answers to write, each keyed by its field name.
	 */
	fill(values: FormValues): void
	/**
	 * Answer one field.
	 *
	 * @param name - The field's name.
	 * @param value - The answer to write, or `undefined` to clear it.
	 */
	fill(name: string, value: FieldValue | undefined): void
	/**
	 * Answer one field or several.
	 *
	 * @param input - One field's name, or the answers to write keyed by field name.
	 * @param value - The answer to write when `input` names one field.
	 * @throws A {@link FormError} coded `SETTLED` or `ABANDONED` when the form has ended, `FIELD`
	 *   when a name is not declared, and `CONTROL` when a value is one its control cannot hold.
	 *   Every answer is checked before any is written, so a refused write changes nothing.
	 */
	fill(input: FormValues | string, value?: FieldValue): void {
		this.#gate()

		const entries: ReadonlyArray<readonly [string, FieldValue | undefined]> = isString(input)
			? [[input, value]]
			: Object.entries(input)

		for (const [name, answer] of entries) {
			const field = this.#requireField(name)

			if (answer !== undefined && !matchesField(field, answer)) {
				throw new FormError(
					'CONTROL',
					`The ${field.control} field "${name}" cannot hold that value`,
					{ field: name, control: field.control },
				)
			}
		}

		const moved: string[] = []

		for (const [name, answer] of entries) {
			if (this.#differs(name, answer)) moved.push(name)
			if (answer === undefined) delete this.#values[name]
			else {
				Object.defineProperty(this.#values, name, {
					value: cloneValue(answer),
					enumerable: true,
					configurable: true,
					writable: true,
				})
			}
			this.#invalidations.delete(name)
		}

		this.#emitFill(moved)
	}

	/**
	 * Record that somebody has visited a field.
	 *
	 * @param name - The field's name.
	 * @throws A {@link FormError} coded `SETTLED` or `ABANDONED` when the form has ended, and
	 *   `FIELD` when the schema declares no such name.
	 */
	touch(name: string): void {
		this.#gate()
		this.#requireField(name)
		this.#touched.add(name)
	}

	/**
	 * Fail a field from outside, for what the rules cannot see.
	 *
	 * @param name - The field's name.
	 * @param message - What to tell the person.
	 * @remarks
	 * One field holds one external failure: a second call replaces the first. The failure lasts
	 * until that field is filled again or the form is cleared.
	 * @throws A {@link FormError} coded `SETTLED` or `ABANDONED` when the form has ended, and
	 *   `FIELD` when the schema declares no such name.
	 */
	invalidate(name: string, message: string): void {
		this.#gate()
		this.#requireField(name)
		this.#invalidations.set(name, message)
		if (this.#evaluate()) this.#emitter.emit('validate', this.#errors)
	}

	/**
	 * Check every answer and settle the form when they all pass.
	 *
	 * @returns The values on success, or every error that stopped them.
	 * @remarks
	 * A failed submit marks every enabled field touched, so a renderer can show the errors the
	 * person has not reached yet. A disabled field is neither checked nor submitted.
	 * @throws A {@link FormError} coded `SETTLED` or `ABANDONED` when the form has ended.
	 */
	submit(): FormResult {
		this.#gate()

		const changed = this.#evaluate()
		const stopped = this.#errors.length > 0

		if (stopped) {
			for (const field of this.#schema.fields) {
				if (field.disabled !== true) this.#touched.add(field.name)
			}
		}

		if (changed) this.#emitter.emit('validate', this.#errors)
		if (stopped) return { success: false, error: this.#errors }

		const answers = this.#snapshot()
		this.#status = 'settled'
		this.#resolvers.resolve(answers)
		this.#emitter.emit('submit', answers)

		return { success: true, value: answers }
	}

	/**
	 * Return every answer to the schema's defaults, leaving the form open.
	 *
	 * @throws A {@link FormError} coded `SETTLED` or `ABANDONED` when the form has ended.
	 */
	clear(): void {
		this.#gate()

		for (const name of Object.keys(this.#values)) delete this.#values[name]
		for (const [name, value] of Object.entries(this.#baseline)) {
			Object.defineProperty(this.#values, name, {
				value,
				enumerable: true,
				configurable: true,
				writable: true,
			})
		}

		this.#touched.clear()
		this.#invalidations.clear()

		const changed = this.#evaluate()

		this.#emitter.emit('clear')
		if (changed) this.#emitter.emit('validate', this.#errors)
	}

	/**
	 * Tear the form down, abandoning it when it has not settled.
	 *
	 * @remarks
	 * Destroying twice does nothing the second time. A settled form keeps its `settled` status and
	 * announces nothing. Every getter keeps answering afterwards; every write is refused.
	 */
	destroy(): void {
		if (this.#pending || this.#emitter.destroyed) return

		this.#pending = true
		if (this.#emissions === 0) this.#teardown()
	}

	// Refuse a write to a form that settled before considering whether teardown was requested.
	#gate(): void {
		if (this.#status === 'settled') {
			throw new FormError('SETTLED', 'The form has settled and cannot change')
		}
		if (this.#status === 'abandoned' || this.#pending || this.#emitter.destroyed) {
			throw new FormError('ABANDONED', 'The form was abandoned and cannot change')
		}
	}

	#requireField(name: string): FormField {
		const field = this.field(name)

		if (field === undefined) {
			throw new FormError('FIELD', `The schema declares no field named "${name}"`, {
				field: name,
			})
		}

		return field
	}

	// Recompute the whole error list and cache it, reporting whether its content moved.
	#evaluate(): boolean {
		const errors: FieldError[] = [...evaluateForm(this.#schema, this.values, this.#messages)]

		for (const [field, message] of this.#invalidations) {
			if (this.field(field)?.disabled !== true) {
				errors.push(Object.freeze({ field, message }))
			}
		}

		const previous = this.#errors
		const next: readonly FieldError[] = Object.freeze(errors)
		this.#errors = next

		return (
			next.length !== previous.length ||
			next.some((error, index) => {
				const before = previous[index]
				return (
					before === undefined ||
					before.field !== error.field ||
					before.message !== error.message ||
					before.rule !== error.rule
				)
			})
		)
	}

	#differs(name: string, value: FieldValue | undefined): boolean {
		const current = Object.hasOwn(this.#values, name) ? this.#values[name] : undefined

		if (value === undefined) return current !== undefined
		if (current === undefined) return true

		if (isArray(current) || isArray(value)) {
			return (
				!isArray(current) ||
				!isArray(value) ||
				current.length !== value.length ||
				current.some((entry, index) => entry !== value[index])
			)
		}

		return current !== value
	}

	// The answers a submit hands over: every enabled field somebody has answered.
	#snapshot(): FormValues {
		const answers: Record<string, FieldValue> = {}

		for (const field of this.#schema.fields) {
			const value = Object.hasOwn(this.#values, field.name) ? this.#values[field.name] : undefined
			if (field.disabled !== true && value !== undefined) {
				Object.defineProperty(answers, field.name, {
					value,
					enumerable: true,
					configurable: true,
					writable: true,
				})
			}
		}

		return Object.freeze(answers)
	}

	#emitFill(names: readonly string[]): void {
		this.#emissions += 1

		try {
			for (const name of names) {
				const value = Object.hasOwn(this.#values, name) ? this.#values[name] : undefined
				this.#emitter.emit('fill', name, value)
			}
			if (this.#evaluate()) this.#emitter.emit('validate', this.#errors)
		} finally {
			this.#emissions -= 1
			if (this.#emissions === 0 && this.#pending) this.#teardown()
		}
	}

	#teardown(): void {
		if (this.#status === 'editing') {
			this.#status = 'abandoned'
			this.#resolvers.reject(new FormError('ABANDONED', 'The form was destroyed before it settled'))
			this.#emitter.emit('abandon')
		}

		this.#emitter.destroy()
	}
}

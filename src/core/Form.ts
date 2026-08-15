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
import { isString } from '@orkestrel/contract'
import { Emitter } from '@orkestrel/emitter'
import { cloneFormSchema, cloneValue } from './cloners.js'
import { FormError } from './errors.js'
import {
	auditSchema,
	computeDefaults,
	evaluateForm,
	matchesField,
	matchesValue,
	matchesValues,
} from './helpers.js'
import { isFormSchema } from './validators.js'

/**
 * A form: a schema, the answers given against it, and the errors they carry.
 *
 * @remarks
 * The form owns its schema, so a later edit to the schema the caller passed changes nothing here.
 *
 * `errors` is recomputed at construction and after every mutation whose evaluation completes,
 * and the `validate` event fires exactly when that list's content changes. A throwing custom
 * validator escapes after any preceding state changes and leaves the prior error list in place.
 * There is no separate check.
 *
 * `valid` and `dirty` are derived on read from the error list and answers respectively, never
 * stored.
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
	readonly #disabled = new Map<string, boolean>()
	readonly #invalidations = new Map<string, string>()
	readonly #resolvers = Promise.withResolvers<FormValues>()
	#errors: readonly FieldError[] = Object.freeze([])
	#status: FormStatus = 'editing'
	#batchDepth = 0
	#evaluation = 0
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

		// Object.keys supplies the own enumerable answer population used here and by clear().
		for (const name of Object.keys(this.#values)) {
			Object.defineProperty(values, name, {
				value: this.#values[name],
				enumerable: true,
				configurable: true,
				writable: true,
			})
		}

		return Object.freeze(values)
	}

	/** The answers the form opened with. */
	get baseline(): FormValues {
		return this.#baseline
	}

	/** Every error the last completed evaluation produced. */
	get errors(): readonly FieldError[] {
		return this.#errors
	}

	/** The names of the fields somebody has visited. */
	get touched(): ReadonlySet<string> {
		return new Set(this.#touched)
	}

	/** The names of the fields currently out of the form. */
	get disabled(): ReadonlySet<string> {
		const disabled = new Set<string>()

		for (const field of this.#schema.fields) {
			if ((this.#disabled.get(field.name) ?? field.disabled === true) === true) {
				disabled.add(field.name)
			}
		}

		return disabled
	}

	/** Where the form sits in its life. */
	get status(): FormStatus {
		return this.#status
	}

	/** Whether the last completed evaluation found no error. */
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
	 * {@link FormError} coded `ABANDONED` when teardown abandons the form before it settles.
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

		this.#batch(() => {
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

			for (const name of moved) {
				const answer = Object.hasOwn(this.#values, name) ? this.#values[name] : undefined
				this.#emitter.emit('fill', name, answer)
			}
			if (this.#evaluate()) this.#emitter.emit('validate', this.#errors)
		})
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
		this.#batch(() => {
			this.#invalidations.set(name, message)
			if (this.#evaluate()) this.#emitter.emit('validate', this.#errors)
		})
	}

	/** Take every field out of the form. */
	disable(): void
	/**
	 * Take one field out of the form.
	 *
	 * @param name - The field's name.
	 */
	disable(name: string): void
	/**
	 * Take several fields out of the form.
	 *
	 * @param names - The field names.
	 */
	disable(names: readonly string[]): void
	/**
	 * Take one or more fields out of the form.
	 *
	 * @param input - One field name, several names, or absence to select every field.
	 * @throws A {@link FormError} coded `SETTLED` or `ABANDONED` when the form has ended, and
	 *   `FIELD` when the schema declares no requested name. Every name is checked before any field
	 *   moves.
	 */
	disable(input?: string | readonly string[]): void {
		this.#gate()
		this.#change(input, true)
	}

	/** Put every field back into the form. */
	enable(): void
	/**
	 * Put one field back into the form.
	 *
	 * @param name - The field's name.
	 */
	enable(name: string): void
	/**
	 * Put several fields back into the form.
	 *
	 * @param names - The field names.
	 */
	enable(names: readonly string[]): void
	/**
	 * Put one or more fields back into the form.
	 *
	 * @param input - One field name, several names, or absence to select every field.
	 * @throws A {@link FormError} coded `SETTLED` or `ABANDONED` when the form has ended, and
	 *   `FIELD` when the schema declares no requested name. Every name is checked before any field
	 *   moves.
	 */
	enable(input?: string | readonly string[]): void {
		this.#gate()
		this.#change(input, false)
	}

	/**
	 * Check every answer and settle the form when they all pass.
	 *
	 * @returns The values on success, or every error that stopped them.
	 * @remarks
	 * A failed submit marks every enabled field touched, so a renderer can show the errors the
	 * person has not reached yet. A disabled field is neither checked nor submitted. When a changed
	 * evaluation notifies listeners, submit evaluates once more after those listeners return, and
	 * three rules then decide. Listener work that settled the form wins: that settlement is what this
	 * call returns, with no further evaluation, resolution, or `submit` emission. An evaluation that
	 * already failed refuses with the list it checked, even when a listener repaired or disabled the
	 * field that failed. An evaluation that passed decides from the state the drain left, which is
	 * why one further evaluation bounds the drain rather than a fixpoint loop.
	 * @throws A {@link FormError} coded `SETTLED` or `ABANDONED` when the form has ended.
	 */
	submit(): FormResult {
		this.#gate()

		return this.#batch(() => {
			const changed = this.#evaluate()
			const checked = this.#errors
			const failed = checked.length > 0
			const evaluation = this.#evaluation

			if (changed) {
				this.#emitter.emit('validate', this.#errors)
				const settlement = this.#readSettlement()
				if (settlement !== undefined) return settlement
				if (this.#evaluation !== evaluation && this.#evaluate()) {
					this.#emitter.emit('validate', this.#errors)
					const drained = this.#readSettlement()
					if (drained !== undefined) return drained
				}
			}

			const errors = failed ? checked : this.#errors
			const stopped = errors.length > 0

			if (stopped) {
				const disabled = this.disabled
				for (const field of this.#schema.fields) {
					if (!disabled.has(field.name)) this.#touched.add(field.name)
				}
			}

			if (stopped) return { success: false, error: errors }

			const answers = this.#snapshot()
			this.#status = 'settled'
			this.#resolvers.resolve(answers)
			this.#emitter.emit('submit', answers)

			return { success: true, value: answers }
		})
	}

	/**
	 * Return every answer to the ones the form opened with: the schema's defaults, overlaid with
	 * any seeded `values`. Reset the runtime disabled state to the schema's declarations.
	 *
	 * @throws A {@link FormError} coded `SETTLED` or `ABANDONED` when the form has ended.
	 */
	clear(): void {
		this.#gate()

		this.#batch(() => {
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
			this.#disabled.clear()
			this.#invalidations.clear()

			const changed = this.#evaluate()

			this.#emitter.emit('clear')
			if (changed) this.#emitter.emit('validate', this.#errors)
		})
	}

	/**
	 * Tear the form down, abandoning it when it has not settled.
	 *
	 * @remarks
	 * Destroying twice does nothing the second time. A settled form keeps its `settled` status and
	 * announces nothing. A request from inside a listener defers teardown until the outermost
	 * mutation batch closes, so an in-flight settlement can win and leave the form `settled` rather
	 * than `abandoned`. Every getter keeps answering afterwards; every write is refused.
	 */
	destroy(): void {
		if (this.#pending) return

		this.#pending = true
		if (this.#batchDepth === 0) this.#teardown()
	}

	// Refuse a write to a form that settled before considering whether teardown was requested.
	#gate(): void {
		if (this.#status === 'settled') {
			throw new FormError('SETTLED', 'The form has settled and cannot change')
		}
		if (this.#status === 'abandoned' || this.#pending) {
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

	#change(input: string | readonly string[] | undefined, disabled: boolean): void {
		const names = new Set(
			input === undefined
				? this.#schema.fields.map((field) => field.name)
				: isString(input)
					? [input]
					: input,
		)

		for (const name of names) this.#requireField(name)

		const moved: string[] = []
		for (const field of this.#schema.fields) {
			const active = names.has(field.name)
			const current = this.#disabled.get(field.name) ?? field.disabled === true
			if (active && current !== disabled) moved.push(field.name)
		}
		if (moved.length === 0) return

		this.#batch(() => {
			for (const name of names) this.#disabled.set(name, disabled)

			for (const name of moved) {
				if (disabled) this.#emitter.emit('disable', name)
				else this.#emitter.emit('enable', name)
			}

			if (this.#evaluate()) this.#emitter.emit('validate', this.#errors)
		})
	}

	// Recompute the whole error list and cache it, reporting whether its content moved.
	#evaluate(): boolean {
		const disabled = this.disabled
		const options =
			this.#messages === undefined ? { disabled } : { messages: this.#messages, disabled }
		const errors: FieldError[] = [...evaluateForm(this.#schema, this.values, options)]

		for (const [field, message] of this.#invalidations) {
			if (!disabled.has(field)) {
				errors.push(Object.freeze({ field, message }))
			}
		}

		const previous = this.#errors
		const next: readonly FieldError[] = Object.freeze(errors)
		this.#errors = next

		const changed =
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
		this.#evaluation += 1
		return changed
	}

	#differs(name: string, value: FieldValue | undefined): boolean {
		const current = Object.hasOwn(this.#values, name) ? this.#values[name] : undefined

		if (value === undefined) return current !== undefined
		if (current === undefined) return true
		return !matchesValue(current, value)
	}

	#readSettlement(): FormResult | undefined {
		if (this.#status === 'settled') return { success: true, value: this.#snapshot() }
		if (this.#status === 'abandoned') this.#gate()
		return undefined
	}

	// The answers a submit hands over: every enabled field somebody has answered.
	#snapshot(): FormValues {
		const answers: Record<string, FieldValue> = {}
		const disabled = this.disabled

		for (const field of this.#schema.fields) {
			const value = Object.hasOwn(this.#values, field.name) ? this.#values[field.name] : undefined
			if (!disabled.has(field.name) && value !== undefined) {
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

	#batch<T>(callback: () => T): T {
		this.#batchDepth += 1

		try {
			return callback()
		} finally {
			this.#batchDepth -= 1
			if (this.#batchDepth === 0 && this.#pending) this.#teardown()
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

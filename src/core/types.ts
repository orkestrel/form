import type { JSONRecord, Result } from '@orkestrel/contract'
import type { EmitterErrorHandler, EmitterHooks, EmitterInterface } from '@orkestrel/emitter'

/**
 * The control a field presents to the person answering it.
 *
 * @remarks
 * The control is the discriminant of every {@link FormField} variant, so choosing it fixes
 * which options that field accepts and which {@link FieldValue} it holds.
 *
 * Three members need saying out loud. `confirm` is a single on/off box holding a boolean, so
 * a lone browser checkbox is a `confirm`. `checkbox` is the multi-choice group holding the
 * checked values as a list, never a single box. `datetime` is the browser's `datetime-local`:
 * a wall-clock date and time carrying no zone.
 *
 * @example
 * ```ts
 * const control: FieldControl = 'select'
 * ```
 */
export type FieldControl =
	| 'text'
	| 'editor'
	| 'password'
	| 'number'
	| 'date'
	| 'time'
	| 'datetime'
	| 'color'
	| 'confirm'
	| 'select'
	| 'checkbox'
	| 'file'

/**
 * Every value a field can hold.
 *
 * @remarks
 * The variant follows the control: text-like controls hold a `string`, `number` holds a
 * `number`, `confirm` holds a `boolean`, and `checkbox` holds its checked values as a
 * `readonly string[]`.
 */
export type FieldValue = string | number | boolean | readonly string[]

/**
 * A form's answers, keyed by field name.
 *
 * @remarks
 * A name with no key is a field nobody has answered. A disabled field's value may appear so a
 * renderer can show it, but the value is never evaluated or submitted.
 *
 * @example
 * ```ts
 * const values: FormValues = { email: 'ada@example.com', terms: true }
 * ```
 */
export type FormValues = Readonly<Record<string, FieldValue>>

/**
 * Where a form sits in its life.
 *
 * @remarks
 * A form opens `editing`, turns `settled` on its first valid submit, and turns `abandoned`
 * when it is destroyed before settling. Both end states are terminal, and a write to a form
 * in either one is refused. A destroy requested while a mutation batch is open is recorded,
 * refuses every subsequent write immediately, and defers teardown until the outermost batch
 * closes. The batch outcome wins: a batch that settles the form leaves it `settled`, resolves
 * `answer`, and emits no `abandon`. Teardown never advances into, aborts, or rolls back the
 * batch. The pending request is private, unnamed state and adds no fourth status.
 */
export type FormStatus = 'editing' | 'settled' | 'abandoned'

/**
 * The machine-readable code a form error carries.
 *
 * @remarks
 * `SCHEMA` rejects a malformed schema. `FIELD` names a field the schema does not declare.
 * `CONTROL` reports a value the field's control cannot hold. `SETTLED` and `ABANDONED`
 * refuse a write to a form that has already ended.
 */
export type FormErrorCode = 'SCHEMA' | 'FIELD' | 'CONTROL' | 'SETTLED' | 'ABANDONED'

/**
 * One option a `select` or `checkbox` field offers.
 *
 * @remarks
 * `value` is what the form stores and `label` is what the person reads. `help` explains the
 * option, and `disabled` shows it while refusing its value at every input door, including
 * seeded values.
 */
export interface FieldChoice {
	readonly value: string
	readonly label: string
	readonly help?: string
	readonly disabled?: boolean
}

/**
 * Check one value against the whole form.
 *
 * @remarks
 * It runs after every named rule, and it runs on an absent value as well as a present one. That
 * is what makes a rule such as "required once the sibling says yes" expressible, and it means an
 * unanswered field can carry both a `required` message and this validator's own.
 *
 * @param value - The value the field currently holds, or `undefined` when nobody has answered it.
 * @param values - Every answer the form holds, so a rule can read its siblings.
 * @returns `true` when the value passes, or the message explaining why it failed.
 * @throws The validator's own thrown value escapes the mutation call unchanged. When a form
 *   mutation has already changed state, the throw leaves those changes beside the error list
 *   from before that mutation. An invalidation can therefore be recorded without appearing in
 *   `errors`, and a clear can reset state without emitting `clear`. Form-owned refusals use
 *   {@link FormError} instead.
 * @example
 * ```ts
 * const matches: FieldValidator = (value, values) =>
 * 	value === values.password ? true : 'Both passwords must match'
 * ```
 */
export type FieldValidator = (value: FieldValue | undefined, values: FormValues) => true | string

/**
 * The constraints one field's value must satisfy.
 *
 * @remarks
 * `minimum` and `maximum` measure whatever the control makes countable: characters for
 * `text`, `editor`, and `password`; magnitude for `number`; chronology for `date`, `time`,
 * and `datetime`, whose operand is a string written in that control's own format; and the
 * number of selections for `checkbox` and `file`.
 *
 * `step` is the interval a numeric value must land on. `pattern` is regular-expression
 * source. `email`, `url`, `integer`, and `alphanumeric` each assert one shape over the whole
 * value. `custom` runs last and is the only rule that sees the rest of the form.
 *
 * @example
 * ```ts
 * const rule: FieldRule = { required: true, minimum: 8, pattern: '\\d' }
 * ```
 */
export interface FieldRule {
	readonly required?: boolean
	readonly minimum?: number | string
	readonly maximum?: number | string
	readonly step?: number
	readonly pattern?: string
	readonly email?: boolean
	readonly url?: boolean
	readonly integer?: boolean
	readonly alphanumeric?: boolean
	readonly custom?: FieldValidator
}

/**
 * Every rule that reports its failure by name.
 *
 * @remarks
 * `custom` is excluded because it supplies its own message, so nothing keyed by a rule name
 * would ever be read for it. {@link FormOptions.messages} is keyed by this name.
 */
export type FieldRuleName = Exclude<keyof FieldRule, 'custom'>

/**
 * One failed check against one field.
 *
 * @remarks
 * `rule` names the constraint that failed. It is absent when the message came from a
 * {@link FieldRule.custom} validator or from {@link FormInterface.invalidate}, because
 * neither failure belongs to a named rule.
 */
export interface FieldError {
	readonly field: string
	readonly message: string
	readonly rule?: FieldRuleName
}

/**
 * What every field carries, whatever its control.
 *
 * @remarks
 * `name` keys the field in {@link FormValues} and `group` names a {@link FormGroup}.
 *
 * The three visibility switches differ in what they remove. `hidden` keeps the field out of
 * the rendered form, `locked` renders it unwritable, and both are still validated and still
 * submitted. `disabled` takes the field out of the form entirely: it is neither validated nor
 * submitted. It is the field's declared, opening state; {@link FormInterface.disabled} is the
 * current fact, because a live form can move a field either way.
 *
 * `meta` is a bounded JSON carrier for whatever the schema declines to model. Evaluation never
 * reads it, no rule sees it, and it round-trips verbatim through serialization. This package
 * defines no key in it, so every key belongs to the host.
 */
export interface FieldBase {
	readonly name: string
	readonly label?: string
	readonly help?: string
	readonly group?: string
	readonly hidden?: boolean
	readonly disabled?: boolean
	readonly locked?: boolean
	readonly rule?: FieldRule
	readonly meta?: JSONRecord
}

/** A single line of text. */
export interface TextField extends FieldBase {
	readonly control: 'text'
	readonly default?: string
	readonly placeholder?: string
}

/** Text over many lines. */
export interface EditorField extends FieldBase {
	readonly control: 'editor'
	readonly default?: string
	readonly placeholder?: string
}

/**
 * A secret, obscured as it is typed.
 *
 * @remarks
 * It carries no `default` deliberately: a seeded secret is a secret written down. `mask` is
 * the character the control repeats in place of the text.
 */
export interface PasswordField extends FieldBase {
	readonly control: 'password'
	readonly mask?: string
}

/** A number. */
export interface NumberField extends FieldBase {
	readonly control: 'number'
	readonly default?: number
	readonly placeholder?: string
}

/** A calendar date, held as the control's own string. */
export interface DateField extends FieldBase {
	readonly control: 'date'
	readonly default?: string
}

/** A time of day, held as the control's own string. */
export interface TimeField extends FieldBase {
	readonly control: 'time'
	readonly default?: string
}

/** A date and a time of day together, with no zone, held as the control's own string. */
export interface DatetimeField extends FieldBase {
	readonly control: 'datetime'
	readonly default?: string
}

/** A color, held as the control's own string. */
export interface ColorField extends FieldBase {
	readonly control: 'color'
	readonly default?: string
}

/** A single on/off box, holding a boolean. */
export interface ConfirmField extends FieldBase {
	readonly control: 'confirm'
	readonly default?: boolean
}

/**
 * One choice out of a list.
 *
 * @remarks
 * `open` admits a value the list does not offer, which is what turns a closed menu into a
 * suggestion list.
 */
export interface SelectField extends FieldBase {
	readonly control: 'select'
	readonly choices: readonly FieldChoice[]
	readonly default?: string
	readonly open?: boolean
}

/**
 * Any number of choices out of a list, holding the checked values.
 *
 * @remarks
 * A field offering one box that means yes or no is a {@link ConfirmField}, not a one-choice
 * checkbox.
 */
export interface CheckboxField extends FieldBase {
	readonly control: 'checkbox'
	readonly choices: readonly FieldChoice[]
	readonly default?: readonly string[]
}

/**
 * One or more files.
 *
 * @remarks
 * `accept` lists the media types and extensions the control offers, in the form the host
 * expects.
 */
export interface FileField extends FieldBase {
	readonly control: 'file'
	readonly accept?: readonly string[]
	readonly multiple?: boolean
}

/**
 * Any field a schema can declare.
 *
 * @remarks
 * The union discriminates on `control`, so narrowing on that member reaches each variant's
 * own options.
 *
 * @example
 * ```ts
 * function choices(field: FormField): readonly FieldChoice[] {
 * 	return field.control === 'select' || field.control === 'checkbox' ? field.choices : []
 * }
 * ```
 */
export type FormField =
	| TextField
	| EditorField
	| PasswordField
	| NumberField
	| DateField
	| TimeField
	| DatetimeField
	| ColorField
	| ConfirmField
	| SelectField
	| CheckboxField
	| FileField

/**
 * A named section of a form.
 *
 * @remarks
 * A field joins a group through {@link FieldBase.group}. Grouping arranges the form and
 * changes no answer.
 */
export interface FormGroup {
	readonly name: string
	readonly label: string
	readonly help?: string
}

/**
 * Everything a form asks.
 *
 * @remarks
 * `fields` is the schema's only required member, and the order it declares is the order the
 * form presents. `name`, `label`, and `help` describe the form itself.
 *
 * @example
 * ```ts
 * const schema: FormSchema = {
 * 	label: 'Sign up',
 * 	fields: [
 * 		{ control: 'text', name: 'email', label: 'Email', rule: { required: true, email: true } },
 * 		{ control: 'confirm', name: 'terms', label: 'I accept the terms' },
 * 	],
 * }
 * ```
 */
export interface FormSchema {
	readonly name?: string
	readonly label?: string
	readonly help?: string
	readonly groups?: readonly FormGroup[]
	readonly fields: readonly FormField[]
}

/**
 * What a submit answers with: the values, or every error that stopped them.
 *
 * @example
 * ```ts
 * const result: FormResult = form.submit()
 * const email = result.success ? result.value.email : undefined
 * ```
 */
export type FormResult = Result<FormValues, readonly FieldError[]>

/**
 * Everything a form announces.
 *
 * @remarks
 * `fill` carries the field that changed and its new value, where `undefined` is the value
 * being cleared. `validate` carries the errors a check produced, empty when it found none.
 * `disable` and `enable` each carry one field, and fire once per field whose state actually
 * moved, in the order the schema declares them. `submit` fires only on a submit that passed.
 * `clear` and `abandon` are signals.
 */
export type FormEventMap = {
	readonly fill: readonly [name: string, value: FieldValue | undefined]
	readonly validate: readonly [errors: readonly FieldError[]]
	readonly disable: readonly [name: string]
	readonly enable: readonly [name: string]
	readonly submit: readonly [values: FormValues]
	readonly clear: readonly []
	readonly abandon: readonly []
}

/**
 * How to check a schema against a set of answers.
 *
 * @param options - The evaluation's settings.
 * @remarks
 * `messages` replaces the default message of a rule, keyed by {@link FieldRuleName}.
 *
 * `disabled` names the fields to leave out of the check. It replaces the schema's own
 * {@link FieldBase.disabled} declarations rather than adding to them, because a live form's
 * answer to which fields are in play is {@link FormInterface.disabled}, and a form always
 * supplies that set.
 *
 * @example
 * ```ts
 * const options: EvaluationOptions = {
 * 	messages: { required: 'This one is needed' },
 * 	disabled: new Set(['nickname']),
 * }
 * ```
 */
export interface EvaluationOptions {
	readonly messages?: Readonly<Partial<Record<FieldRuleName, string>>>
	readonly disabled?: ReadonlySet<string>
}

/**
 * How to open a form.
 *
 * @param options - The form's settings.
 * @remarks
 * `on` wires listeners at construction and `error` receives any throw from one of them.
 * `values` seeds the answers, overriding each field's declared default. `messages` replaces
 * the default message of a rule, keyed by {@link FieldRuleName}.
 *
 * @example
 * ```ts
 * const options: FormOptions = {
 * 	values: { email: 'ada@example.com' },
 * 	messages: { required: 'This one is needed' },
 * 	on: { submit: (values) => save(values) },
 * }
 * ```
 */
export interface FormOptions {
	readonly on?: EmitterHooks<FormEventMap>
	readonly error?: EmitterErrorHandler
	readonly values?: FormValues
	readonly messages?: Readonly<Partial<Record<FieldRuleName, string>>>
}

/**
 * A form: a schema, the answers given against it, and the errors they carry.
 *
 * @remarks
 * `valid` is true when the last completed evaluation found no error, and `dirty` is true once
 * an answer differs from the one the form opened with. Both are derived, never stored.
 *
 * `touched` holds the fields somebody has visited, which is what lets a renderer withhold an
 * error until the person has had their turn at it.
 *
 * @example
 * ```ts
 * form.fill('email', 'ada@example.com')
 * const result = form.submit()
 * if (result.success) await form.answer
 * ```
 */
export interface FormInterface {
	/** The form's event emitter. */
	readonly emitter: EmitterInterface<FormEventMap>
	/** The schema this form asks. */
	readonly schema: FormSchema
	/** The answers held right now. */
	readonly values: FormValues
	/**
	 * The answers the form opened with: the schema's defaults, overlaid with any seeded values.
	 *
	 * @remarks
	 * It is fixed when the form opens and never moves again, so it is what `dirty` measures
	 * against and what {@link FormInterface.clear} returns to.
	 */
	readonly baseline: FormValues
	/** Every error the last check produced. */
	readonly errors: readonly FieldError[]
	/** The names of the fields somebody has visited. */
	readonly touched: ReadonlySet<string>
	/**
	 * The names of the fields currently out of the form.
	 *
	 * @remarks
	 * It opens as the set the schema declares through {@link FieldBase.disabled} and moves with
	 * every {@link FormInterface.disable} and {@link FormInterface.enable} call, so the schema
	 * holds the declaration and this holds the current fact.
	 */
	readonly disabled: ReadonlySet<string>
	/** Where the form sits in its life. */
	readonly status: FormStatus
	/** Whether the last completed evaluation found no error. */
	readonly valid: boolean
	/** Whether any answer has moved since the form opened. */
	readonly dirty: boolean
	/**
	 * The answers, once the form settles.
	 *
	 * @remarks
	 * It resolves with the submitted values on the first valid submit, and rejects when teardown
	 * abandons the form before it settles.
	 */
	readonly answer: Promise<FormValues>
	/**
	 * Find one field by name.
	 *
	 * @param name - The field's name.
	 * @returns The field, or `undefined` when the schema declares no such name.
	 */
	field(name: string): FormField | undefined
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
	 * Record that somebody has visited a field.
	 *
	 * @param name - The field's name.
	 */
	touch(name: string): void
	/**
	 * Fail a field from outside, for what the rules cannot see.
	 *
	 * @param name - The field's name.
	 * @param message - What to tell the person.
	 */
	invalidate(name: string, message: string): void
	/**
	 * Take every field out of the form.
	 *
	 * @remarks
	 * A disabled field is neither evaluated nor submitted. Its answer is kept, and so is any
	 * {@link FormInterface.invalidate} failure it carries, which is withheld from `errors` while
	 * the field is out and restored when it comes back. The form emits `disable` once per field
	 * whose state actually moved, in schema order, so a call that moves nothing announces
	 * nothing. Disabling is a write, so a settled or abandoned form refuses it.
	 */
	disable(): void
	/**
	 * Take one field out of the form.
	 *
	 * @param name - The field's name.
	 * @throws A {@link FormError} coded `FIELD` when the schema declares no such name.
	 */
	disable(name: string): void
	/**
	 * Take several fields out of the form.
	 *
	 * @param names - The field names.
	 * @throws A {@link FormError} coded `FIELD` when the schema declares no such name. Every name
	 *   is checked before any field moves, so one bad name leaves the whole call undone.
	 */
	disable(names: readonly string[]): void
	/**
	 * Put every field back into the form.
	 *
	 * @remarks
	 * An enabled field is evaluated and submitted again, and any invalidation held while it was
	 * out reappears in `errors`. The form emits `enable` once per field whose state actually
	 * moved, in schema order. Enabling is a write, so a settled or abandoned form refuses it.
	 */
	enable(): void
	/**
	 * Put one field back into the form.
	 *
	 * @param name - The field's name.
	 * @throws A {@link FormError} coded `FIELD` when the schema declares no such name.
	 */
	enable(name: string): void
	/**
	 * Put several fields back into the form.
	 *
	 * @param names - The field names.
	 * @throws A {@link FormError} coded `FIELD` when the schema declares no such name. Every name
	 *   is checked before any field moves, so one bad name leaves the whole call undone.
	 */
	enable(names: readonly string[]): void
	/**
	 * Check every answer and settle the form when they all pass.
	 *
	 * @returns The values on success, or every error that stopped them.
	 */
	submit(): FormResult
	/**
	 * Return every answer to {@link FormInterface.baseline}, the answers the form opened with.
	 *
	 * @remarks
	 * The runtime disabled overlay resets with them, so {@link FormInterface.disabled} reads the
	 * schema's declarations again.
	 */
	clear(): void
	/**
	 * Tear the form down, abandoning it when it has not settled.
	 *
	 * @remarks
	 * A request from inside a listener defers teardown until the outermost mutation batch closes,
	 * so an in-flight settlement can win and leave the form `settled` rather than `abandoned`.
	 */
	destroy(): void
}

# Form

> The environment-agnostic form document. A `FormSchema` states what is asked, a `Form` holds the
> answers given against it, declarative `FieldRule` data states what those answers must satisfy, and
> one submit settles the form exactly once. Nothing here renders, reads a keyboard, or opens a
> socket.
>
> **A terminal prompt and a browser form are the same abstraction.** Both ask a person a set of
> questions, hold partial answers, check them against rules, and finish once. What differs is the
> host, and each host contributes the one part it owns. Parking is the server environment's
> contribution: `answer` is a form whose result nobody has resolved yet, so a server can hand the
> document out, wait, and receive the answers back through the same promise a local caller awaits.
> Rendering is the browser's contribution, and it lives in the browser, not here. This package ships
> the document both hosts share.
>
> The core is pure and total. Every guard returns `false` off-shape rather than throwing, every
> parser returns `undefined` on refusal, and every value the form hands back is a frozen owned copy.
> Form-owned refusals raise `FormError`, and each one names a caller mistake. A custom validator's
> own throw escapes the mutation call unchanged.

## Surface

Open a form, answer it, and settle it:

```ts
import { createForm } from '@orkestrel/form'

const form = createForm({
	label: 'Sign up',
	fields: [
		{ control: 'text', name: 'email', label: 'Email', rule: { required: true, email: true } },
		{ control: 'confirm', name: 'terms', label: 'I accept the terms', rule: { required: true } },
	],
})

form.fill({ email: 'ada@example.com', terms: true })
const result = form.submit() // { success: true, value: { email: 'ada@example.com', terms: true } }
const answers = await form.answer // { email: 'ada@example.com', terms: true }
```

Everything below is exported from `@orkestrel/form` ([`src/core`](../src/core)). Nothing is internal:
every declaration in the module is reachable from the barrel, so a consumer holds exactly the
mechanisms the package uses on itself.

### Schema and fields

The document itself — what a form asks, in the order it asks it. All data, no behavior.

| API             | Kind      | Summary                                                                                                                          |
| --------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `FormSchema`    | interface | Everything a form asks — optional `name` / `label` / `help` / `groups`, and the required `fields` in presentation order.         |
| `FormGroup`     | interface | A named section of a form — `name` / `label` / optional `help`. Grouping arranges a form and changes no answer.                  |
| `FormField`     | type      | Any field a schema can declare — the twelve-member union discriminated on `control`.                                             |
| `FieldBase`     | interface | What every field carries whatever its control — `name` / `label` / `help` / `group` / `hidden` / `disabled` / `locked` / `rule`. |
| `FieldControl`  | type      | The control a field presents — the twelve-member discriminant that fixes the field's options and its value shape.                |
| `FieldChoice`   | interface | One option a `select` or `checkbox` offers — `value` is stored, `label` is read, `help` explains, `disabled` refuses it.         |
| `TextField`     | interface | A single line of text — optional `default` and `placeholder`.                                                                    |
| `EditorField`   | interface | Text over many lines — optional `default` and `placeholder`.                                                                     |
| `PasswordField` | interface | A secret, obscured as it is typed — optional `mask`, and no `default` by design.                                                 |
| `NumberField`   | interface | A number — optional `default` and `placeholder`.                                                                                 |
| `DateField`     | interface | A calendar date held as the control's own `YYYY-MM-DD` string — optional `default`.                                              |
| `TimeField`     | interface | A time of day held as the control's own `HH:MM` string, seconds optional — optional `default`.                                   |
| `DatetimeField` | interface | A date and time together with no zone, the browser's datetime-local — optional `default`.                                        |
| `ColorField`    | interface | A color held as a six-digit `#rrggbb` string — optional `default`.                                                               |
| `ConfirmField`  | interface | A single on/off box holding a boolean — optional `default`.                                                                      |
| `SelectField`   | interface | One choice out of a list — required `choices`, optional `default`, and `open` to admit a value the list does not offer.          |
| `CheckboxField` | interface | Any number of choices out of a list, holding the checked values — required `choices`, optional `default`.                        |
| `FileField`     | interface | One or more files, by name — optional `accept` media types and `multiple`.                                                       |

### Answers and rules

What a form holds, what its answers must satisfy, and how a failure reports itself.

| API              | Kind      | Summary                                                                                                                                                                             |
| ---------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FieldValue`     | type      | Every value a field can hold — a `string`, a `number`, a `boolean`, or a `readonly string[]`.                                                                                       |
| `FormValues`     | type      | A form's answers keyed by field name. A name with no key is a field nobody has answered.                                                                                            |
| `FieldRule`      | interface | The constraints one field's value must satisfy — `required` / `minimum` / `maximum` / `step` / `pattern` / `email` / `url` / `integer` / `alphanumeric` / `custom`.                 |
| `FieldRuleName`  | type      | Every rule that reports its failure by name — `FieldRule` without `custom`, and the key `FormOptions.messages` is keyed by.                                                         |
| `FieldValidator` | type      | The cross-field check `custom` runs — it receives the value and every answer the form holds, and returns `true` or a message; its own throw escapes after any earlier state change. |
| `FieldError`     | interface | One failed check — the `field`, the `message`, and the `rule` that produced it where a named rule did.                                                                              |

### The form

The entity, its factory, its contract, and the error it raises.

| API             | Kind      | Summary                                                                                                         |
| --------------- | --------- | --------------------------------------------------------------------------------------------------------------- |
| `Form`          | class     | A form — a schema, the answers given against it, and the errors they carry. Implements `FormInterface` exactly. |
| `FormInterface` | interface | The form contract — the readonly state below plus the seven methods in `## Methods`.                            |
| `createForm`    | function  | Open a form against a schema. The schema is copied, and the copy is what the form asks.                         |
| `FormOptions`   | interface | How to open a form — `on` listeners, an `error` handler, seeded `values`, and per-rule `messages` overrides.    |
| `FormStatus`    | type      | Where a form sits in its life — `editing`, `settled`, or `abandoned`. Both end states are terminal.             |
| `FormResult`    | type      | What a submit answers with — the values on success, or every `FieldError` that stopped them.                    |
| `FormEventMap`  | type      | Everything a form announces — `fill` / `validate` / `submit` / `clear` / `abandon`, with their payloads.        |
| `FormError`     | class     | An error raised by the form domain — a machine-readable `code` and optional structured `context`.               |
| `FormErrorCode` | type      | The reason a `FormError` carries — `SCHEMA` / `FIELD` / `CONTROL` / `SETTLED` / `ABANDONED`.                    |
| `isFormError`   | function  | Whether a caught value is a `FormError`, so a `catch` branches on `code` without an assertion.                  |

`FormInterface`'s readonly data members stay here rather than in `## Methods`: `emitter` (the typed
event surface), `schema` (the owned frozen copy), `values` (the answers held right now), `errors`
(current after each completed evaluation), `touched` (the fields somebody has visited), `status`,
`valid`, `dirty`, and `answer` (the promise that resolves on the first valid submit).

### Constants

The control and status registries, the default rule copy, the shipped patterns, and the pattern
ceiling. All frozen.

| API                    | Kind  | Summary                                                                                       |
| ---------------------- | ----- | --------------------------------------------------------------------------------------------- |
| `FIELD_CONTROLS`       | const | Every field control, in the order the public contract declares them.                          |
| `FORM_STATUSES`        | const | Every form lifecycle status — `editing`, `settled`, `abandoned`.                              |
| `RULE_MESSAGES`        | const | The default failure copy for every named rule; `{limit}` is replaced with the rule's operand. |
| `EMAIL_PATTERN`        | const | A practical whole-address email shape — the `email` rule's test.                              |
| `URL_PATTERN`          | const | An absolute HTTP or HTTPS URL shape — the `url` rule's test.                                  |
| `ALPHANUMERIC_PATTERN` | const | One or more ASCII letters or digits — the `alphanumeric` rule's test.                         |
| `INTEGER_PATTERN`      | const | A signed or unsigned base-ten integer string — the `integer` rule's test on a text control.   |
| `COLOR_PATTERN`        | const | A six-digit hexadecimal color string — the shape a `color` value must have.                   |
| `DATE_PATTERN`         | const | An ISO calendar date in `YYYY-MM-DD` form — the shape a `date` value must have.               |
| `TIME_PATTERN`         | const | A 24-hour time with optional seconds — the shape a `time` value must have.                    |
| `DATETIME_PATTERN`     | const | An ISO local date and time with optional seconds — the shape a `datetime` value must have.    |
| `PATTERN_LIMIT`        | const | The longest authored regular-expression source this package will compile: 256 characters.     |

### Guards

Total `is*` guards over unknown input. None throws, none coerces, and each returns `false` for
anything off-shape — including a hostile prototype, a symbol key, or a cyclic value.

| API              | Kind     | Summary                                                                                            |
| ---------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `isFieldControl` | function | Whether a value is one of the twelve declared controls.                                            |
| `isFormStatus`   | function | Whether a value is a form lifecycle status.                                                        |
| `isFieldValue`   | function | Whether a value has a field-value shape — string, finite number, boolean, or list of strings.      |
| `isFieldChoice`  | function | Whether a value is one exact `FieldChoice` record; an unknown member refuses it.                   |
| `isFieldRule`    | function | Whether a value is one structurally valid `FieldRule` record.                                      |
| `isFormField`    | function | Whether a value is one exact discriminated `FormField`, checked against its control's own options. |
| `isFormGroup`    | function | Whether a value is one exact `FormGroup` record.                                                   |
| `isFormSchema`   | function | Whether a value is one exact structural `FormSchema` — structure only, not domain soundness.       |
| `isFormValues`   | function | Whether a value is a record whose every own key is a string and every value a `FieldValue`.        |
| `isFieldError`   | function | Whether a value is one exact `FieldError` record.                                                  |

### Helpers

The pure leaves the form composes: the control shape test, the evaluation engine, the derivations,
and the wire projection.

| API               | Kind     | Summary                                                                                                  |
| ----------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `matchesField`    | function | Whether one control can hold a value — the shape gate every write and every seed passes through.         |
| `appliesRule`     | function | Whether one named rule applies to one field control.                                                     |
| `evaluateField`   | function | Every failure one field's rule produces against its current value, in rule order.                        |
| `evaluateForm`    | function | Every failure the whole schema produces, in schema order then rule order; a disabled field is skipped.   |
| `computeDefaults` | function | The values a schema explicitly seeds. `password` and `file` declare no default, so neither ever appears. |
| `matchesValue`    | function | Whether two field values hold the same answer, comparing list values element by element.                 |
| `matchesValues`   | function | Whether two answer records hold the same answers, comparing list values element by element.              |
| `formatMessage`   | function | Resolve one rule's failure text — an override first, then `RULE_MESSAGES` — and substitute `{limit}`.    |
| `serializeForm`   | function | Project a schema into JSON, dropping every `custom` validator and every absent member.                   |
| `extractGroups`   | function | The groups a schema's fields actually reference, in first-reference order and without duplicates.        |
| `auditSchema`     | function | Audit a structurally valid schema for domain invariants, returning human-readable diagnostics.           |

### Cloners

Owned frozen snapshots. The form takes one of the schema at construction, so a later edit to the
schema the caller passed changes nothing inside the form, and no list the form hands back is a live
internal reference.

| API               | Kind     | Summary                                                                             |
| ----------------- | -------- | ----------------------------------------------------------------------------------- |
| `cloneValue`      | function | Own one field value — a scalar is returned unchanged, a list becomes a frozen copy. |
| `cloneChoices`    | function | Own a field's choices as a frozen list of frozen choice records.                    |
| `cloneFormField`  | function | Own one field, freezing its rule, its choices, and any list-valued default.         |
| `cloneFormSchema` | function | Own a whole schema, freezing every nested group, field, rule, choice, and list.     |

### Parsers

The wire boundary. Each returns `undefined` on refusal rather than throwing, and each returns an
owned value rather than the caller's.

| API           | Kind     | Summary                                                                                                           |
| ------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `parseForm`   | function | Parse unknown wire data into an owned, structurally valid, semantically sound schema; a `custom` rule is dropped. |
| `parseValue`  | function | Parse one answer against its field's control, coercing a numeric string and `'true'` / `'false'`.                 |
| `parseValues` | function | Parse a strict answer record against a schema — one unknown key or one refused value refuses the whole record.    |

## Controls

Twelve controls, and each one fixes both the options its field accepts and the `FieldValue` it
holds. Three of the mappings need saying out loud, because a host's vocabulary is wider than this
one and the collapses are deliberate:

- A lone browser checkbox is a `confirm`. It means yes or no and it holds a boolean.
- `checkbox` is the multi-choice group — the terminal's checkbox — and it holds the checked values
  as a list. It is never one box.
- `datetime` is the browser's `datetime-local`: a wall-clock date and time carrying no zone.

Four more host controls are this package's `text` plus a rule, because they differ from text only in
what they accept: email, url, tel, and search. A browser range is a `number` with `minimum`,
`maximum`, and `step`. A radio group is a `select` and a switch is a `confirm` — both are the same
question wearing a different affordance, and which affordance to draw is the renderer's decision.
A datalist is a `select` with `open`, which is exactly what "suggest these, accept anything" means.

| Control    | Value               | Its own options              | Notes                                                          |
| ---------- | ------------------- | ---------------------------- | -------------------------------------------------------------- |
| `text`     | `string`            | `default`, `placeholder`     | Also carries email, url, tel, and search, each as a rule.      |
| `editor`   | `string`            | `default`, `placeholder`     | Text over many lines.                                          |
| `password` | `string`            | `mask`                       | No `default`: a seeded secret is a secret written down.        |
| `number`   | `number`            | `default`, `placeholder`     | Also carries a range, as `minimum` plus `maximum` plus `step`. |
| `date`     | `string`            | `default`                    | `YYYY-MM-DD`.                                                  |
| `time`     | `string`            | `default`                    | `HH:MM`, seconds optional.                                     |
| `datetime` | `string`            | `default`                    | The browser's datetime-local, no zone.                         |
| `color`    | `string`            | `default`                    | `#rrggbb`, six digits.                                         |
| `confirm`  | `boolean`           | `default`                    | A lone browser checkbox, and a switch.                         |
| `select`   | `string`            | `choices`, `default`, `open` | A radio group, and a datalist when `open` is true.             |
| `checkbox` | `readonly string[]` | `choices`, `default`         | The multi-choice group.                                        |
| `file`     | `readonly string[]` | `accept`, `multiple`         | Names only. Bytes never enter the document.                    |

### text

```ts
import type { TextField } from '@orkestrel/form'

const email: TextField = {
	control: 'text',
	name: 'email',
	label: 'Email',
	placeholder: 'you@example.com',
	rule: { required: true, email: true },
}
```

### editor

```ts
import type { EditorField } from '@orkestrel/form'

const bio: EditorField = {
	control: 'editor',
	name: 'bio',
	label: 'About you',
	rule: { maximum: 500 },
}
```

### password

`password` carries no `default`, so `computeDefaults` never seeds one. `mask` is the character the
control repeats in place of the text, and the form stores the real value untouched.

```ts
import type { PasswordField } from '@orkestrel/form'

const secret: PasswordField = {
	control: 'password',
	name: 'secret',
	label: 'Password',
	mask: '*',
	rule: { required: true, minimum: 12 },
}
```

### number

A browser range is this field with all three numeric rules set.

```ts
import type { NumberField } from '@orkestrel/form'

const volume: NumberField = {
	control: 'number',
	name: 'volume',
	label: 'Volume',
	default: 5,
	rule: { minimum: 0, maximum: 11, step: 1 },
}
```

### date

```ts
import type { DateField } from '@orkestrel/form'

const start: DateField = {
	control: 'date',
	name: 'start',
	label: 'Start date',
	rule: { minimum: '2026-01-01', maximum: '2026-12-31' },
}
```

### time

```ts
import type { TimeField } from '@orkestrel/form'

const opens: TimeField = {
	control: 'time',
	name: 'opens',
	label: 'Opening time',
	default: '09:00',
	rule: { minimum: '06:00', maximum: '22:00' },
}
```

### datetime

```ts
import type { DatetimeField } from '@orkestrel/form'

const slot: DatetimeField = {
	control: 'datetime',
	name: 'slot',
	label: 'Appointment',
	rule: { minimum: '2026-01-01T09:00' },
}
```

### color

```ts
import type { ColorField } from '@orkestrel/form'

const brand: ColorField = {
	control: 'color',
	name: 'brand',
	label: 'Brand color',
	default: '#3366ff',
}
```

### confirm

```ts
import type { ConfirmField } from '@orkestrel/form'

const terms: ConfirmField = {
	control: 'confirm',
	name: 'terms',
	label: 'I accept the terms',
	rule: { required: true },
}
```

### select

`open` admits a value the list does not offer, which is what turns a closed menu into a suggestion
list. A choice marked `disabled` is shown and refused at every door, including seeded values.
Filter stored answers through `parseValues` or `parseValue` before seeding them; an `undefined`
result means the value is no longer legal. An active, closed, all-disabled select is unanswerable
and faults when required; an open select, an optional select, and a field-level disabled select are
all legal.

```ts
import type { SelectField } from '@orkestrel/form'

const plan: SelectField = {
	control: 'select',
	name: 'plan',
	label: 'Plan',
	choices: [
		{ value: 'free', label: 'Free' },
		{ value: 'pro', label: 'Pro', help: 'Everything in Free, plus support' },
		{ value: 'legacy', label: 'Legacy', disabled: true },
	],
	default: 'free',
}
```

### checkbox

A checkbox value is the checked values as a list. Duplicates are refused, and `minimum` and
`maximum` count selections rather than characters. `required` is satisfied by any present answer,
including the empty list; an empty submission is a valid "none selected".

```ts
import type { CheckboxField } from '@orkestrel/form'

const topics: CheckboxField = {
	control: 'checkbox',
	name: 'topics',
	label: 'Interests',
	choices: [
		{ value: 'releases', label: 'Releases' },
		{ value: 'security', label: 'Security' },
	],
	default: ['releases'],
	rule: { minimum: 1 },
}
```

### file

A file value is a list of names. `multiple` admits more than one, and without it a second name is
refused.

```ts
import type { FileField } from '@orkestrel/form'

const documents: FileField = {
	control: 'file',
	name: 'documents',
	label: 'Supporting documents',
	accept: ['application/pdf', '.png'],
	multiple: true,
	rule: { maximum: 3 },
}
```

## Rules

A rule is data, not a closure. That is what lets a schema cross a wire and validate on the other
side exactly as it validated here — with the single exception of `custom`, which is a function and
therefore does not travel.

| Rule           | Operand          | What it measures                                                                                                                      |
| -------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `required`     | `true`           | That an answer exists at all. It is the only rule an absent value reaches.                                                            |
| `minimum`      | number or string | Characters for text, editor, and password; magnitude for number; chronology for the temporal three; selections for checkbox and file. |
| `maximum`      | number or string | The same measure as `minimum`, at the other end.                                                                                      |
| `step`         | number           | The interval a numeric value must land on, counted from `minimum` or from zero. Number only.                                          |
| `pattern`      | string           | Regular-expression source the whole value must match. String-valued controls only.                                                    |
| `email`        | `true`           | That the whole value is an email address, per `EMAIL_PATTERN`.                                                                        |
| `url`          | `true`           | That the whole value is an absolute HTTP or HTTPS URL, per `URL_PATTERN`.                                                             |
| `integer`      | `true`           | That a number has no fractional part, or that a string is a base-ten integer.                                                         |
| `alphanumeric` | `true`           | That the whole value is ASCII letters and digits, per `ALPHANUMERIC_PATTERN`.                                                         |
| `custom`       | `FieldValidator` | Anything the rest cannot say. It runs last, and it is the only rule that sees the rest of the form.                                   |

The operand's type follows the control family. `minimum` and `maximum` take a number wherever the
measure is a count or a magnitude, and take a string written in the control's own format wherever
the measure is chronology — `'2026-01-01'` for a date, `'09:00'` for a time. `auditSchema` refuses
the mismatch rather than letting it fail silently at evaluation time.

Bounds compare temporal strings lexically. Spell each operand and value at the same precision:
because seconds are optional, `'09:00'` sorts before `'09:00:00'`.

`step` is number-only. A temporal step is not in this package; see the concept inventory.

```ts
import { evaluateField, formatMessage } from '@orkestrel/form'

const volume = {
	control: 'number',
	name: 'volume',
	rule: { minimum: 0, maximum: 11, step: 1 },
} as const

evaluateField(volume, 12, {})
// [{ field: 'volume', message: 'Must be at most 11', rule: 'maximum' }]
evaluateField(volume, 0.5, {})
// [{ field: 'volume', message: 'Must be a multiple of 1', rule: 'step' }]

formatMessage('minimum', 8) // 'Must be at least 8'
formatMessage('required', undefined, { required: 'We need this one' }) // 'We need this one'
```

### The custom seam

`custom` receives two arguments: the value the field holds, and every answer the form holds. The
second is what makes a cross-field rule possible without a second mechanism — a confirmation field
reads its sibling directly. It returns `true` to pass, or the message explaining the failure, and
that message travels as a `FieldError` with no `rule`, because the failure belongs to no named rule.
A validator's own throw escapes the mutation call unchanged; only form-owned refusals are
`FormError`.

```ts
import { evaluateField } from '@orkestrel/form'
import type { FieldValidator } from '@orkestrel/form'

const matches: FieldValidator = (value, values) =>
	value === values.password ? true : 'Both passwords must match'

const again = { control: 'password', name: 'again', rule: { custom: matches } } as const

evaluateField(again, 'hunter3', { password: 'hunter2' })
// [{ field: 'again', message: 'Both passwords must match' }]
```

### Messages

`FormOptions.messages` replaces a rule's default copy, keyed by `FieldRuleName`. `{limit}` in the
replacement is substituted with the rule's operand exactly as it is in `RULE_MESSAGES`. `custom` is
absent from `FieldRuleName` because a custom rule supplies its own message and nothing keyed by a
rule name would ever be read for it.

### Patterns and where trust lives

`pattern` is authored regular-expression source, so it is the one rule that can carry an attack.
Two mechanisms bound it, and both are deliberate.

`PATTERN_LIMIT` is 256 characters. A longer source is never compiled: `auditSchema` reports it, so
`createForm` and `parseForm` both refuse the schema, and `evaluateField` fails the field on the
`pattern` rule rather than handing the source to `RegExp`.

A pattern within `PATTERN_LIMIT` can still backtrack catastrophically. This package applies no time
bound. Evaluating an untrusted pattern spends the caller's thread. The wire boundary remains data
only: `serializeForm` drops every `custom` validator on the way out, and `parseForm` drops every
`custom` member on the way in. Parse a peer's schema through `parseForm`, which refuses an over-long
or uncompilable pattern, and decide whether its remaining patterns are trusted before evaluation.

```ts
import { auditSchema, evaluateField, PATTERN_LIMIT } from '@orkestrel/form'

const long = {
	control: 'text',
	name: 'code',
	rule: { pattern: 'a'.repeat(PATTERN_LIMIT + 1) },
} as const

auditSchema({ fields: [long] })
// ['Field "code" has a pattern longer than 256']
evaluateField(long, 'aaa', {})
// [{ field: 'code', message: 'Must match the required format', rule: 'pattern' }]
```

### Auditing a schema

`auditSchema` is the semantic pass that structural validation cannot do: duplicate names, a missing
group, a default its own control cannot hold, a rule on a control that cannot measure it, a minimum
above its maximum, or an uncompilable pattern. It also reports an active required closed `select`
with no enabled choice and an active `checkbox` whose positive `minimum` exceeds its enabled-choice
count. A required `checkbox` alone remains satisfiable because `[]` is a present answer. Disabled
fields are exempt from both satisfiability faults. The audit runs inside `createForm` and inside
`parseForm`, so a consumer rarely calls it directly — but it is exported, because a schema editor
wants the diagnostics before it constructs anything.

**Its returned strings are human diagnostics, not a stable machine contract.** Read them, show them,
log them. Do not branch on their text or parse a field name out of them: the wording is free to
change with the diagnostics, and only the emptiness of the list is a promise. Where a machine
outcome is what you need, use the guards, or use `parseForm` and read `undefined`.

```ts
import { auditSchema } from '@orkestrel/form'

auditSchema({
	fields: [
		{ control: 'text', name: 'a' },
		{ control: 'text', name: 'a' },
	],
})
// ['Field "a" is declared more than once']
auditSchema({ fields: [{ control: 'number', name: 'n', rule: { minimum: '3' } }] })
// ['Field "n" has a string minimum on number']
auditSchema({ fields: [{ control: 'text', name: 'email' }] }) // []
```

### The temporal patterns are lexical

`DATE_PATTERN`, `TIME_PATTERN`, and `DATETIME_PATTERN` check spelling, not calendars. They accept a
four-digit year, a month in 01–12, and a day in 01–31 — with no knowledge of month length and no
knowledge of leap years. `'2026-02-31'` is therefore a lexically valid `date` value, and this
package accepts it.

That is the boundary this package draws, and it draws it on purpose: a calendar is a host concern,
and the host that renders a date control already refuses an impossible day. Where a real calendar
date matters to your domain, add the check as a `custom` rule, which is exactly the seam it belongs
in.

```ts
import { matchesField } from '@orkestrel/form'

const when = { control: 'date', name: 'when' } as const

matchesField(when, '2026-02-31') // true — lexically valid, no calendar is consulted
matchesField(when, '2026-13-01') // false — month 13 is not spelled correctly
```

## Lifecycle and state

A form opens `editing`, turns `settled` on its first valid submit, and turns `abandoned` when it is
destroyed before settling. Both end states are terminal, and every write to a form in either one is
refused with a `FormError`. Every getter keeps answering afterwards.

A destroy requested while a mutation batch is open records the request, refuses every subsequent
write from that instant, and defers teardown until the outermost batch closes. The batch's own
outcome wins. If it settles the form, the form ends `settled`, `answer` resolves, and no `abandon`
is emitted. Teardown never advances into the batch, and the batch is never aborted or rolled back.
The pending request is private, unnamed state, so `FormStatus` gains no fourth member.

**There is no `check()`.** `errors` is computed at construction and after every mutation whose
evaluation completes, and the `validate` event fires exactly when that list's content changes. If a
custom validator throws mid-mutation, the throw escapes after earlier state changes and leaves the
previous error list in place. Contract 4 states the exact partial-state boundary.

**`valid` and `dirty` are derived on read.** `valid` is true when `errors` is empty. `dirty` is true
once the answers differ from the ones the form opened with. Neither is stored, so neither can drift.

**`touched` is the fields somebody has visited.** It is what lets a renderer withhold an error until
the person has had their turn at the field. A failed submit marks every enabled field touched, so
the errors the person has not reached yet become showable at exactly the moment they matter.

```ts
import { createForm } from '@orkestrel/form'

const form = createForm({
	fields: [
		{ control: 'text', name: 'email', rule: { required: true, email: true } },
		{ control: 'confirm', name: 'terms', rule: { required: true } },
	],
})

form.errors.length // 2 — current from the moment the form opens
form.valid // false
form.dirty // false
form.status // 'editing'

form.field('email')?.control // 'text'
form.touch('email')
form.touched.has('email') // true

form.fill('email', 'ada@example.com')
form.dirty // true
form.errors.length // 1

form.submit().success // false — `terms` is still unanswered
Array.from(form.touched) // ['email', 'terms'] — a failed submit touches every enabled field

form.fill('terms', true)
form.submit() // { success: true, value: { email: 'ada@example.com', terms: true } }
form.status // 'settled'
```

### The three visibility switches

They differ in what they remove, and the difference is load-bearing.

| Switch     | Renderer obligation          | `fill`  | Validated | Submitted |
| ---------- | ---------------------------- | ------- | --------- | --------- |
| `hidden`   | omit                         | accepts | yes       | yes       |
| `locked`   | render without person edits  | accepts | yes       | yes       |
| `disabled` | omit or render without edits | accepts | no        | no        |

`hidden` keeps a field out of the rendered form while it still travels. `locked` renders it
unwritable. `disabled` takes the field out of the form entirely: it is neither evaluated nor
submitted, and its value may still appear in `values` so a renderer can show it.
`fill` refuses none of the three switches; they constrain rendering, evaluation, and submission,
not programmatic writes.

```ts
import { createForm } from '@orkestrel/form'

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

form.values // { legacy: 'kept' } — present for a renderer
form.errors.length // 1 — only `email`; the disabled field is not evaluated

form.fill('email', 'ada@example.com')
form.submit() // { success: true, value: { email: 'ada@example.com' } } — `legacy` is not submitted
```

### Filling, clearing, and failing from outside

`fill` takes either one name and one value, or a whole record. Every answer is checked before any is
written, so a refused write changes nothing. Passing `undefined` clears one field.

`invalidate` fails a field for a reason the rules cannot see — an address already registered, a
coupon already spent. One field holds one external failure, a second call replaces the first, and
the failure lasts until that field is filled again or the form is cleared.

`clear` returns every answer to the ones the form opened with: the schema's defaults, overlaid with
any seeded `values`. It also clears `touched` and every external failure.

```ts
import { createForm } from '@orkestrel/form'

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

form.fill('email', 'ada@example.com')
form.valid // true

form.invalidate('email', 'That address is already registered')
form.errors // [{ field: 'email', message: 'That address is already registered' }]
form.valid // false

form.fill('email', 'grace@example.com')
form.errors // [] — refilling the field clears its external failure

form.clear()
form.values // { plan: 'free' } — back to the answers the form opened with
form.dirty // false
```

### Park-as-Promise: `answer`

`answer` is the form's whole point on a server. It resolves with the submitted values on the first
valid submit, and rejects with a `FormError` coded `ABANDONED` when teardown abandons the form
before it settles. One task can await it while an entirely different task fills and submits the
form, which is what a parked question looks like when a promise is the only thing that has to cross
between them.

Nothing has to await it. An unawaited form that is destroyed does not take the host down with it.

```ts
import { createForm } from '@orkestrel/form'

const form = createForm({ fields: [{ control: 'text', name: 'name', rule: { required: true } }] })

// One task parks on the answer.
const parked = form.answer

// Another task — a request handler, a socket message, a keyboard — supplies it.
form.fill('name', 'Ada')
form.submit()

await parked // { name: 'Ada' }
```

```ts
import { createForm, isFormError } from '@orkestrel/form'

const abandoned = createForm({ fields: [{ control: 'text', name: 'name' }] })
const pending = abandoned.answer

abandoned.destroy()
abandoned.status // 'abandoned'

try {
	await pending
} catch (error) {
	if (isFormError(error)) error.code // 'ABANDONED'
}
```

### Settle once

The first valid submit is the only one. It resolves `answer`, emits `submit`, sets `status` to
`settled`, and every later write — `fill`, `touch`, `invalidate`, `submit`, `clear` — throws a
`FormError` coded `SETTLED`. A failed submit settles nothing and leaves the form open.

`destroy` tears the form down. Destroying twice does nothing the second time. A form that already
settled keeps its `settled` status and announces nothing. An editing form turns `abandoned`, rejects
`answer`, and emits `abandon` unless the request was deferred behind a mutation batch that settles
before teardown.

## Events

Five events, and each carries what a listener needs to act without reading the form back.

| Event      | Payload                               | Fires                                                                                                                                                                   |
| ---------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fill`     | the field's `name`, and its new value | Once per field whose answer actually moved, in the order written. The value is `undefined` when the answer was cleared.                                                 |
| `validate` | every current `FieldError`            | Whenever the error list's content changes — after a fill, an invalidate, a clear, or a submit. Empty when the change was to no errors at all.                           |
| `submit`   | the submitted `FormValues`            | On the submit that settles the form, and only that one.                                                                                                                 |
| `clear`    | nothing                               | On a completed `clear`, before any `validate` it caused. A custom-validator throw during reevaluation resets state but emits no `clear` and leaves the previous errors. |
| `abandon`  | nothing                               | On the `destroy` that abandons an unsettled form. Never on a settled one.                                                                                               |

Wire listeners at construction through `FormOptions.on`, or afterwards through the `emitter`. Both
reach the same typed emitter, and a listener that throws is isolated and reported to
`FormOptions.error` rather than breaking its siblings or the form.

```ts
import { createForm } from '@orkestrel/form'

const seen: string[] = []

const form = createForm(
	{ fields: [{ control: 'text', name: 'email', rule: { required: true } }] },
	{
		on: {
			fill: (name, value) => seen.push(`fill ${name} ${String(value)}`),
			validate: (errors) => seen.push(`validate ${errors.length}`),
			submit: () => seen.push('submit'),
		},
		error: (error) => console.error(error),
	},
)

form.emitter.on('abandon', () => seen.push('abandon'))

form.fill('email', 'ada@example.com')
form.submit()

seen // ['fill email ada@example.com', 'validate 0', 'submit']
```

## Wire safety

A schema is data, so it travels. `serializeForm` projects it into JSON — dropping every `custom`
validator and every absent member — and `parseForm` reads unknown JSON back into an owned schema,
refusing anything that is not structurally valid and semantically sound. The round trip is exact for
everything that travels.

```ts
import { parseForm, serializeForm } from '@orkestrel/form'
import type { FormSchema } from '@orkestrel/form'

const schema: FormSchema = {
	name: 'signup',
	label: 'Sign up',
	groups: [{ name: 'account', label: 'Account' }],
	fields: [
		{ control: 'text', name: 'email', group: 'account', rule: { required: true, email: true } },
		{ control: 'checkbox', name: 'topics', choices: [{ value: 'a', label: 'A' }], default: ['a'] },
	],
}

const wire = JSON.stringify(serializeForm(schema))
const received = parseForm(JSON.parse(wire))

JSON.stringify(serializeForm(received ?? schema)) === wire // true
parseForm({ fields: 'not a list' }) // undefined
```

Answers travel too, and they arrive as strings far more often than not — a query string, a form
post, a CSV cell. `parseValue` coerces exactly two things and nothing else: a numeric string into a
`number` for a `number` field, and `'true'` or `'false'` into a boolean for a `confirm` field. Every
other value must already have its control's shape.

`parseValues` is strict in both directions: an unknown key refuses the whole record, and so does one
value its field's control cannot hold. There is no partial result, because a half-accepted answer
set is worse than a rejected one.

```ts
import { parseValue, parseValues } from '@orkestrel/form'
import type { ConfirmField, FormSchema, NumberField } from '@orkestrel/form'

const age: NumberField = { control: 'number', name: 'age' }
const ok: ConfirmField = { control: 'confirm', name: 'ok' }
const schema: FormSchema = { fields: [age, ok] }

parseValue(age, '42') // 42
parseValue(age, 'abc') // undefined
parseValue(ok, 'true') // true
parseValue(ok, 'yes') // undefined

parseValues(schema, { age: '42', ok: 'true' }) // { age: 42, ok: true }
parseValues(schema, { nope: '1' }) // undefined
```

The guards are the same boundary read one field at a time, and every one of them is total.

```ts
import {
	isFieldChoice,
	isFieldControl,
	isFieldError,
	isFieldRule,
	isFieldValue,
	isFormField,
	isFormGroup,
	isFormSchema,
	isFormStatus,
	isFormValues,
} from '@orkestrel/form'

isFieldControl('datetime') // true
isFieldControl('radio') // false — a radio group is a `select`
isFormStatus('settled') // true
isFieldValue(['a', 'b']) // true
isFieldValue({}) // false
isFieldChoice({ value: 'a', label: 'A' }) // true
isFieldChoice({ value: 'a', label: 'A', colour: 'red' }) // false — an unknown member refuses it
isFieldRule({ required: true, minimum: 8 }) // true
isFormField({ control: 'text', name: 'email' }) // true
isFormField({ control: 'text' }) // false
isFormGroup({ name: 'account', label: 'Account' }) // true
isFormSchema({ fields: [{ control: 'text', name: 'a' }] }) // true
isFormValues({ a: 'b', c: 2 }) // true
isFieldError({ field: 'a', message: 'b', rule: 'required' }) // true
```

### Owning what arrives

The cloners are how a value stops being the caller's. The form clones the schema at construction, so
a later edit to the caller's object changes nothing inside the form; it clones each list value it
stores and each it returns, so no caller ever holds a reference to internal state. They are exported
because a consumer building its own schema store needs the same guarantee.

```ts
import { cloneChoices, cloneFormField, cloneFormSchema, cloneValue } from '@orkestrel/form'

const topics = ['releases']
const owned = cloneValue(topics)
owned === topics // false
Object.isFrozen(owned) // true
cloneValue('text') // 'text' — a scalar is already its own value

Object.isFrozen(cloneChoices([{ value: 'a', label: 'A' }])) // true
Object.isFrozen(cloneFormField({ control: 'text', name: 'email' })) // true
Object.isFrozen(cloneFormSchema({ fields: [{ control: 'text', name: 'email' }] })) // true
```

### Deriving without a form

The evaluation and derivation helpers are pure and take a schema plus values, so a caller that has
no form — a server checking a posted body, an editor previewing a schema — reaches the same answers
the form would give.

```ts
import {
	appliesRule,
	computeDefaults,
	evaluateForm,
	extractGroups,
	matchesValue,
	matchesValues,
} from '@orkestrel/form'
import type { FormSchema } from '@orkestrel/form'

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

computeDefaults(schema) // { email: 'ada@example.com', terms: false } — `password` seeds nothing
extractGroups(schema) // [{ name: 'account', label: 'Account' }] — `unused` is referenced by nobody
evaluateForm(schema, {}) // [] — no field declares a rule
appliesRule('number', 'step') // true
matchesValue(['a'], ['a']) // true
matchesValues({ topics: ['a'] }, { topics: ['a'] }) // true
```

## Methods

The public methods of `FormInterface`, which the `Form` class implements exactly and adds nothing
to. Its readonly data members — `emitter`, `schema`, `values`, `errors`, `touched`, `status`,
`valid`, `dirty`, and `answer` — stay in the `## Surface` rows above and are not repeated here.

Every other row in the Surface tables is a data shape, a union, a constant, a function, or an error
class, so none of them carries a method table. `FieldValidator` is a callable function type with one
call signature and no named members.

#### `FormInterface`

| Method       | Returns                    | Behavior                                                                                                   |
| ------------ | -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `field`      | `FormField` or `undefined` | Find one field by name; `undefined` when the schema declares no such name.                                 |
| `fill`       | `void`                     | Answer one field, or several at once. Every answer is checked first, so a refused write changes nothing.   |
| `touch`      | `void`                     | Record that somebody has visited a field.                                                                  |
| `invalidate` | `void`                     | Fail a field from outside, for what the rules cannot see. It lasts until the field is filled or cleared.   |
| `submit`     | `FormResult`               | Check every answer and settle the form when they all pass; otherwise return every error that stopped them. |
| `clear`      | `void`                     | Return every answer to the ones the form opened with: defaults overlaid with seeded `values`.              |
| `destroy`    | `void`                     | Request teardown. Idempotent; an in-flight settlement can win before deferred teardown.                    |

### Errors

`FormError` carries a machine-readable `code` and an optional structured `context`. Narrow a caught
value with `isFormError` and branch on `code`; never match on message text. A custom validator's own
throw is the caller's exception and escapes unchanged.

| Code        | Raised when                                                                                        |
| ----------- | -------------------------------------------------------------------------------------------------- |
| `SCHEMA`    | The schema is not a form schema, or `auditSchema` found a domain fault. Thrown by the constructor. |
| `FIELD`     | A name given to `fill`, `touch`, or `invalidate` is one the schema does not declare.               |
| `CONTROL`   | A value written or seeded is one its field's control cannot hold.                                  |
| `SETTLED`   | A write reached a form that has already settled.                                                   |
| `ABANDONED` | A write reached a form that was destroyed before it settled, or `answer` rejected for that reason. |

```ts
import { createForm, isFormError } from '@orkestrel/form'

try {
	createForm({ fields: [{ control: 'text', name: '' }] })
} catch (error) {
	if (isFormError(error)) error.code // 'SCHEMA'
}

const form = createForm({ fields: [{ control: 'number', name: 'age' }] })

try {
	form.fill('nope', 1)
} catch (error) {
	if (isFormError(error)) error.code // 'FIELD'
}

try {
	form.fill('age', 'twelve')
} catch (error) {
	if (isFormError(error)) error.code // 'CONTROL'
}

form.values // {} — a refused write changed nothing
```

`createForm` and `new Form(...)` are the same construction. Prefer the factory at a call site that
only needs `FormInterface`; reach for the class where a class holds a form as its own field and
wants the concrete type.

```ts
import { Form } from '@orkestrel/form'

const form = new Form({ fields: [{ control: 'text', name: 'email', rule: { required: true } }] })
form.fill('email', 'ada@example.com')
form.submit().success // true
```

## Contract

These invariants hold across [`src/core`](../src/core) and this guide.

1. **Documented surface equals exported surface.** Every row in the `## Surface` tables is a real
   barrel export of `src/core`, and every barrel export is a row — both directions, exhaustively.
   Nothing in this module is internal, so the parity suite's internal list is empty.
2. **Documented methods equal interface methods.** The `## Methods` table for `FormInterface` lists
   exactly its call-signature members, and the `Form` class implements every one and adds no public
   behavior beyond them.
3. **The schema is owned.** `Form` clones the schema at construction and freezes every nested group,
   field, rule, choice, and list. A later edit to the caller's object changes nothing inside the
   form, and no getter returns a live internal reference.
4. **Errors are current after completed evaluation.** `errors` is recomputed at construction and
   after every mutation whose evaluation completes, and `validate` fires exactly when that list's
   content changes. A custom-validator throw escapes mid-evaluation. After a throwing `fill`, the
   form holds the new answers beside the pre-fill errors. A throwing `invalidate` records its
   failure but keeps that stale list. A throwing `clear` resets answers, touched fields, and
   invalidations but emits no `clear` and leaves the previous errors. There is no `check`.
5. **`valid` and `dirty` are derived.** Both are computed on read from `errors` and from the
   answers, so neither can drift from what the form holds.
6. **A write is all-or-nothing.** `fill` checks every answer against its control before writing any,
   so a `FIELD` or `CONTROL` failure leaves the form exactly as it was.
7. **Settle once, terminally.** The first valid submit resolves `answer`, emits `submit`, and sets
   `status` to `settled`; every later write throws. A destroy not overtaken by an in-flight
   settlement sets `abandoned`, rejects `answer` with `ABANDONED`, and emits `abandon`. The exception
   is a destroy deferred behind a mutation batch that settles before teardown: the form ends
   `settled`, `answer` resolves, and no `abandon` is emitted. Neither end state is left, and every
   getter keeps answering in both.
8. **A disabled field is out of the form.** It is not evaluated and not submitted. `hidden` and
   `locked` are rendering facts only: both are still evaluated and still submitted.
9. **Guards are total and parsers refuse.** No `is*` throws for any input — hostile prototype,
   symbol key, cycle, or depth. No `parse*` throws; each returns `undefined` on refusal. A
   guard-valid value is never refused by its parser, and every parsed result satisfies its guard.
   A pattern within `PATTERN_LIMIT` can still backtrack catastrophically; this package applies no
   time bound, so evaluating an untrusted pattern spends the caller's thread.
10. **Only data crosses the wire.** `serializeForm` drops every `custom` validator on the way out
    and `parseForm` drops every `custom` member on the way in, so no function crosses in either
    direction. Everything that does cross survives the round trip exactly.
11. **`auditSchema` returns diagnostics, not a contract.** The list's emptiness is the promise. The
    wording of its strings is not, and no consumer should parse them.
12. **The temporal patterns are lexical.** `date`, `time`, and `datetime` values are checked for
    spelling, never against a calendar, so `'2026-02-31'` is a valid `date` value here. Bounds also
    compare lexically, so operands and values must use the same precision; `'09:00'` sorts before
    `'09:00:00'`.

## Concept inventory

What this package deliberately does not do, and why. Each line is an exclusion taken on evidence,
not an omission — so a reader can tell a boundary from a gap, and the next change knows what it is
reopening.

| Concept                | Why it is out                                                                                                                                                                                                                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conditional visibility | A field shown only when a sibling holds a given answer. The seam is the cross-field predicate `custom` already uses, `(value, values)`, moved onto the field. It is out because `hidden` is a declared fact today and would become a derived one, which puts a recompute pass back in front of every read — the `check` this design removed. |
| Repeating field arrays | A field group answered many times over. It changes `FormValues` from a flat record into a tree, and every rule, guard, parser, and error path with it.                                                                                                                                                                                       |
| Wizards and multi-step | Pages, ordering, and progress are presentation. A wizard is several forms and a host that sequences them, and the sequencing belongs to the host.                                                                                                                                                                                            |
| `month` and `week`     | Two more temporal controls with two more lexical patterns and no new idea. They join when a real consumer asks for one.                                                                                                                                                                                                                      |
| Presentation hints     | Switch, radio, and range are affordances for questions this package already models as `confirm`, `select`, and `number`. Which affordance to draw is the renderer's decision, and a hint here would be product policy.                                                                                                                       |
| File bytes             | A `file` value is names. Bytes are a transport concern with a host-specific representation, and putting them in the document would make the document unserializable.                                                                                                                                                                         |
| Async validation       | Every rule here is synchronous, so `errors` can be current after every mutation. An async check — an address already registered, a coupon already spent — runs above the form at submit time and reports through `invalidate`.                                                                                                               |
| Form-level validators  | A rule about the form as a whole rather than one field. `custom` already reads every answer, so the same check runs today attached to the field it would fail.                                                                                                                                                                               |
| Temporal `step`        | `step` is number-only. A temporal step means intervals over calendar arithmetic, which is the same calendar this package deliberately does not carry.                                                                                                                                                                                        |
| Browser binding        | Binding a schema to real elements belongs in a future `src/browser`, taking a form and an element. It is not in this round because nothing renders here yet.                                                                                                                                                                                 |
| Terminal adoption      | A terminal driver parking a whole form rather than one prompt belongs in the terminal package, on the same `answer` promise this document already exposes.                                                                                                                                                                                   |
| Localization           | `FormOptions.messages` replaces a rule's copy, and `label` and `help` are the schema author's strings. Locale selection, plurals, and message catalogs are the host's.                                                                                                                                                                       |

## Tests

- [`tests/guides.test.ts`](../tests/guides.test.ts) — the `## Surface` ↔ barrel bijection, the
  `FormInterface` ↔ `Form` method bijection, and the flagship fences above executed against the real
  source so a documented value that the code contradicts fails.
- [`tests/src/core/Form.test.ts`](../tests/src/core/Form.test.ts) — construction, state, `fill`,
  `touch`, `invalidate`, `submit`, `clear`, `destroy`, and the rule paths through the entity.
- [`tests/src/core/helpers.test.ts`](../tests/src/core/helpers.test.ts) — `matchesField`,
  `appliesRule`, `evaluateField`, `evaluateForm`, `computeDefaults`, `matchesValue`,
  `matchesValues`, `formatMessage`, `serializeForm`, `extractGroups`, `auditSchema`, and the
  control-by-rule matrix.
- [`tests/src/core/validators.test.ts`](../tests/src/core/validators.test.ts) — every guard against
  valid, off-shape, and hostile input, plus guard/parser soundness in both directions.
- [`tests/src/core/parsers.test.ts`](../tests/src/core/parsers.test.ts) — `parseValue`,
  `parseValues`, `parseForm`, the wire round trip, and answer parking.
- [`tests/src/core/cloners.test.ts`](../tests/src/core/cloners.test.ts) — every clone is owned,
  frozen, and deep enough that no caller reference survives.
- [`tests/src/core/constants.test.ts`](../tests/src/core/constants.test.ts) — the registries, the
  default messages, and each shipped pattern.
- [`tests/src/core/errors.test.ts`](../tests/src/core/errors.test.ts) — `FormError`'s `code` and
  `context`, and `isFormError` narrowing.
- [`tests/src/core/factories.test.ts`](../tests/src/core/factories.test.ts) — `createForm` returns a
  working `FormInterface`.
- [`tests/src/core/index.test.ts`](../tests/src/core/index.test.ts) — the barrel resolves every
  documented export.

## See also

- [`AGENTS.md`](../AGENTS.md) — the coding contract this package is written against.
- [`README.md`](README.md) — the guides index.

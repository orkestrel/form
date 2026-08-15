import type { FieldControl, FieldRuleName, FormStatus } from './types.js'

/** Every field control, in the order declared by the public contract. */
export const FIELD_CONTROLS: readonly FieldControl[] = Object.freeze([
	'text',
	'editor',
	'password',
	'number',
	'date',
	'time',
	'datetime',
	'color',
	'confirm',
	'select',
	'checkbox',
	'file',
])

/** Every form lifecycle status. */
export const FORM_STATUSES: readonly FormStatus[] = Object.freeze([
	'editing',
	'settled',
	'abandoned',
])

/** Default failure copy for every named field rule. */
export const RULE_MESSAGES: Readonly<Record<FieldRuleName, string>> = Object.freeze({
	required: 'This field is required',
	minimum: 'Must be at least {limit}',
	maximum: 'Must be at most {limit}',
	step: 'Must be a multiple of {limit}',
	pattern: 'Must match the required format',
	email: 'Must be a valid email address',
	url: 'Must be a valid URL',
	integer: 'Must be an integer',
	alphanumeric: 'Must contain only letters and numbers',
})

/** A practical whole-address email shape. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** An absolute HTTP or HTTPS URL shape. */
export const URL_PATTERN = /^https?:\/\/[^\s]+$/

/** One or more ASCII letters or digits. */
export const ALPHANUMERIC_PATTERN = /^[A-Za-z0-9]+$/

/** A signed or unsigned base-ten integer string. */
export const INTEGER_PATTERN = /^[+-]?\d+$/

/** A six-digit hexadecimal color string. */
export const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/

/** An ISO calendar date string in `YYYY-MM-DD` form. */
export const DATE_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/

/** A 24-hour time string with optional seconds. */
export const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/

/** An ISO local date and time string with optional seconds. */
export const DATETIME_PATTERN =
	/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/

/** The maximum accepted source length for an authored regular expression. */
export const PATTERN_LIMIT = 256

import type { FieldControl, FieldRuleName, FormStatus } from './types.js'

/** Lists every field control, in the order declared by the public contract. */
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
	'list',
	'file',
])

/** Lists the members every field declares, whatever its control. */
export const FIELD_BASE_KEYS: readonly string[] = Object.freeze([
	'control',
	'name',
	'label',
	'help',
	'group',
	'hidden',
	'disabled',
	'locked',
	'rule',
	'meta',
])

/**
 * Lists every member one field control permits, composed from {@link FIELD_BASE_KEYS} and the
 * members the control's own interface adds.
 */
export const FIELD_KEYS: Readonly<Record<FieldControl, readonly string[]>> = Object.freeze({
	text: Object.freeze([...FIELD_BASE_KEYS, 'default', 'placeholder']),
	editor: Object.freeze([...FIELD_BASE_KEYS, 'default', 'placeholder']),
	password: Object.freeze([...FIELD_BASE_KEYS, 'mask']),
	number: Object.freeze([...FIELD_BASE_KEYS, 'default', 'placeholder']),
	date: Object.freeze([...FIELD_BASE_KEYS, 'default']),
	time: Object.freeze([...FIELD_BASE_KEYS, 'default']),
	datetime: Object.freeze([...FIELD_BASE_KEYS, 'default']),
	color: Object.freeze([...FIELD_BASE_KEYS, 'default']),
	confirm: Object.freeze([...FIELD_BASE_KEYS, 'default']),
	select: Object.freeze([...FIELD_BASE_KEYS, 'choices', 'default', 'open']),
	checkbox: Object.freeze([...FIELD_BASE_KEYS, 'choices', 'default']),
	list: Object.freeze([...FIELD_BASE_KEYS, 'default']),
	file: Object.freeze([...FIELD_BASE_KEYS, 'accept', 'multiple']),
})

/** Lists every form lifecycle status. */
export const FORM_STATUSES: readonly FormStatus[] = Object.freeze([
	'editing',
	'settled',
	'abandoned',
])

/** Holds the default failure copy for every named field rule. */
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

/** Matches a practical whole-address email shape. */
export const EMAIL_PATTERN = Object.freeze(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)

/** Matches an absolute HTTP or HTTPS URL shape. */
export const URL_PATTERN = Object.freeze(/^https?:\/\/[^\s]+$/)

/** Matches one or more ASCII letters or digits. */
export const ALPHANUMERIC_PATTERN = Object.freeze(/^[A-Za-z0-9]+$/)

/** Matches a signed or unsigned base-ten integer string. */
export const INTEGER_PATTERN = Object.freeze(/^[+-]?\d+$/)

/** Matches a six-digit hexadecimal color string. */
export const COLOR_PATTERN = Object.freeze(/^#[0-9A-Fa-f]{6}$/)

/** Matches an ISO calendar date string in `YYYY-MM-DD` form. */
export const DATE_PATTERN = Object.freeze(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/)

/** Matches a 24-hour time string with optional seconds. */
export const TIME_PATTERN = Object.freeze(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/)

/** Matches an ISO local date and time string with optional seconds. */
export const DATETIME_PATTERN = Object.freeze(
	/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/,
)

/** Caps the accepted source length for an authored regular expression, at 256. */
export const PATTERN_LIMIT = 256

/** Caps the number of fields one schema may declare, at 512. */
export const FIELD_LIMIT = 512

/** Caps the number of groups one schema may declare, at 64. */
export const GROUP_LIMIT = 64

/** Caps the number of entries one list-valued answer may hold, at 1024. */
export const LIST_LIMIT = 1024

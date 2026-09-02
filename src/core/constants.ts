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

/** Caps the accepted source length for an authored regular expression. */
export const PATTERN_LIMIT = 256

/** Caps the number of fields one schema may declare. */
export const FIELD_LIMIT = 512

/** Caps the number of groups one schema may declare. */
export const GROUP_LIMIT = 64

/** Caps the number of choices one `select` or `checkbox` field may offer. */
export const CHOICE_LIMIT = 1024

/** Caps the number of entries one list-valued answer may hold. */
export const LIST_LIMIT = 1024

/** Caps the length, in UTF-16 code units, of a schema, group, or field name. */
export const NAME_LIMIT = 128

/** Caps the length, in UTF-16 code units, of any single retained string. */
export const STRING_LIMIT = 65536

/** Caps the total length, in UTF-16 code units, of every string one schema retains. */
export const TEXT_LIMIT = 1048576

/** Caps the total number of records, arrays, and leaves one schema retains. */
export const NODE_LIMIT = 16384

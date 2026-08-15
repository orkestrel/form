import type { FormInterface, FormOptions, FormSchema } from './types.js'
import { Form } from './Form.js'

/**
 * Open a form against a schema.
 *
 * @param schema - The form to ask. It is copied, and the copy is what the form asks.
 * @param options - The form's settings.
 * @returns A form open for answers.
 * @remarks
 * Prefer this at a call site that only needs {@link FormInterface}. `new Form(...)` is the same
 * construction and is what a class holding a form as its own field reaches for.
 * @throws A {@link FormError} coded `SCHEMA` when the schema is malformed, `FIELD` when
 *   `options.values` names a field the schema does not declare, and `CONTROL` when a seeded value
 *   is one its field's control cannot hold.
 * @example
 * ```ts
 * const form = createForm({
 * 	label: 'Sign up',
 * 	fields: [
 * 		{ control: 'text', name: 'email', label: 'Email', rule: { required: true, email: true } },
 * 		{ control: 'confirm', name: 'terms', label: 'I accept the terms', rule: { required: true } },
 * 	],
 * })
 *
 * form.fill({ email: 'ada@example.com', terms: true })
 * form.submit() // { success: true, value: { email: 'ada@example.com', terms: true } }
 * ```
 */
export function createForm(schema: FormSchema, options?: FormOptions): FormInterface {
	return new Form(schema, options)
}

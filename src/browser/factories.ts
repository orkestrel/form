import type { FormInterface } from '../core/types.js'
import type { FormBindingInterface, FormBindingOptions } from './types.js'
import { FormBinding } from './FormBinding.js'

/**
 * Creates a native form binding exposed through its lifecycle interface.
 * @param element - The native form.
 * @param document - The borrowed answer document.
 * @param options - Feedback destinations and listeners.
 * @returns The initialized native binding.
 * @example
 * ```ts
 * const binding = createFormBinding(element, document)
 * binding.refresh()
 * ```
 */
export function createFormBinding(
	element: HTMLFormElement,
	document: FormInterface,
	options?: FormBindingOptions,
): FormBindingInterface {
	return new FormBinding(element, document, options)
}

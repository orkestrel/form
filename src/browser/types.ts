import type { EmitterErrorHandler, EmitterHooks, EmitterInterface } from '@orkestrel/emitter'
import type { FormInterface, FormSubmission } from '../core/types.js'

/** Represents a native answer control admitted by the binding. */
export type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

/** Names a native binding refusal. */
export type FormBindingErrorCode = 'CONTROL' | 'PENDING' | 'DOM'

/** Lists the native binding's notifications after their associated DOM effects. */
export type FormBindingEventMap = {
	readonly render: readonly []
	/** Reports a control after its native value changes during document projection. */
	readonly write: readonly [control: FormControl]
	readonly submit: readonly [submission: FormSubmission, submitter: HTMLElement | undefined]
	readonly error: readonly [error: unknown]
}

/** Configures neutral feedback destinations and isolated event listeners. */
export interface FormBindingOptions {
	readonly feedback?: ReadonlyMap<string, HTMLElement>
	readonly summary?: HTMLElement
	/** Maps native controls to feedback and summary focus targets whose departure touches the field. */
	readonly presentations?: ReadonlyMap<FormControl, HTMLElement>
	/** Defers blur touch until a same-form button's primary pointer press finishes. Default: false. */
	readonly defer?: boolean
	readonly on?: EmitterHooks<FormBindingEventMap>
	readonly error?: EmitterErrorHandler
}

/** Declares a native form's borrowed document and synchronization lifecycle. */
export interface FormBindingInterface {
	readonly element: HTMLFormElement
	readonly document: FormInterface
	readonly destroyed: boolean
	readonly emitter: EmitterInterface<FormBindingEventMap>
	/** Imports mounted enabled controls without acknowledging their answers. */
	read(): void
	/** Rediscovers controls and projects the document into the native form. */
	refresh(): void
	/** Releases owned DOM effects and listeners without destroying the document. */
	destroy(): void
}

/** Records an attribute's authored value and the binding's last contribution. */
export interface FormBindingAttribute {
	readonly original: string | null
	readonly value: string | null
}

/** Records the binding's custom-validity contribution beside the authored message. */
export interface FormBindingValidity {
	readonly original: string
	readonly value: string
}

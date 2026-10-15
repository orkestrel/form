import type { EmitterInterface } from '@orkestrel/emitter'
import type { FieldError, FieldValue, FormField, FormInterface } from '../core/types.js'
import type {
	FormBindingAttribute,
	FormBindingEventMap,
	FormBindingInterface,
	FormBindingOptions,
	FormBindingValidity,
	FormControl,
} from './types.js'
import { Emitter } from '@orkestrel/emitter'
import { matchesValue } from '../core/helpers.js'
import { FormBindingError, isFormBindingError } from './errors.js'
import { matchesFormControls, readFormControls, readNativeMessages } from './helpers.js'
import { isFormControl } from './validators.js'

/** Implements a controlled native form over a borrowed document. */
export class FormBinding implements FormBindingInterface {
	readonly #element: HTMLFormElement
	readonly #document: FormInterface
	readonly #options: FormBindingOptions | undefined
	readonly #emitter: Emitter<FormBindingEventMap>
	readonly #observer: MutationObserver
	readonly #listeners = new AbortController()
	readonly #attributes = new Map<Element, Map<string, FormBindingAttribute>>()
	readonly #validity = new Map<FormControl, FormBindingValidity>()
	readonly #feedback = new Map<string, HTMLElement>()
	readonly #excluded = new Set<string>()
	readonly #logical = new Set<string>()
	readonly #unreadable = new Set<string>()
	readonly #names = new Map<FormControl, string>()
	readonly #readings = new Map<FormControl, string>()
	readonly #lists = new Map<HTMLSelectElement, HTMLSelectElement>()
	readonly #resets = new Map<HTMLSelectElement, readonly string[]>()
	readonly #deferred = new Set<string>()
	readonly #refresh = this.#onState.bind(this)
	readonly #fill = this.#onFill.bind(this)
	readonly #disable = this.#onDisable.bind(this)
	readonly #enable = this.#onEnable.bind(this)
	readonly #clear = this.#onClear.bind(this)
	readonly #abandon = this.destroy.bind(this)
	#controls: ReadonlyMap<string, readonly FormControl[]> = new Map()
	#summary: HTMLUListElement | undefined
	#summaryText = ''
	#destroyed = false
	#running = false
	#preserve: boolean | undefined
	#reading = false
	#excluding: string | undefined
	#changed = false
	#notified = false
	#scheduled = false
	#submitting = false
	#pointer: number | undefined
	#release: ReturnType<typeof setTimeout> | undefined

	/**
	 * Binds existing controls to the supplied document's answers.
	 * @param element - The native form, including its externally associated controls.
	 * @param document - The borrowed answer document.
	 * @param options - Feedback destinations and listeners.
	 * @throws Thrown when controls contradict the schema or native initialization fails.
	 */
	constructor(element: HTMLFormElement, document: FormInterface, options?: FormBindingOptions) {
		this.#element = element
		this.#document = document
		this.#options = options
		this.#emitter = new Emitter<FormBindingEventMap>(options)
		this.#observer = new MutationObserver(() => this.#onDocument(true))
		for (const name of document.disabled) this.#logical.add(name)
		try {
			this.#controls = this.#discover()
			const signal = this.#listeners.signal
			element.addEventListener('submit', (event) => this.#onSubmit(event), { signal })
			element.addEventListener('reset', (event) => this.#onReset(event), { signal })
			element.ownerDocument.addEventListener('input', (event) => this.#onInput(event), { signal })
			element.ownerDocument.addEventListener('change', (event) => this.#onInput(event), { signal })
			element.ownerDocument.addEventListener('focusout', (event) => this.#onBlur(event), { signal })
			element.ownerDocument.addEventListener('click', (event) => this.#onClick(event), { signal })
			if (options?.defer) {
				element.ownerDocument.addEventListener('pointerdown', (event) => this.#onPress(event), {
					signal,
					capture: true,
				})
				element.ownerDocument.addEventListener('pointerup', (event) => this.#onRelease(event), {
					signal,
					capture: true,
				})
				element.ownerDocument.addEventListener('pointercancel', (event) => this.#onRelease(event), {
					signal,
					capture: true,
				})
				element.ownerDocument.defaultView?.addEventListener('blur', () => this.#finishPress(), {
					signal,
				})
			}
			document.emitter.on('fill', this.#fill)
			document.emitter.on('disable', this.#disable)
			document.emitter.on('enable', this.#enable)
			document.emitter.on('clear', this.#clear)
			document.emitter.on('abandon', this.#abandon)
			for (const event of ['touch', 'validate', 'prepare', 'accept', 'abort', 'submit'] as const) {
				document.emitter.on(event, this.#refresh)
			}
			this.refresh()
			if (!this.#destroyed) {
				this.#observer.observe(element.ownerDocument, {
					subtree: true,
					childList: true,
					attributes: true,
					attributeFilter: [
						'name',
						'form',
						'id',
						'type',
						'multiple',
						'disabled',
						'required',
						'min',
						'max',
						'step',
						'pattern',
						'minlength',
						'maxlength',
						'value',
						'hidden',
						'inert',
						'style',
						'class',
					],
				})
			}
		} catch (error) {
			this.destroy()
			throw error
		}
	}

	/** Holds the native form. */
	get element(): HTMLFormElement {
		return this.#element
	}
	/** Holds the borrowed answer document. */
	get document(): FormInterface {
		return this.#document
	}
	/** Reports whether the binding released its resources. */
	get destroyed(): boolean {
		return this.#destroyed
	}
	/** Holds the binding's isolated event emitter. */
	get emitter(): EmitterInterface<FormBindingEventMap> {
		return this.#emitter
	}

	/** Imports mounted enabled controls without acknowledging their answers. */
	read(): void {
		if (this.#destroyed || this.#reading || this.#document.status !== 'editing') return
		const controls = this.#discover()
		const answers = new Map<string, FieldValue | undefined>()
		for (const field of this.#document.schema.fields) {
			const group = controls.get(field.name)
			if (group === undefined || field.locked || this.#logical.has(field.name)) continue
			const enabled = group.filter((control) => !this.#nativeDisabled(control))
			if (enabled.length === 0) continue
			if (enabled.some((control) => control.validity.badInput)) {
				this.#unreadable.add(field.name)
				continue
			}
			this.#unreadable.delete(field.name)
			answers.set(field.name, readFormControls(field, enabled))
		}
		this.#controls = controls
		this.#reading = true
		try {
			this.#exclusions()
			for (const [name, value] of answers) {
				if (this.#destroyed) break
				const values = this.#document.values
				const previous = Object.hasOwn(values, name) ? values[name] : undefined
				if (
					previous === undefined || value === undefined
						? previous !== value
						: !matchesValue(previous, value)
				)
					this.#document.fill(name, value)
			}
		} finally {
			this.#reading = false
			if (!this.#destroyed) this.#drain()
		}
	}

	/** Rediscovers controls and projects the document into the native form. */
	refresh(): void {
		if (this.#destroyed) return
		this.#unreadable.clear()
		this.#drain()
	}

	/** Releases owned DOM effects and listeners without destroying the document. */
	destroy(): void {
		if (this.#destroyed) return
		this.#destroyed = true
		this.#observer.disconnect()
		this.#listeners.abort()
		this.#clearPress()
		this.#document.emitter.off('fill', this.#fill)
		this.#document.emitter.off('disable', this.#disable)
		this.#document.emitter.off('enable', this.#enable)
		this.#document.emitter.off('clear', this.#clear)
		this.#document.emitter.off('abandon', this.#abandon)
		for (const event of ['touch', 'validate', 'prepare', 'accept', 'abort', 'submit'] as const) {
			this.#document.emitter.off(event, this.#refresh)
		}
		for (const element of this.#attributes.keys()) this.#restore(element)
		for (const control of this.#validity.keys()) this.#restoreValidity(control)
		for (const node of this.#feedback.values()) node.remove()
		this.#summary?.remove()
		if (this.#document.status === 'editing') {
			for (const name of this.#excluded) {
				if (!this.#logical.has(name)) {
					try {
						this.#document.enable(name)
					} catch (error) {
						this.#emitter.emit('error', error)
					}
				}
			}
		}
		this.#excluded.clear()
		this.#feedback.clear()
		this.#names.clear()
		this.#readings.clear()
		this.#lists.clear()
		this.#resets.clear()
		this.#unreadable.clear()
		this.#logical.clear()
		this.#controls = new Map()
		this.#summary = undefined
		this.#emitter.destroy()
	}

	#drain(preserve = false): void {
		if (this.#destroyed) return
		this.#preserve = this.#preserve === false ? false : preserve
		if (this.#running || this.#reading) return
		this.#running = true
		try {
			let turns = 0
			while (this.#preserve !== undefined && !this.#destroyed && turns < 2) {
				const retaining = this.#preserve
				this.#preserve = undefined
				this.#changed = false
				this.#controls = this.#discover()
				this.#releaseRemoved()
				this.#exclusions()
				if (this.#destroyed) break
				this.#paint(retaining)
				if (!this.#destroyed && (this.#changed || !this.#notified)) {
					this.#notified = true
					this.#emitter.emit('render')
				}
				turns += 1
			}
		} catch (error) {
			this.#preserve = undefined
			throw isFormBindingError(error)
				? error
				: new FormBindingError('DOM', 'Native form projection failed', { cause: error })
		} finally {
			this.#running = false
			if (this.#preserve !== undefined && !this.#destroyed && !this.#scheduled) {
				this.#scheduled = true
				queueMicrotask(() => {
					this.#scheduled = false
					if (!this.#destroyed) this.#onDocument(this.#preserve ?? false)
				})
			}
		}
	}

	#discover(): ReadonlyMap<string, readonly FormControl[]> {
		const groups = new Map<string, FormControl[]>()
		for (const control of Array.from(this.#element.elements)) {
			if (
				!isFormControl(control) ||
				control.form !== this.#element ||
				!this.#document.field(control.name)
			)
				continue
			if (
				control instanceof HTMLInputElement &&
				['submit', 'reset', 'button', 'image'].includes(control.type)
			)
				continue
			const group = groups.get(control.name) ?? []
			group.push(control)
			groups.set(control.name, group)
		}
		for (const field of this.#document.schema.fields) {
			const group = groups.get(field.name)
			if (group !== undefined && !matchesFormControls(field, group)) {
				throw new FormBindingError('CONTROL', `Incompatible controls for "${field.name}"`, {
					field: field.name,
				})
			}
		}
		return groups
	}

	#nativeDisabled(control: FormControl): boolean {
		const owned = this.#attributes.get(control)?.get('disabled')
		if (
			owned !== undefined &&
			control.getAttribute('disabled') === owned.value &&
			owned.original === null
		) {
			// A model-owned disabled attribute cannot become a native exclusion on the next scan.
			let ancestor = control.parentElement
			while (ancestor !== null) {
				if (ancestor instanceof HTMLFieldSetElement && ancestor.disabled) {
					const legend = Array.from(ancestor.children).find(
						(child) => child instanceof HTMLLegendElement,
					)
					if (legend === undefined || !legend.contains(control)) return true
				}
				ancestor = ancestor.parentElement
			}
			return false
		}
		return control.matches(':disabled')
	}

	#exclusions(): void {
		if (this.#document.status !== 'editing') return
		for (const field of this.#document.schema.fields) {
			if (this.#destroyed) return
			const group = this.#controls.get(field.name)
			const excluded =
				group !== undefined && group.every((control) => this.#nativeDisabled(control))
			if (excluded && !this.#logical.has(field.name) && !this.#excluded.has(field.name)) {
				this.#excluded.add(field.name)
				this.#excluding = field.name
				try {
					this.#document.disable(field.name)
				} finally {
					this.#excluding = undefined
				}
			} else if (!excluded && this.#excluded.delete(field.name) && !this.#logical.has(field.name)) {
				this.#excluding = field.name
				try {
					this.#document.enable(field.name)
				} finally {
					this.#excluding = undefined
				}
			}
		}
	}

	#paint(preserve: boolean): void {
		this.#attribute(this.#element, 'novalidate', '')
		this.#attribute(
			this.#element,
			'aria-busy',
			this.#document.pending === undefined ? 'false' : 'true',
		)
		const errors: FieldError[] = [...this.#document.errors]
		const values = this.#document.values
		for (const field of this.#document.schema.fields) {
			if (this.#destroyed) return
			const group = this.#controls.get(field.name) ?? []
			for (const control of group) {
				this.#metadata(field, control)
				if (!this.#unreadable.has(field.name))
					this.#value(
						field,
						control,
						Object.hasOwn(values, field.name) ? values[field.name] : undefined,
						preserve,
					)
				if (this.#destroyed) return
				this.#restoreValidity(control)
				if (
					!this.#document.disabled.has(field.name) &&
					!control.validity.valid &&
					control.willValidate
				) {
					for (const message of readNativeMessages(control, this.#document.errors))
						errors.push({ field: field.name, message })
				}
			}
		}
		for (const field of this.#document.schema.fields) {
			if (this.#destroyed) return
			const messages = [
				...new Set(
					errors.filter((error) => error.field === field.name).map((error) => error.message),
				),
			]
			const message = messages.join('\n')
			const visible =
				this.#document.touched.has(field.name) && !this.#document.disabled.has(field.name)
			const group = this.#controls.get(field.name) ?? []
			let feedback = this.#feedback.get(field.name)
			if (
				feedback === undefined &&
				(group.length > 0 || this.#options?.feedback?.has(field.name))
			) {
				feedback = this.#element.ownerDocument.createElement('span')
				feedback.id = `form-feedback-${crypto.randomUUID()}`
				feedback.dataset.formFeedback = field.name
				const destination = this.#options?.feedback?.get(field.name)
				if (destination !== undefined) destination.append(feedback)
				else (group.at(-1) ?? this.#element).insertAdjacentElement('afterend', feedback)
				this.#feedback.set(field.name, feedback)
			}
			if (feedback !== undefined) {
				if (feedback.textContent !== message) {
					feedback.textContent = message
					this.#changed = true
				}
				if (feedback.hidden !== (!visible || message === '')) {
					feedback.hidden = !visible || message === ''
					this.#changed = true
				}
			}
			for (const control of group) {
				if (message !== '' && !control.validity.customError) {
					this.#validity.set(control, { original: '', value: message })
					control.setCustomValidity(message)
				}
				this.#attribute(control, 'aria-invalid', visible && message !== '' ? 'true' : null)
				if (feedback !== undefined)
					this.#description(control, feedback.id, visible && message !== '')
				const presentation = this.#options?.presentations?.get(control)
				if (presentation !== undefined) {
					this.#attribute(presentation, 'aria-invalid', visible && message !== '' ? 'true' : null)
					if (feedback !== undefined)
						this.#description(presentation, feedback.id, visible && message !== '')
				}
			}
		}
		this.#paintSummary(
			errors.filter(
				(error) =>
					this.#document.touched.has(error.field) && !this.#document.disabled.has(error.field),
			),
		)
		for (const control of Array.from(this.#element.elements)) {
			if (
				(control instanceof HTMLButtonElement && control.type === 'submit') ||
				(control instanceof HTMLInputElement && ['submit', 'image'].includes(control.type))
			) {
				this.#attribute(
					control,
					'aria-busy',
					this.#document.pending === undefined ? 'false' : 'true',
				)
			}
		}
	}

	#metadata(field: FormField, control: FormControl): void {
		if (
			field.control === 'list' &&
			control instanceof HTMLSelectElement &&
			!this.#lists.has(control)
		) {
			const snapshot = control.cloneNode(true)
			if (snapshot instanceof HTMLSelectElement) {
				for (const [index, option] of Array.from(snapshot.options).entries()) {
					option.selected = control.options[index]?.selected ?? false
				}
				this.#lists.set(control, snapshot)
			}
		}
		if (this.#logical.has(field.name)) this.#attribute(control, 'disabled', '')
		else this.#releaseAttribute(control, 'disabled')
		if (
			field.locked &&
			!(control instanceof HTMLSelectElement) &&
			!(
				control instanceof HTMLInputElement &&
				['radio', 'checkbox', 'file', 'range', 'color'].includes(control.type)
			)
		)
			this.#attribute(control, 'readonly', '')
		if (field.rule?.required && !['confirm', 'checkbox', 'file'].includes(field.control))
			this.#attribute(control, 'required', '')
		if (
			field.control === 'number' ||
			field.control === 'date' ||
			field.control === 'time' ||
			field.control === 'datetime'
		) {
			if (field.rule?.minimum !== undefined && !control.hasAttribute('min'))
				this.#attribute(control, 'min', String(field.rule.minimum))
			if (field.rule?.maximum !== undefined && !control.hasAttribute('max'))
				this.#attribute(control, 'max', String(field.rule.maximum))
			if (
				field.control === 'number' &&
				field.rule?.step !== undefined &&
				!control.hasAttribute('step')
			)
				this.#attribute(control, 'step', String(field.rule.step))
		}
	}

	#value(
		field: FormField,
		control: FormControl,
		value: FieldValue | undefined,
		preserve: boolean,
	): void {
		if (
			preserve &&
			!field.locked &&
			control.ownerDocument.activeElement === control &&
			this.#readings.has(control) &&
			(control instanceof HTMLTextAreaElement ||
				(control instanceof HTMLInputElement &&
					['text', 'search', 'email', 'url', 'tel', 'password'].includes(control.type))) &&
			control.value !== this.#readings.get(control)
		)
			return
		let changed = false
		if (control instanceof HTMLInputElement && control.type === 'file') {
			// The browser alone owns bytes. A differing saved name cannot create a FileList.
			const names = Array.from(control.files ?? [], (file) => file.name)
			if (names.length > 0 && (value === undefined || !matchesValue(names, value))) {
				control.value = ''
				this.#changed = true
				this.#emitter.emit('write', control)
			}
			return
		}
		if (
			control instanceof HTMLInputElement &&
			(control.type === 'checkbox' || control.type === 'radio')
		) {
			const checked =
				field.control === 'confirm'
					? value === true
					: Array.isArray(value)
						? value.includes(control.value)
						: value === control.value
			if (control.checked !== checked) {
				control.checked = checked
				changed = true
			}
		} else if (control instanceof HTMLSelectElement && field.control === 'list') {
			const remaining = Array.from(control.options).filter((option) => !option.matches(':disabled'))
			const selected: HTMLOptionElement[] = []
			for (const entry of Array.isArray(value) ? value : []) {
				const index = remaining.findIndex((option) => option.value === entry)
				let option = index < 0 ? undefined : remaining.splice(index, 1)[0]
				if (option === undefined) {
					option = control.ownerDocument.createElement('option')
					option.value = entry
					option.text = entry
					control.append(option)
					changed = true
				}
				if (!option.selected) changed = true
				option.selected = true
				selected.push(option)
			}
			for (const option of remaining) {
				if (option.selected) changed = true
				option.selected = false
			}
			const ordered = Array.from(control.selectedOptions).filter(
				(option) => !option.matches(':disabled'),
			)
			if (selected.some((option, index) => ordered[index] !== option)) {
				control.append(...selected)
				changed = true
			}
		} else if (control instanceof HTMLSelectElement && control.multiple) {
			for (const option of Array.from(control.options)) {
				const selected = Array.isArray(value) && value.includes(option.value)
				if (option.selected !== selected) {
					option.selected = selected
					changed = true
				}
			}
		} else {
			const text = value === undefined ? '' : String(value)
			if (
				control.value !== text ||
				(control instanceof HTMLInputElement && control.validity.badInput)
			) {
				const before = control.value
				const invalid = control.validity.badInput
				control.value = text
				if (control.value !== before || invalid) changed = true
			}
		}
		this.#readings.set(control, control.value)
		if (control instanceof HTMLSelectElement) {
			const before = this.#resets.get(control)
			if (before !== undefined) {
				this.#resets.delete(control)
				changed = !matchesValue(
					before,
					Array.from(control.selectedOptions, (option) => option.value),
				)
			}
		}
		if (changed) {
			this.#changed = true
			this.#emitter.emit('write', control)
		}
	}

	#attribute(element: Element, name: string, value: string | null): void {
		const attributes = this.#attributes.get(element) ?? new Map<string, FormBindingAttribute>()
		const previous = attributes.get(name)
		const current = element.getAttribute(name)
		const original =
			previous === undefined || previous.value !== current ? current : previous.original
		if (current !== value) {
			if (value === null) element.removeAttribute(name)
			else element.setAttribute(name, value)
			this.#changed = true
		}
		attributes.set(name, { original, value })
		this.#attributes.set(element, attributes)
	}

	#description(control: HTMLElement, id: string, shown: boolean): void {
		const tokens = (control.getAttribute('aria-describedby') ?? '')
			.split(/\s+/)
			.filter((token) => token !== '' && token !== id)
		if (shown) tokens.push(id)
		this.#attribute(control, 'aria-describedby', tokens.length === 0 ? null : tokens.join(' '))
	}

	#releaseAttribute(element: Element, name: string): void {
		const attributes = this.#attributes.get(element)
		const owned = attributes?.get(name)
		if (owned === undefined) return
		if (element.getAttribute(name) === owned.value) {
			if (owned.original === null) element.removeAttribute(name)
			else element.setAttribute(name, owned.original)
			this.#changed = true
		}
		attributes?.delete(name)
	}

	#restore(element: Element): void {
		for (const name of this.#attributes.get(element)?.keys() ?? [])
			this.#releaseAttribute(element, name)
		const ids = new Set([...this.#feedback.values()].map((feedback) => feedback.id))
		const description = element.getAttribute('aria-describedby')
		if (description !== null) {
			const tokens = description.split(/\s+/).filter((token) => token !== '' && !ids.has(token))
			if (tokens.length === 0) element.removeAttribute('aria-describedby')
			else if (tokens.join(' ') !== description)
				element.setAttribute('aria-describedby', tokens.join(' '))
		}
		this.#attributes.delete(element)
	}

	#restoreValidity(control: FormControl): void {
		const owned = this.#validity.get(control)
		if (
			owned !== undefined &&
			control.validity.customError &&
			control.validationMessage === owned.value
		)
			control.setCustomValidity(owned.original)
		this.#validity.delete(control)
	}

	#releaseRemoved(): void {
		const live = new Set([...this.#controls.values()].flat())
		const presentations = new Set<Element | undefined>(
			[...live].map((control) => this.#options?.presentations?.get(control)),
		)
		for (const [control, name] of this.#names) {
			if (!live.has(control) || control.name !== name) {
				if (control instanceof HTMLSelectElement) {
					this.#lists.delete(control)
					this.#resets.delete(control)
				}
				const presentation = this.#options?.presentations?.get(control)
				if (presentation !== undefined) this.#restore(presentation)
				this.#restoreValidity(control)
				this.#restore(control)
				this.#names.delete(control)
				this.#readings.delete(control)
			}
		}
		for (const control of live) this.#names.set(control, control.name)
		for (const element of this.#attributes.keys()) {
			if (
				!presentations.has(element) &&
				(isFormControl(element) || element instanceof HTMLButtonElement) &&
				element.form !== this.#element
			)
				this.#restore(element)
		}
		for (const [name, feedback] of this.#feedback) {
			if (!this.#controls.has(name) && !this.#options?.feedback?.has(name)) {
				feedback.remove()
				this.#feedback.delete(name)
			}
		}
	}

	#paintSummary(errors: readonly FieldError[]): void {
		const destination = this.#options?.summary
		if (destination === undefined) return
		const text = JSON.stringify(
			errors.map((error) => [error.field, error.message, this.#focusable(error.field)?.id]),
		)
		if (text === this.#summaryText) return
		this.#summaryText = text
		this.#changed = true
		this.#summary?.remove()
		this.#summary = this.#element.ownerDocument.createElement('ul')
		this.#summary.dataset.formSummary = ''
		this.#summary.hidden = errors.length === 0
		for (const error of errors) {
			const entry = this.#element.ownerDocument.createElement('li')
			const target = this.#focusable(error.field)
			const label = this.#document.field(error.field)?.label ?? error.field
			if (target === undefined) entry.textContent = `${label}: ${error.message}`
			else {
				if (target.id === '') this.#attribute(target, 'id', `form-control-${crypto.randomUUID()}`)
				const link = this.#element.ownerDocument.createElement('a')
				link.href = `#${target.id}`
				link.textContent = `${label}: ${error.message}`
				link.dataset.formField = error.field
				entry.append(link)
			}
			this.#summary.append(entry)
		}
		destination.append(this.#summary)
	}

	#focusable(name: string): HTMLElement | undefined {
		return this.#controls
			.get(name)
			?.filter((control) => !control.matches(':disabled'))
			.map((control) => this.#options?.presentations?.get(control) ?? control)
			?.find(
				(control) =>
					!control.matches(':disabled') &&
					control.closest('[inert]') === null &&
					control.getClientRects().length > 0 &&
					!['hidden', 'collapse'].includes(getComputedStyle(control).visibility) &&
					!(control instanceof HTMLInputElement && control.type === 'hidden'),
			)
	}

	#onDocument(preserve = false): void {
		if (this.#destroyed) return
		try {
			this.#drain(preserve)
		} catch (error) {
			this.#emitter.emit('error', error)
		}
	}

	#onFill(name: string): void {
		this.#unreadable.delete(name)
		this.#onState()
	}

	#onState(): void {
		this.#notified = false
		this.#onDocument()
	}

	#onDisable(name: string): void {
		if (this.#excluding !== name) this.#logical.add(name)
		this.#onState()
	}

	#onEnable(name: string): void {
		if (this.#excluding !== name) {
			this.#logical.delete(name)
			this.#excluded.delete(name)
		}
		this.#onState()
	}

	#onClear(): void {
		this.#clearPress()
		this.#logical.clear()
		this.#excluded.clear()
		this.#unreadable.clear()
		for (const name of this.#document.disabled) this.#logical.add(name)
		this.#onState()
	}

	#onInput(event: Event): void {
		const control = event.target
		if (
			!isFormControl(control) ||
			control.form !== this.#element ||
			!this.#document.field(control.name) ||
			this.#destroyed
		)
			return
		try {
			this.read()
		} catch (error) {
			this.#emitter.emit('error', error)
		}
	}

	#onClick(event: MouseEvent): void {
		const control = event.target
		if (control instanceof Element) {
			const link = control.closest('a[data-form-field]')
			if (
				link instanceof HTMLAnchorElement &&
				this.#summary?.contains(link) &&
				link.dataset.formField !== undefined
			) {
				event.preventDefault()
				this.#focusable(link.dataset.formField)?.focus()
			}
		}
		if (
			control instanceof HTMLInputElement &&
			control.form === this.#element &&
			this.#document.field(control.name)?.locked &&
			['file', 'checkbox', 'radio', 'color'].includes(control.type)
		)
			event.preventDefault()
	}

	#onBlur(event: FocusEvent): void {
		let control = event.target
		for (const [native, presentation] of this.#options?.presentations ?? []) {
			if (control === presentation) {
				control = native
				break
			}
		}
		if (
			!isFormControl(control) ||
			control.form !== this.#element ||
			!this.#document.field(control.name) ||
			this.#destroyed ||
			this.#document.status !== 'editing'
		)
			return
		if (event.relatedTarget === this.#options?.presentations?.get(control)) return
		if (this.#pointer !== undefined) {
			this.#deferred.add(control.name)
			return
		}
		try {
			this.#document.touch(control.name)
			this.#drain()
		} catch (error) {
			this.#emitter.emit('error', error)
		}
	}

	#onPress(event: PointerEvent): void {
		if (!event.isPrimary || event.button !== 0 || !(event.target instanceof Element)) return
		const button = event.target.closest('button,input')
		if (
			!(
				(button instanceof HTMLButtonElement ||
					(button instanceof HTMLInputElement &&
						['button', 'submit', 'reset', 'image'].includes(button.type))) &&
				button.form === this.#element &&
				!button.matches(':disabled')
			)
		)
			return
		this.#finishPress()
		this.#pointer = event.pointerId
	}

	#onRelease(event: PointerEvent): void {
		if (event.pointerId !== this.#pointer) return
		// A task keeps the pointerup-to-click sequence free of layout-changing feedback.
		if (this.#release !== undefined) clearTimeout(this.#release)
		this.#release = setTimeout(() => this.#finishPress(), 0)
	}

	#finishPress(): void {
		const names = [...this.#deferred]
		this.#clearPress()
		if (this.#destroyed || this.#document.status !== 'editing') return
		try {
			for (const name of names) {
				if (this.#destroyed) break
				this.#document.touch(name)
			}
		} catch (error) {
			this.#emitter.emit('error', error)
		}
	}

	#clearPress(): void {
		if (this.#release !== undefined) clearTimeout(this.#release)
		this.#release = undefined
		this.#pointer = undefined
		this.#deferred.clear()
	}

	#onSubmit(event: SubmitEvent): void {
		if (event.defaultPrevented || this.#destroyed) return
		event.preventDefault()
		if (this.#submitting || this.#document.pending !== undefined) {
			this.#emitter.emit(
				'error',
				new FormBindingError('PENDING', 'A submission is already pending'),
			)
			return
		}
		this.#submitting = true
		try {
			this.read()
			if (this.#destroyed) return
			for (const field of this.#document.schema.fields) {
				if (!this.#document.disabled.has(field.name)) this.#document.touch(field.name)
				if (this.#destroyed) return
			}
			this.#drain()
			const native = [...this.#controls].filter(
				([name, controls]) =>
					!this.#document.disabled.has(name) &&
					controls.some((control) => control.willValidate && !control.validity.valid),
			)
			if (native.length > 0) {
				for (const [name] of native) {
					const target = this.#focusable(name)
					if (target !== undefined) {
						target.focus()
						break
					}
				}
				return
			}
			const result = this.#document.prepare()
			if (this.#destroyed) return
			this.#drain()
			if (result.success) {
				if (!result.value.signal.aborted && this.#document.pending === result.value)
					this.#emitter.emit('submit', result.value, event.submitter ?? undefined)
			} else {
				for (const error of result.error) {
					const target = this.#focusable(error.field)
					if (target !== undefined) {
						target.focus()
						break
					}
				}
			}
		} catch (error) {
			this.#emitter.emit('error', error)
		} finally {
			this.#submitting = false
		}
	}

	#onReset(event: Event): void {
		if (event.defaultPrevented || this.#destroyed) return
		event.preventDefault()
		try {
			const lists = new Map<HTMLSelectElement, HTMLSelectElement>()
			for (const [control, snapshot] of this.#lists) {
				if (
					control.form === this.#element &&
					control.name === snapshot.name &&
					this.#document.field(control.name)?.control === 'list'
				) {
					lists.set(control, snapshot)
					this.#resets.set(
						control,
						Array.from(control.selectedOptions, (option) => option.value),
					)
				}
			}
			this.#reading = true
			try {
				this.#document.clear()
				for (const [control, snapshot] of lists) {
					if (this.#destroyed) return
					if (control.form !== this.#element || control.name !== snapshot.name) continue
					control.replaceChildren(
						...Array.from(snapshot.childNodes, (node) => node.cloneNode(true)),
					)
					for (const [index, option] of Array.from(control.options).entries()) {
						option.selected = snapshot.options[index]?.selected ?? false
					}
					const field = this.#document.field(control.name)
					if (field !== undefined)
						this.#document.fill(field.name, readFormControls(field, [control]))
				}
			} finally {
				this.#reading = false
			}
			this.refresh()
		} catch (error) {
			this.#emitter.emit('error', error)
		} finally {
			this.#resets.clear()
		}
	}
}

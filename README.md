# @orkestrel/form

The environment-agnostic form document for the `@orkestrel` line — a schema of twelve field
controls, the answers given against it, declarative validation carried as data, and a submit that
settles exactly once. A terminal prompt and a browser form ask the same thing in different places,
so this package ships what they share and neither renders nor reads input itself. Its `answer`
promise is the parking seam a server needs: hand the document out, wait, receive the answers back.
Built on `@orkestrel/contract` and `@orkestrel/emitter`.

## Install

```sh
npm install @orkestrel/form
```

## Requirements

- Node.js >= 22.12
- Host-independent: no `node:*`, no DOM. Ships dual ESM+CJS builds.

## Usage

Declare what is asked, answer it, and settle it once:

```ts
import { createForm } from '@orkestrel/form'

const form = createForm({
	label: 'Sign up',
	fields: [
		{ control: 'text', name: 'email', label: 'Email', rule: { required: true, email: true } },
		{
			control: 'password',
			name: 'secret',
			label: 'Password',
			rule: { required: true, minimum: 12 },
		},
		{ control: 'confirm', name: 'terms', label: 'I accept the terms', rule: { required: true } },
	],
})

// A task somewhere else parks on the answer.
const parked = form.answer

form.fill({ email: 'ada@example.com', secret: 'correct horse battery' })
form.errors // [{ field: 'terms', message: 'This field is required', rule: 'required' }]

form.fill('terms', true)
const result = form.submit()
result.success // true

await parked // { email: 'ada@example.com', secret: 'correct horse battery', terms: true }
```

## Guide

See [guides/form.md](./guides/form.md) for the documented surface — the twelve controls and their
value shapes, the rule table and the custom cross-field seam, the lifecycle and its five events, the
serialize/parse wire boundary, and the concept inventory of what this package deliberately leaves
out.

## Package

Published as one entry point per the `exports` field in `package.json`: `.`, the host-independent
core. It ships dual ESM+CJS builds with declarations for both.

## Development

```sh
npm install
npm test
```

## License

MIT © [Orkestrel](https://github.com/orkestrel) — see [LICENSE](./LICENSE).

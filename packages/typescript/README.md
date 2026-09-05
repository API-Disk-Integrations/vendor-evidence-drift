# Vendor Evidence Drift API TypeScript SDK

Monitor vendor security, privacy, subprocessor, certification and SLA evidence, and map changes to controls and risk.

This package is the zero-runtime-dependency TypeScript/JavaScript client from
the audited public integration repository. It supports ESM and CommonJS on
Node.js 18 or newer. Import and construction perform no network request.

## Install

```sh
npm install vendor-evidence-drift
```

## Authenticated client

```ts
import { VendorEvidenceDrift } from 'vendor-evidence-drift'

const client = new VendorEvidenceDrift({
  apiKey: process.env.VENDOR_EVIDENCE_DRIFT_API_KEY,
})
```

Never place an API key in browser code, source control, logs, or examples.
Requesting a sandbox key is an email-verification and claim flow; it does not
return a key in the initial response.

- [Product, docs, demo, pricing, privacy, and terms](https://vendorevidence-api.com/?utm_source=npm&utm_medium=package&utm_campaign=vendor-evidence-drift&utm_content=readme)
- [Source and changelog](https://github.com/API-Disk-Integrations/vendor-evidence-drift)
- [Issues](https://github.com/API-Disk-Integrations/vendor-evidence-drift/issues)

Security reports must not be filed in a public issue. Use the repository's
private security-reporting path after the owner confirms it is enabled.

MIT licensed. The API service remains governed by the product site's terms.

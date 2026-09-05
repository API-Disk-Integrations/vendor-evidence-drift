# Vendor Evidence Drift API

Monitor vendor security, privacy, subprocessor, certification and SLA evidence, and map changes to controls and risk.

- [Product and pricing](https://vendorevidence-api.com/?utm_source=github&utm_medium=developer&utm_campaign=vendor-evidence-drift-github&utm_content=readme#pricing)
- [Developer documentation](https://vendorevidence-api.com/docs?utm_source=github&utm_medium=developer&utm_campaign=vendor-evidence-drift-github&utm_content=readme)
- [Create a free account](https://vendorevidence-api.com/signup?utm_source=github&utm_medium=developer&utm_campaign=vendor-evidence-drift-github&utm_content=readme)
- [OpenAPI contract](https://vendorevidence-api.com/openapi.json)
- [Postman collection](./postman_collection.json)

## Quickstart

### 1. Request a free-key verification email

```bash
curl -X POST https://vendorevidence-api.com/v1/keys \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","source":{"source":"github","medium":"developer","campaign":"vendor-evidence-drift-github","content":"readme"}}'
```

The service returns `202 Accepted` and sends a one-time claim link. Follow the
email, or exchange its token with `POST /v1/keys/claim`. The API key is shown
once after verification; store it securely. No card is required for the free
sandbox. Current free allowance: **150 evidence checks/month**.

### 2. Make the first product call

```bash
curl -X POST https://vendorevidence-api.com/v1/checks \
  -H "Authorization: Bearer $KEY" \
  -H 'content-type: application/json' \
  -d '{"check":{
        "vendorId":"vnd-northwind",
        "previous":{"capturedAt":"2026-02-01",
          "certifications":[{"framework":"soc2_type2","issuedAt":"2025-02-15",
            "expiresAt":"2026-02-14",
            "scope":["security","availability","confidentiality"]}],
          "subprocessors":[{"name":"Cloudmail","country":"US"}],
          "slas":[{"metric":"uptime","uptimeBasisPoints":9995}]},
        "current":{"capturedAt":"2026-08-01",
          "certifications":[{"framework":"soc2_type2","issuedAt":"2026-02-15",
            "expiresAt":"2027-02-14",
            "scope":["security","confidentiality"]}],
          "subprocessors":[{"name":"Cloudmail","country":"US"},
                           {"name":"Supportly","country":"BR"}],
          "slas":[{"metric":"uptime","uptimeBasisPoints":9990}]}}}\'
```

## SDKs

The repository includes dependency-light client files that point to the current
contract and canonical product domain:

- [Python SDK](./sdk/python/vendor_evidence_drift.py) — reads `VENDOR_EVIDENCE_DRIFT_API_KEY`
- [TypeScript SDK](./sdk/typescript/index.ts)

Copy the file you need into your project. The OpenAPI document remains the
authoritative operation and schema contract.

## Authentication and errors

API operations use `Authorization: Bearer <API_KEY>` (or `x-api-key` where
documented). Dashboard-session operations and signed service webhooks are not
callable with a customer API key. Public demo and health operations require no
credential. Errors use a stable `error.code` plus a request ID for support.

## Distribution attribution

The key request above identifies this README with the stable tuple
`github / developer / vendor-evidence-drift-github / readme`. The Postman collection and both
SDKs carry their own source metadata. Attribution is used to compare qualified
activation and retained use; it is not evidence that this channel already
performs.

## License

[MIT](./LICENSE)

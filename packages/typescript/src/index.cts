/**
 * Vendor Evidence Drift API client.
 *
 * Zero dependencies — uses the platform `fetch`, so it runs in Node 18+, Deno,
 * Bun and Cloudflare Workers without a bundler argument.
 *
 * NOT the browser: these endpoints need an API key and deliberately do not
 * support CORS. A key in front-end JavaScript is a published key.
 *
 * ```ts
 * const client = new VendorEvidenceDrift()   // reads VENDOR_EVIDENCE_DRIFT_API_KEY
 * const client = new VendorEvidenceDrift({ apiKey: 'sp_live_…', baseUrl: '…' })
 * ```
 *
 * Defaults to the deployed origin. Override with `VENDOR_EVIDENCE_DRIFT_BASE_URL` or
 * `baseUrl`. A hostname baked into a published client is a hostname that goes
 * stale silently, and a client pointed at a dead host fails in a way nobody can
 * debug from the error message.
 *
 * WHAT THIS SERVICE DOES NOT DO. It never fetches a vendor's trust page, never
 * downloads a report and never verifies that a certificate is genuine. You
 * supply both snapshots; the output is a statement about YOUR OWN RECORDS, not
 * a claim about any real vendor's actual posture.
 */

// ---------------------------------------------------------------------------
// Evidence you send
// ---------------------------------------------------------------------------

export type CertificationFramework =
  | 'soc2_type1' | 'soc2_type2' | 'iso_27001' | 'iso_27017' | 'iso_27018' | 'iso_27701'
  | 'iso_22301' | 'pci_dss' | 'hitrust_csf' | 'fedramp_moderate' | 'fedramp_high'
  | 'csa_star' | 'cyber_essentials_plus' | 'tisax'
  /** Requires `name`, so it is never a silent catch-all. */
  | 'other'

export type AuditOpinion = 'unqualified' | 'qualified' | 'adverse' | 'disclaimer' | 'not_applicable'

export interface Certification {
  /** Pairing key across snapshots. Defaults to `framework`. */
  id?: string
  framework: CertificationFramework
  /** Required when `framework` is `other`. */
  name?: string
  /** Omit on either side and an auditor change cannot be detected. */
  auditor?: string
  /** First day covered. Used to tell a late renewal from an on-time one. */
  issuedAt: string
  /** LAST DAY COVERED, inclusive. A certification expiring today is valid today. */
  expiresAt: string
  /**
   * Trust services criteria, Annex A domains, PCI levels.
   *
   * The field this API exists for. A SOC 2 that quietly drops `availability`
   * between reports changes nothing on its cover page.
   */
  scope?: string[]
  /** Send `[]` to mean "none noted". Omitting it means "not observed". */
  exceptions?: string[]
  opinion?: AuditOpinion
}

export interface Subprocessor {
  id?: string
  name: string
  /** ISO 3166-1 alpha-2. The jurisdiction is the risk, so it is required. */
  country: string
  purpose?: string
  /** false to true on an existing subprocessor is a material widening. */
  processesPersonalData?: boolean
}

export interface PolicyDocument {
  id?: string
  name: string
  version: string
  effectiveAt: string
  /** Any stable digest. The only way to see a content change under an unchanged version. */
  contentHash?: string
}

/** `uptime` is higher-is-better; every other metric is a duration and lower-is-better. */
export type SlaMetric = 'uptime' | 'support_response' | 'incident_notification' | 'breach_notification' | 'rto' | 'rpo'

export interface SlaCommitment {
  id?: string
  metric: SlaMetric
  /** `uptime` only. 99.95% is 9995 — integer basis points, never a float. */
  uptimeBasisPoints?: number
  /** Every metric except `uptime`. Whole minutes; four hours is 240. */
  targetMinutes?: number
  description?: string
}

export interface ResidencyStatement {
  id?: string
  dataCategory: string
  /** ISO 3166-1 alpha-2 codes. */
  countries: string[]
}

export type AttestationKind = 'pen_test' | 'insurance' | 'questionnaire' | 'bridge_letter' | 'other'

export interface Attestation {
  id?: string
  kind: AttestationKind
  name?: string
  provider?: string
  issuedAt: string
  /** LAST DAY COVERED, inclusive. Omit for evidence that does not expire. */
  expiresAt?: string
  /** `insurance` only. INTEGER minor units; a fractional value is a 400. */
  coverageMinor?: number
  /** ISO-4217. Required with `coverageMinor`. */
  currency?: string
  /** `pen_test` only. */
  openFindings?: number
  version?: string
}

/**
 * One observation of a vendor's evidence.
 *
 * An omitted collection means NOT OBSERVED, never observed-and-empty. The
 * report says which comparisons were skipped as a result, in `warnings`.
 */
export interface EvidenceSnapshot {
  capturedAt: string
  certifications?: Certification[]
  subprocessors?: Subprocessor[]
  policies?: PolicyDocument[]
  slas?: SlaCommitment[]
  residency?: ResidencyStatement[]
  attestations?: Attestation[]
}

export interface EvidenceCheck {
  vendorId: string
  vendorName?: string
  /** Omit for a first-ever check. The report then carries `baseline: true`. */
  previous?: EvidenceSnapshot
  current: EvidenceSnapshot
  metadata?: Record<string, string>
}

// ---------------------------------------------------------------------------
// What comes back
// ---------------------------------------------------------------------------

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical'
export type RiskBand = 'none' | 'low' | 'moderate' | 'elevated' | 'severe'
export type EvidenceSignal = 'certification' | 'subprocessor' | 'policy' | 'sla' | 'residency' | 'attestation'
export type FindingKind = 'drift' | 'posture'
export type ExpiryStatus = 'valid' | 'expiring_soon' | 'expired'

/**
 * Every code the engine can emit. Branch on these, never on `detail`.
 *
 * Codes come in asymmetric pairs on purpose: `scope_reduced` is critical and
 * `scope_expanded` is informational. One "changed" code with a direction field
 * would let a routing rule alert on improvements.
 */
export type DriftCode =
  | 'certification_added' | 'certification_lapsed_not_renewed' | 'certification_renewed'
  | 'certification_renewed_late' | 'scope_reduced' | 'scope_expanded' | 'auditor_changed'
  | 'exception_added_to_report' | 'exception_cleared_from_report' | 'opinion_downgraded'
  | 'opinion_improved' | 'certification_expired' | 'certification_expiring_soon'
  | 'subprocessor_added' | 'subprocessor_added_new_jurisdiction' | 'subprocessor_removed'
  | 'subprocessor_region_changed' | 'subprocessor_purpose_changed' | 'subprocessor_data_scope_widened'
  | 'policy_added' | 'policy_removed' | 'policy_version_changed'
  | 'policy_content_changed_without_version' | 'policy_effective_date_changed'
  | 'sla_commitment_added' | 'sla_commitment_removed' | 'sla_target_reduced' | 'sla_target_improved'
  | 'data_residency_changed' | 'data_residency_narrowed' | 'residency_statement_added'
  | 'residency_statement_removed'
  | 'attestation_added' | 'attestation_removed' | 'attestation_renewed' | 'attestation_version_changed'
  | 'insurance_coverage_reduced' | 'insurance_coverage_increased'
  | 'pen_test_findings_increased' | 'pen_test_findings_decreased'
  | 'attestation_expired' | 'attestation_expiring_soon' | 'pen_test_stale' | 'pen_test_findings_open'

/** Runtime list of the same codes, for validating a routing table at startup. */
export const DRIFT_CODES: readonly DriftCode[] = [
  'attestation_added', 'attestation_expired', 'attestation_expiring_soon', 'attestation_removed',
  'attestation_renewed', 'attestation_version_changed', 'auditor_changed', 'certification_added',
  'certification_expired', 'certification_expiring_soon', 'certification_lapsed_not_renewed',
  'certification_renewed', 'certification_renewed_late', 'data_residency_changed',
  'data_residency_narrowed', 'exception_added_to_report', 'exception_cleared_from_report',
  'insurance_coverage_increased', 'insurance_coverage_reduced', 'opinion_downgraded',
  'opinion_improved', 'pen_test_findings_decreased', 'pen_test_findings_increased',
  'pen_test_findings_open', 'pen_test_stale', 'policy_added',
  'policy_content_changed_without_version', 'policy_effective_date_changed', 'policy_removed',
  'policy_version_changed', 'residency_statement_added', 'residency_statement_removed',
  'scope_expanded', 'scope_reduced', 'sla_commitment_added', 'sla_commitment_removed',
  'sla_target_improved', 'sla_target_reduced', 'subprocessor_added',
  'subprocessor_added_new_jurisdiction', 'subprocessor_data_scope_widened', 'subprocessor_purpose_changed',
  'subprocessor_region_changed', 'subprocessor_removed',
]

/**
 * Points each severity contributes to the risk score. Nothing else feeds it,
 * so a score can be recomputed from the findings without a second API call.
 */
export const SEVERITY_POINTS: Record<Severity, number> = { info: 0, low: 4, medium: 12, high: 25, critical: 45 }

export interface AffectedControl {
  /** e.g. `A.5.21`, `GV.SC-07`, `CC9.2`. */
  id: string
  framework: 'nist_csf_2_0' | 'iso_27001_2022' | 'soc2_tsc'
  name: string
}

export interface FindingData {
  previousValue?: string | number
  currentValue?: string | number
  /** Whole UTC days left uncovered between an expiry and the next issuance. */
  gapDays?: number
  daysUntilExpiry?: number
  ageDays?: number
  added?: string[]
  removed?: string[]
  /** Integer minor units. Always the magnitude — direction lives in the code. */
  deltaMinor?: number
  deltaBasisPoints?: number
  deltaMinutes?: number
  delta?: number
  currency?: string
  country?: string
  previousCountry?: string
  framework?: string
  metric?: string
}

export interface Finding {
  code: DriftCode
  /** `posture` findings need no previous snapshot and appear on a baseline too. */
  kind: FindingKind
  signal: EvidenceSignal
  /** Fixed per code — it never varies by instance. */
  severity: Severity
  points: number
  /** True at `high` and above: the findings that set `reviewRequired`. */
  material: boolean
  subject: string
  /** Prose. It will be reworded — do not match on it. */
  detail: string
  recommendedAction: string
  /** Editorial mapping, not an official crosswalk. */
  controls: AffectedControl[]
  data?: FindingData
}

export interface RiskAssessment {
  /** 0-100, capped. */
  score: number
  band: RiskBand
  /** The uncapped sum, so a 210 is distinguishable from a 101. */
  rawPoints: number
  capped: boolean
  signals: Array<{ signal: EvidenceSignal; findings: number; points: number; highestSeverity: Severity; codes: DriftCode[] }>
  /** The arithmetic, line by line, reproducible from SEVERITY_POINTS alone. */
  derivation: string[]
}

export interface EvidenceExpiry {
  signal: 'certification' | 'attestation'
  subject: string
  label: string
  expiresAt: string
  /** Zero on the expiry day, which is still covered. Negative once past. */
  daysUntilExpiry: number
  status: ExpiryStatus
}

export interface EvidenceCounts {
  certifications: number
  subprocessors: number
  policies: number
  slas: number
  residency: number
  attestations: number
  total: number
}

export interface DriftReport {
  vendorId: string
  vendorName?: string
  baseline: boolean
  previousCapturedAt: string | null
  currentCapturedAt: string
  /** Whole UTC days between the two observations. */
  windowDays: number | null
  evaluatedAt: string
  /** Every finding, worst first — never truncated to the worst one. */
  findings: Finding[]
  counts: Record<Severity, number> & { total: number }
  materialChanges: number
  reviewRequired: boolean
  risk: RiskAssessment
  expiries: EvidenceExpiry[]
  evidence: { previous: EvidenceCounts | null; current: EvidenceCounts }
  /** What this check could NOT see, and why. */
  warnings: string[]
}

export type ApiErrorCode =
  | 'invalid_api_key' | 'missing_api_key' | 'quota_exceeded' | 'rate_limited'
  | 'invalid_request' | 'not_found' | 'method_not_allowed' | 'payload_too_large'
  | 'conflict' | 'internal_error'

/**
 * Thrown for any non-2xx response.
 *
 * NOT thrown when a report comes back with findings — findings are a
 * successful answer. On a 400, `details.path` names the exact field.
 */
export class ApiError extends Error {
  // Declared as fields rather than constructor parameter properties: those are
  // unsupported by strip-only TypeScript runtimes (Node --experimental-strip-types),
  // and an SDK should run without a build step.
  readonly status: number
  readonly code: ApiErrorCode | 'unknown'
  // `| undefined` is explicit because exactOptionalPropertyTypes distinguishes
  // "absent" from "present and undefined", and the constructor assigns both.
  readonly requestId?: string | undefined
  readonly details?: unknown

  constructor(status: number, code: ApiErrorCode | 'unknown', message: string, requestId?: string, details?: unknown) {
    super(`[${status} ${code}] ${message}`)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
    this.details = details
  }
}

export interface ClientOptions {
  apiKey?: string
  /** Falls back to VENDOR_EVIDENCE_DRIFT_BASE_URL, then the deployed origin. */
  baseUrl?: string
  /** Milliseconds. Default 30000. */
  timeoutMs?: number
  fetch?: typeof fetch
}

/** Optional acquisition metadata. Invalid values are ignored by the service. */
export interface KeySource {
  source?: string
  medium?: string
  campaign?: string
  content?: string
}

const env = (name: string): string | undefined => (globalThis as any).process?.env?.[name]

/**
 * The deployed service. Override with `baseUrl` or VENDOR_EVIDENCE_DRIFT_BASE_URL —
 * an SDK that resolves to nothing fails on the first call, which is worse than a
 * default you can point elsewhere.
 */
export const DEFAULT_BASE_URL = 'https://vendorevidence-api.com'

function resolveBaseUrl(baseUrl?: string): string {
  const resolved = baseUrl ?? env('VENDOR_EVIDENCE_DRIFT_BASE_URL') ?? DEFAULT_BASE_URL
  if (!resolved) {
    throw new Error(
      'No API origin. Pass { baseUrl } or set VENDOR_EVIDENCE_DRIFT_BASE_URL. The origin is printed ' +
        'on the product landing page; the service also answers GET / with its own endpoint index.',
    )
  }
  return resolved.replace(/\/$/, '')
}

export class VendorEvidenceDrift {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor(options: ClientOptions = {}) {
    const key = options.apiKey ?? env('VENDOR_EVIDENCE_DRIFT_API_KEY')
    if (!key) {
      throw new Error(
        'No API key. Pass { apiKey } or set VENDOR_EVIDENCE_DRIFT_API_KEY. ' +
          'Request a free key verification email with POST /v1/keys and a JSON body of {"email":"you@example.com"}.',
      )
    }
    this.apiKey = key
    this.baseUrl = resolveBaseUrl(options.baseUrl)
    this.timeoutMs = options.timeoutMs ?? 30_000
    this.fetchImpl = options.fetch ?? globalThis.fetch
  }

  private async request(method: string, path: string, body?: unknown, auth = true): Promise<any> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const res = await this.fetchImpl(this.baseUrl + path, {
        method,
        signal: controller.signal,
        headers: {
          ...(auth ? { authorization: `Bearer ${this.apiKey}` } : {}),
          accept: 'application/json',
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      })
      const text = await res.text()
      const json = text ? JSON.parse(text) : {}
      if (!res.ok) {
        const e = json?.error ?? {}
        throw new ApiError(res.status, e.code ?? 'unknown', e.message ?? text.slice(0, 200), e.requestId, e.details)
      }
      return json
    } finally {
      clearTimeout(timer)
    }
  }

  /** Liveness and deployed version. Does not require a key. */
  async health(): Promise<{ ok: boolean; product: string; version: string }> {
    return this.request('GET', '/health', undefined, false)
  }

  /**
   * Compare evidence snapshots for one vendor, or up to 50.
   *
   * Billed one evidence check per vendor comparison, however many
   * certifications and subprocessors each snapshot contains.
   */
  async check(
    check: EvidenceCheck | EvidenceCheck[],
  ): Promise<{ count: number; reviewRequired: number; reports: DriftReport[]; requestId: string }> {
    return this.request('POST', '/v1/checks', Array.isArray(check) ? { checks: check } : { check })
  }

  /** The real engine with no key: one check, at most 40 evidence items. */
  async demoCheck(check: EvidenceCheck): Promise<{ report: DriftReport }> {
    return this.request('POST', '/v1/demo/check', { check }, false)
  }

  /**
   * Every drift code with its severity, control mapping and meaning, plus the
   * scoring table. Fetch it once at startup to validate a routing table
   * against the codes the deployed engine actually emits.
   */
  async driftTypes(): Promise<Record<string, unknown>> {
    return this.request('GET', '/v1/drift-types', undefined, false)
  }

  /** Request a free sandbox key; this emails a claim token. Claiming returns the key once. */
  static async createKey(email: string, opts: { baseUrl?: string; name?: string; source?: KeySource } = {}): Promise<any> {
    const res = await fetch(resolveBaseUrl(opts.baseUrl) + '/v1/keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email,
        ...(opts.name ? { name: opts.name } : {}),
        source: opts.source ?? { source: 'sdk', medium: 'typescript' },
      }),
    })
    const json = await res.json()
    if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? 'unknown', json?.error?.message ?? 'failed', json?.error?.requestId)
    return json
  }
}

/** The findings that need a person: severity high or critical. */
export const materialFindings = (report: DriftReport): Finding[] => report.findings.filter((f) => f.material)

/**
 * Recompute the risk score locally from the published points table.
 *
 * Useful as a pipeline assertion: if this disagrees with
 * `report.risk.rawPoints`, the deployed severity table has moved and your
 * routing thresholds need revisiting.
 */
export const scoreFromFindings = (findings: readonly Finding[]): number =>
  findings.reduce((sum, f) => sum + SEVERITY_POINTS[f.severity], 0)

export default VendorEvidenceDrift

// ---8<--- BEGIN GENERATED BY tools/gen-sdk.mjs — DO NOT EDIT BELOW ---8<---
// Everything between these markers is written from openapi.json. Change the
// service, regenerate the contract, then re-run `npm run gen:sdk`.

/** The contract this SDK was generated from. */
export const API_TITLE = "Vendor Evidence Drift API"
export const API_VERSION = "1.0.0"
/** The origin the published contract names. `DEFAULT_BASE_URL` resolves to this unless overridden. */
export const API_BASE_URL = "https://vendorevidence-api.com"

/**
 * Every `error.code` the contract publishes.
 *
 * The runtime companion to the `ApiErrorCode` union: a union is erased at
 * compile time, so a caller wanting to test an unknown string against the
 * documented set had nothing to test it with.
 */
export const ERROR_CODES = ["invalid_api_key", "missing_api_key", "quota_exceeded", "rate_limited", "invalid_request", "not_found", "method_not_allowed", "payload_too_large", "conflict", "internal_error"] as const

/** One published operation, exactly as the contract describes it. */
export interface OperationDescriptor {
  readonly operationId: string
  readonly method: string
  readonly path: string
  readonly summary: string
  /** True when the operation requires an API key. False does NOT mean public — see `authKind`. */
  readonly auth: boolean
  /**
   * The credential the operation actually takes.
   *
   * `api_key` — the bearer token this client sends.
   * `session` — the dashboard session cookie, plus `x-csrf-token` on writes.
   *             An API key is REFUSED: these endpoints change what you are
   *             billed and read your payment history, and a key that lives
   *             in CI must not reach them. Call them from the signed-in
   *             dashboard, not from this SDK.
   * `signature` — machine-to-machine; not callable by API consumers.
   * `public` — no credential at all.
   */
  readonly authKind: 'api_key' | 'session' | 'signature' | 'public'
  readonly pathParams: readonly string[]
  readonly queryParams: readonly string[]
  readonly requiredBodyFields: readonly string[]
  readonly successStatus: number | null
  /** Property names of the documented 2xx body. A field absent here is a field the service does not promise. */
  readonly responseFields: readonly string[]
}

/**
 * The published surface, generated. Ships with the client so an integration
 * can assert against the contract instead of against a changelog.
 */
export const OPERATIONS: readonly OperationDescriptor[] = [
  {
    operationId: "get/",
    method: "GET",
    path: "/",
    summary: "Service index — endpoints, auth and error format",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: [],
  },
  {
    operationId: "postApiBillingWebhook",
    method: "POST",
    path: "/api/billing/webhook",
    summary: "Square billing events, forwarded by the shared hub",
    auth: false,
    authKind: "signature",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: [],
  },
  {
    operationId: "getHealth",
    method: "GET",
    path: "/health",
    summary: "Liveness and deployed version",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: [],
  },
  {
    operationId: "postV1Checkout",
    method: "POST",
    path: "/v1/checkout",
    summary: "Start a hosted Square checkout for a paid tier",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: ["tier"],
    successStatus: 200,
    responseFields: ["checkoutUrl", "tier", "sku", "requestId"],
  },
  {
    operationId: "postV1Checks",
    method: "POST",
    path: "/v1/checks",
    summary: "Compare two evidence snapshots and return drift, controls and risk",
    auth: true,
    authKind: "api_key",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["count", "reports"],
  },
  {
    operationId: "postV1DemoCheck",
    method: "POST",
    path: "/v1/demo/check",
    summary: "Public demo — compare one pair of snapshots without a key",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: ["check"],
    successStatus: 200,
    responseFields: ["report"],
  },
  {
    operationId: "getV1DriftTypes",
    method: "GET",
    path: "/v1/drift-types",
    summary: "Every drift code, severity, control mapping and scoring constant",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["driftTypes", "bySignal", "controls", "scoring"],
  },
  {
    operationId: "getV1Invoices",
    method: "GET",
    path: "/v1/invoices",
    summary: "Every invoice issued against this account, newest first (dashboard session required)",
    auth: false,
    authKind: "session",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["product", "count", "note", "invoices", "requestId"],
  },
  {
    operationId: "getV1Keys",
    method: "GET",
    path: "/v1/keys",
    summary: "List your API keys for this API",
    auth: true,
    authKind: "api_key",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["product", "accountId", "keys", "requestId"],
  },
  {
    operationId: "postV1Keys",
    method: "POST",
    path: "/v1/keys",
    summary: "Request a free sandbox API key (sends a verification email)",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: ["email"],
    successStatus: 202,
    responseFields: ["status", "email", "expiresAt", "next", "message", "requestId"],
  },
  {
    operationId: "postV1KeysIdRevoke",
    method: "POST",
    path: "/v1/keys/{id}/revoke",
    summary: "Revoke one of your API keys",
    auth: true,
    authKind: "api_key",
    pathParams: ["id"],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["id", "status", "message", "requestId"],
  },
  {
    operationId: "postV1KeysIdRotate",
    method: "POST",
    path: "/v1/keys/{id}/rotate",
    summary: "Replace one of your API keys with a new secret",
    auth: true,
    authKind: "api_key",
    pathParams: ["id"],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 201,
    responseFields: ["apiKey", "keyId", "replaced", "product", "quotaPerPeriod", "plan", "warning", "requestId"],
  },
  {
    operationId: "postV1KeysClaim",
    method: "POST",
    path: "/v1/keys/claim",
    summary: "Exchange an emailed claim token for the API key",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: ["token"],
    successStatus: 201,
    responseFields: ["apiKey", "keyId", "product", "quotaPerPeriod", "plan", "warning", "usage", "requestId"],
  },
  {
    operationId: "getV1Payments",
    method: "GET",
    path: "/v1/payments",
    summary: "Every payment attempted against this account and how it went (dashboard session required)",
    auth: false,
    authKind: "session",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["product", "count", "note", "payments", "requestId"],
  },
  {
    operationId: "getV1Subscription",
    method: "GET",
    path: "/v1/subscription",
    summary: "Your current plan, billing window and available changes (dashboard session required)",
    auth: false,
    authKind: "session",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["product", "subscribed", "status", "plan", "pendingPlan", "planChangesGoThrough", "baseFeeOwner", "cancellation", "tiers", "requestId"],
  },
  {
    operationId: "postV1SubscriptionCancel",
    method: "POST",
    path: "/v1/subscription/cancel",
    summary: "Cancel this plan and end metered access (dashboard session required)",
    auth: false,
    authKind: "session",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["canceled", "canceledAt", "entitlement", "money", "finalInvoice", "requestId"],
  },
  {
    operationId: "postV1SubscriptionPlan",
    method: "POST",
    path: "/v1/subscription/plan",
    summary: "Upgrade or downgrade to another plan (dashboard session required)",
    auth: false,
    authKind: "session",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: ["planId"],
    successStatus: 200,
    responseFields: ["changed", "direction", "from", "to", "entitlement", "billing", "requestId"],
  },
  {
    operationId: "getV1Usage",
    method: "GET",
    path: "/v1/usage",
    summary: "Your consumption and remaining allowance for this period",
    auth: true,
    authKind: "api_key",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["product", "tier", "status", "unit", "period", "included", "used", "ceiling", "remaining", "overageSoFarMinor", "spendCapMinor", "requestId"],
  },
]
// ---8<--- END GENERATED BY tools/gen-sdk.mjs ---8<---

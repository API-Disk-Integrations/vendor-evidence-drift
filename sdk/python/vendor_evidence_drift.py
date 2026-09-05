"""
Vendor Evidence Drift API client.

Zero dependencies beyond the standard library — no requests, no httpx — so it
drops into any environment without a dependency negotiation.

    from vendor_evidence_drift import VendorEvidenceDrift

    client = VendorEvidenceDrift()            # reads VENDOR_EVIDENCE_DRIFT_API_KEY
    client = VendorEvidenceDrift("sp_live_…") # or pass the key explicitly

Defaults to the deployed origin. Override with ``VENDOR_EVIDENCE_DRIFT_BASE_URL`` or
``base_url=``. A hostname baked into a published client is a hostname that goes
stale silently, and a client pointed at a dead host fails in a way nobody can
debug from the error message.

WHAT THIS SERVICE DOES NOT DO. It never fetches a vendor's trust page, never
downloads a report and never verifies that a certificate is genuine. You supply
both snapshots. The output is a statement about YOUR OWN RECORDS, not a claim
about any real vendor's actual posture.

Numbers that get compared are integers with a stated scale: uptime in basis
points (99.95% is 9995), durations in whole minutes, insurance cover in minor
units. A fractional value is rejected by the API rather than rounded.
"""

from __future__ import annotations

import json as _json
import os
import urllib.error
import urllib.request

__all__ = [
    "VendorEvidenceDrift", "ApiError",
    "SEVERITIES", "SEVERITY_POINTS", "SIGNALS", "RISK_BANDS",
    "CERTIFICATION_CODES", "SUBPROCESSOR_CODES", "POLICY_CODES", "SLA_CODES",
    "RESIDENCY_CODES", "ATTESTATION_CODES", "ALL_DRIFT_CODES", "API_TITLE", "API_VERSION", "API_BASE_URL", "ERROR_CODES", "OPERATIONS"]

#: Severities, weakest first. ``high`` and above set ``material`` on a finding.
SEVERITIES = ("info", "low", "medium", "high", "critical")

#: Points each severity contributes to the risk score. Nothing else feeds it,
#: so a score can be recomputed from the findings without a second API call.
SEVERITY_POINTS = {"info": 0, "low": 4, "medium": 12, "high": 25, "critical": 45}

RISK_BANDS = ("none", "low", "moderate", "elevated", "severe")

SIGNALS = ("certification", "subprocessor", "policy", "sla", "residency", "attestation")

#: Branch on these, never on a finding's ``detail``, which is prose.
#: Improvements score zero and are safe to route to an audit trail.
CERTIFICATION_CODES = (
    "certification_added",
    "certification_lapsed_not_renewed",   # vanished entirely — the quiet one
    "certification_renewed",
    "certification_renewed_late",         # reissued after a gap in coverage
    "scope_reduced",                      # covers less than it did
    "scope_expanded",
    "auditor_changed",
    "exception_added_to_report",
    "exception_cleared_from_report",
    "opinion_downgraded",
    "opinion_improved",
    "certification_expired",              # posture: visible on the cover page
    "certification_expiring_soon",
)

SUBPROCESSOR_CODES = (
    "subprocessor_added",                     # inside the existing footprint
    "subprocessor_added_new_jurisdiction",    # a legal regime that is new to you
    "subprocessor_removed",                   # informational: zero points
    "subprocessor_region_changed",
    "subprocessor_purpose_changed",
    "subprocessor_data_scope_widened",
)

POLICY_CODES = (
    "policy_added",
    "policy_removed",
    "policy_version_changed",
    "policy_content_changed_without_version",  # needs contentHash on both sides
    "policy_effective_date_changed",
)

SLA_CODES = ("sla_commitment_added", "sla_commitment_removed", "sla_target_reduced", "sla_target_improved")

RESIDENCY_CODES = (
    "data_residency_changed",       # a jurisdiction was added
    "data_residency_narrowed",      # only removals
    "residency_statement_added",
    "residency_statement_removed",
)

ATTESTATION_CODES = (
    "attestation_added", "attestation_removed", "attestation_renewed", "attestation_version_changed",
    "insurance_coverage_reduced", "insurance_coverage_increased",
    "pen_test_findings_increased", "pen_test_findings_decreased",
    "attestation_expired", "attestation_expiring_soon", "pen_test_stale", "pen_test_findings_open",
)

ALL_DRIFT_CODES = tuple(sorted(
    CERTIFICATION_CODES + SUBPROCESSOR_CODES + POLICY_CODES + SLA_CODES + RESIDENCY_CODES + ATTESTATION_CODES
))


class ApiError(Exception):
    """
    Raised for any non-2xx response.

    NOT raised when a check comes back with findings — findings are a
    successful answer. On a 400, ``details["path"]`` names the exact field that
    failed validation, down to the array index.
    """

    def __init__(self, status: int, code: str, message: str, request_id: str | None = None, details=None):
        super().__init__(f"[{status} {code}] {message}")
        self.status = status
        self.code = code
        self.message = message
        self.request_id = request_id
        self.details = details


#: The deployed service. Override with ``base_url=`` or
#: ``VENDOR_EVIDENCE_DRIFT_BASE_URL`` — an SDK that resolves to nothing fails on
#: the first call, which is worse than a default you can point elsewhere.
DEFAULT_BASE_URL = "https://vendorevidence-api.com"


def _resolve_base_url(base_url: str | None) -> str:
    resolved = base_url or os.environ.get("VENDOR_EVIDENCE_DRIFT_BASE_URL") or DEFAULT_BASE_URL
    if not resolved:
        raise ValueError(
            "No API origin. Pass base_url=... or set VENDOR_EVIDENCE_DRIFT_BASE_URL. "
            "The origin is printed on the product landing page; the service also "
            "answers GET / with its own endpoint index."
        )
    return resolved.rstrip("/")


class VendorEvidenceDrift:
    def __init__(self, api_key: str | None = None, *, base_url: str | None = None, timeout: float = 30.0):
        key = api_key or os.environ.get("VENDOR_EVIDENCE_DRIFT_API_KEY")
        if not key:
            raise ValueError(
                "No API key. Pass one to VendorEvidenceDrift(...) or set "
                'VENDOR_EVIDENCE_DRIFT_API_KEY. Request a free key verification email: POST /v1/keys with {"email": "you@example.com"}'
            )
        self.api_key = key
        self.base_url = _resolve_base_url(base_url)
        self.timeout = timeout

    # -- transport ---------------------------------------------------------
    def _request(self, method: str, path: str, *, body=None, auth: bool = True) -> dict:
        data = _json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base_url + path, data=data, method=method)
        if auth:
            req.add_header("Authorization", f"Bearer {self.api_key}")
        req.add_header("Accept", "application/json")
        if data:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                return _json.loads(res.read().decode() or "{}")
        except urllib.error.HTTPError as e:
            raw = e.read().decode()
            try:
                err = _json.loads(raw).get("error", {})
            except Exception:
                err = {}
            raise ApiError(
                e.code, err.get("code", "unknown"), err.get("message", raw[:200]),
                err.get("requestId"), err.get("details"),
            ) from None

    # -- API ---------------------------------------------------------------
    def health(self) -> dict:
        """Liveness and deployed version. Does not require a key."""
        return self._request("GET", "/health", auth=False)

    def check(self, check_or_checks) -> dict:
        """
        Compare evidence snapshots for one vendor, or a list of up to 50.

        Billed one evidence check per vendor comparison, however many
        certifications and subprocessors each snapshot contains. Omit
        ``previous`` on a check to get a baseline: current-state findings only,
        with ``baseline: true``.
        """
        body = (
            {"checks": check_or_checks}
            if isinstance(check_or_checks, list)
            else {"check": check_or_checks}
        )
        return self._request("POST", "/v1/checks", body=body)

    def demo_check(self, check: dict) -> dict:
        """The real engine with no key: one check, at most 40 evidence items."""
        return self._request("POST", "/v1/demo/check", body={"check": check}, auth=False)

    def drift_types(self) -> dict:
        """
        Every drift code with its severity, control mapping and meaning, plus
        the scoring table. Fetch it once at startup to validate your routing
        rules against the codes the deployed engine actually emits.
        """
        return self._request("GET", "/v1/drift-types", auth=False)

    # -- helpers -----------------------------------------------------------
    @staticmethod
    def material(report: dict) -> list:
        """The findings that need a person: severity high or critical."""
        return [f for f in report.get("findings", []) if f.get("material")]

    @staticmethod
    def score_from_findings(findings) -> int:
        """
        Recompute the risk score locally from the published points table.

        Useful as an assertion in a pipeline: if this disagrees with
        ``report["risk"]["rawPoints"]``, the deployed severity table has moved
        and your routing thresholds need revisiting.
        """
        return sum(SEVERITY_POINTS[f["severity"]] for f in findings)

    @staticmethod
    def create_key(
        email: str,
        *,
        base_url: str | None = None,
        name: str | None = None,
        source: dict[str, str] | None = None,
    ) -> dict:
        """Request a free sandbox key; this emails a claim token. Claiming returns the key once."""
        payload: dict = {
            "email": email,
            "source": source if source is not None else {"source": "sdk", "medium": "python"},
        }
        if name:
            payload["name"] = name
        req = urllib.request.Request(
            _resolve_base_url(base_url) + "/v1/keys", data=_json.dumps(payload).encode(), method="POST"
        )
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=30) as res:
            return _json.loads(res.read().decode())

# ---8<--- BEGIN GENERATED BY tools/gen-sdk.mjs — DO NOT EDIT BELOW ---8<---
# Everything between these markers is written from openapi.json. Change the
# service, regenerate the contract, then re-run `npm run gen:sdk`.

#: The contract this SDK was generated from.
API_TITLE = "Vendor Evidence Drift API"
API_VERSION = "1.0.0"
#: The origin the published contract names.
API_BASE_URL = "https://vendorevidence-api.com"

#: Every ``error.code`` the contract publishes. Branch on these, never on the message.
ERROR_CODES = ("invalid_api_key", "missing_api_key", "quota_exceeded", "rate_limited", "invalid_request", "not_found", "method_not_allowed", "payload_too_large", "conflict", "internal_error")

#: The published surface, generated. Ships with the client so an integration
#: can assert against the contract instead of against a changelog.
OPERATIONS = (
    {
        "operation_id": "get/",
        "method": "GET",
        "path": "/",
        "summary": "Service index — endpoints, auth and error format",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": (),
    },
    {
        "operation_id": "postApiBillingWebhook",
        "method": "POST",
        "path": "/api/billing/webhook",
        "summary": "Square billing events, forwarded by the shared hub",
        "auth": False,
        "auth_kind": "signature",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": (),
    },
    {
        "operation_id": "getHealth",
        "method": "GET",
        "path": "/health",
        "summary": "Liveness and deployed version",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": (),
    },
    {
        "operation_id": "postV1Checkout",
        "method": "POST",
        "path": "/v1/checkout",
        "summary": "Start a hosted Square checkout for a paid tier",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": ("tier",),
        "success_status": 200,
        "response_fields": ("checkoutUrl", "tier", "sku", "requestId"),
    },
    {
        "operation_id": "postV1Checks",
        "method": "POST",
        "path": "/v1/checks",
        "summary": "Compare two evidence snapshots and return drift, controls and risk",
        "auth": True,
        "auth_kind": "api_key",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("count", "reports"),
    },
    {
        "operation_id": "postV1DemoCheck",
        "method": "POST",
        "path": "/v1/demo/check",
        "summary": "Public demo — compare one pair of snapshots without a key",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": ("check",),
        "success_status": 200,
        "response_fields": ("report",),
    },
    {
        "operation_id": "getV1DriftTypes",
        "method": "GET",
        "path": "/v1/drift-types",
        "summary": "Every drift code, severity, control mapping and scoring constant",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("driftTypes", "bySignal", "controls", "scoring"),
    },
    {
        "operation_id": "getV1Invoices",
        "method": "GET",
        "path": "/v1/invoices",
        "summary": "Every invoice issued against this account, newest first (dashboard session required)",
        "auth": False,
        "auth_kind": "session",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("product", "count", "note", "invoices", "requestId"),
    },
    {
        "operation_id": "getV1Keys",
        "method": "GET",
        "path": "/v1/keys",
        "summary": "List your API keys for this API",
        "auth": True,
        "auth_kind": "api_key",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("product", "accountId", "keys", "requestId"),
    },
    {
        "operation_id": "postV1Keys",
        "method": "POST",
        "path": "/v1/keys",
        "summary": "Request a free sandbox API key (sends a verification email)",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": ("email",),
        "success_status": 202,
        "response_fields": ("status", "email", "expiresAt", "next", "message", "requestId"),
    },
    {
        "operation_id": "postV1KeysIdRevoke",
        "method": "POST",
        "path": "/v1/keys/{id}/revoke",
        "summary": "Revoke one of your API keys",
        "auth": True,
        "auth_kind": "api_key",
        "path_params": ("id",),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("id", "status", "message", "requestId"),
    },
    {
        "operation_id": "postV1KeysIdRotate",
        "method": "POST",
        "path": "/v1/keys/{id}/rotate",
        "summary": "Replace one of your API keys with a new secret",
        "auth": True,
        "auth_kind": "api_key",
        "path_params": ("id",),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 201,
        "response_fields": ("apiKey", "keyId", "replaced", "product", "quotaPerPeriod", "plan", "warning", "requestId"),
    },
    {
        "operation_id": "postV1KeysClaim",
        "method": "POST",
        "path": "/v1/keys/claim",
        "summary": "Exchange an emailed claim token for the API key",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": ("token",),
        "success_status": 201,
        "response_fields": ("apiKey", "keyId", "product", "quotaPerPeriod", "plan", "warning", "usage", "requestId"),
    },
    {
        "operation_id": "getV1Payments",
        "method": "GET",
        "path": "/v1/payments",
        "summary": "Every payment attempted against this account and how it went (dashboard session required)",
        "auth": False,
        "auth_kind": "session",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("product", "count", "note", "payments", "requestId"),
    },
    {
        "operation_id": "getV1Subscription",
        "method": "GET",
        "path": "/v1/subscription",
        "summary": "Your current plan, billing window and available changes (dashboard session required)",
        "auth": False,
        "auth_kind": "session",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("product", "subscribed", "status", "plan", "pendingPlan", "planChangesGoThrough", "baseFeeOwner", "cancellation", "tiers", "requestId"),
    },
    {
        "operation_id": "postV1SubscriptionCancel",
        "method": "POST",
        "path": "/v1/subscription/cancel",
        "summary": "Cancel this plan and end metered access (dashboard session required)",
        "auth": False,
        "auth_kind": "session",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("canceled", "canceledAt", "entitlement", "money", "finalInvoice", "requestId"),
    },
    {
        "operation_id": "postV1SubscriptionPlan",
        "method": "POST",
        "path": "/v1/subscription/plan",
        "summary": "Upgrade or downgrade to another plan (dashboard session required)",
        "auth": False,
        "auth_kind": "session",
        "path_params": (),
        "query_params": (),
        "required_body_fields": ("planId",),
        "success_status": 200,
        "response_fields": ("changed", "direction", "from", "to", "entitlement", "billing", "requestId"),
    },
    {
        "operation_id": "getV1Usage",
        "method": "GET",
        "path": "/v1/usage",
        "summary": "Your consumption and remaining allowance for this period",
        "auth": True,
        "auth_kind": "api_key",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("product", "tier", "status", "unit", "period", "included", "used", "ceiling", "remaining", "overageSoFarMinor", "spendCapMinor", "requestId"),
    },
)
# ---8<--- END GENERATED BY tools/gen-sdk.mjs ---8<---

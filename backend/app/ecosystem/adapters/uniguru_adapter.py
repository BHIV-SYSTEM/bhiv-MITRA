"""
UniGuru Adapter
--------------
Connects Mitra with UniGuru (Universal Learning & Knowledge Engine).
Protocol: REST API (POST /ask, GET /health).
"""
from __future__ import annotations

import os
import time
from typing import Any, Dict, Optional

import httpx

from app.ecosystem.base_adapter import (
    AdapterCapability,
    BaseBHIVAdapter,
    IntegrationManifest,
    IntegrationProtocol,
    IntegrationRequest,
    IntegrationResponse,
)


class UniGuruAdapter(BaseBHIVAdapter):

    @property
    def product_name(self) -> str:
        return "UniGuru"

    def _create_manifest(self) -> IntegrationManifest:
        raw_url = (
            os.getenv("UNIGURU_API_URL")
            or os.getenv("UNIGURU_URL")
            or "http://127.0.0.1:8000"
        ).strip()
        # Normalize base URL by removing endpoint suffixes if user configured full path
        base_url = raw_url.rstrip("/")
        for suffix in ("/ask", "/new_query", "/api"):
            if base_url.endswith(suffix):
                base_url = base_url[:-len(suffix)]
        base_url = base_url.rstrip("/")

        timeout_sec = int(os.getenv("UNIGURU_TIMEOUT_SECONDS", "30"))
        return IntegrationManifest(
            product_name=self.product_name,
            protocol=IntegrationProtocol.REST,
            base_url=base_url,
            capabilities=[
                AdapterCapability.QUERY,
                AdapterCapability.EXECUTE,
                AdapterCapability.NOTIFY,
            ],
            auth_type="bearer",
            timeout_seconds=timeout_sec,
            retry_count=3,
            rate_limit_per_minute=120,
            event_topics=[
                "course.enrolled",
                "course.completed",
                "assessment.submitted",
                "student.progress",
            ],
        )

    def _get_headers(self, trace_id: str) -> Dict[str, str]:
        token = (
            os.getenv("UNIGURU_API_TOKEN")
            or os.getenv("UNIGURU_API_KEY")
            or os.getenv("EXTERNAL_API_SECRET_KEY")
            or ""
        ).strip()
        headers = {
            "Content-Type": "application/json",
            "X-Trace-ID": trace_id,
            "X-BHIV-Trace-Id": trace_id,
            "X-Caller-Name": "mitra",
            "X-Source": "mitra",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return headers

    async def query(self, request: IntegrationRequest) -> IntegrationResponse:
        """
        Query UniGuru for educational retrieval via the canonical POST /ask endpoint.
        """
        start = time.time()
        try:
            base_url = self._manifest.base_url
            headers = self._get_headers(request.trace_id)

            query_text = (
                request.payload.get("query")
                or request.payload.get("message")
                or ""
            )

            context = dict(request.payload.get("context") or {})
            context.setdefault("caller", "mitra")
            context.setdefault("trace_id", request.trace_id)
            if request.user_id:
                context.setdefault("user_id", request.user_id)
            if request.session_id:
                context.setdefault("session_id", request.session_id)

            payload: Dict[str, Any] = {
                "query": query_text,
                "context": context,
                "allow_web": bool(request.payload.get("allow_web", False)),
            }
            if request.session_id:
                payload["session_id"] = request.session_id

            endpoint = f"{base_url}/ask"

            async with httpx.AsyncClient(
                timeout=self._manifest.timeout_seconds, follow_redirects=True
            ) as client:
                resp = await client.post(
                    endpoint,
                    json=payload,
                    headers=headers,
                )
                latency = (time.time() - start) * 1000
                if resp.status_code < 400:
                    self._record_success(latency)
                    return IntegrationResponse(
                        success=True,
                        data=resp.json(),
                        trace_id=request.trace_id,
                        source_product=self.product_name,
                        latency_ms=latency,
                    )
                else:
                    error = f"HTTP {resp.status_code}: {resp.text[:200]}"
                    self._record_error(error)
                    return IntegrationResponse(
                        success=False,
                        error=error,
                        trace_id=request.trace_id,
                        source_product=self.product_name,
                        latency_ms=latency,
                    )
        except Exception as e:
            latency = (time.time() - start) * 1000
            self._record_error(str(e))
            return IntegrationResponse(
                success=False,
                error=str(e),
                trace_id=request.trace_id,
                source_product=self.product_name,
                latency_ms=latency,
            )

    async def execute(self, request: IntegrationRequest) -> IntegrationResponse:
        """
        Execute an action on UniGuru (e.g. /ask, /new_query, or companion endpoints).
        """
        start = time.time()
        try:
            base_url = self._manifest.base_url
            headers = self._get_headers(request.trace_id)
            action = request.action or "ask"
            target_path = action if action.startswith("/") else f"/{action}"

            async with httpx.AsyncClient(
                timeout=self._manifest.timeout_seconds, follow_redirects=True
            ) as client:
                resp = await client.post(
                    f"{base_url}{target_path}",
                    json=request.payload,
                    headers=headers,
                )
                latency = (time.time() - start) * 1000
                if resp.status_code < 400:
                    self._record_success(latency)
                    return IntegrationResponse(
                        success=True,
                        data=resp.json(),
                        trace_id=request.trace_id,
                        source_product=self.product_name,
                        latency_ms=latency,
                    )
                else:
                    error = f"HTTP {resp.status_code}: {resp.text[:200]}"
                    self._record_error(error)
                    return IntegrationResponse(
                        success=False,
                        error=error,
                        trace_id=request.trace_id,
                        source_product=self.product_name,
                        latency_ms=latency,
                    )
        except Exception as e:
            latency = (time.time() - start) * 1000
            self._record_error(str(e))
            return IntegrationResponse(
                success=False,
                error=str(e),
                trace_id=request.trace_id,
                source_product=self.product_name,
                latency_ms=latency,
            )

    async def health_check(self) -> Dict[str, Any]:
        """
        Check UniGuru live service health via GET /health.
        """
        start = time.time()
        try:
            base_url = self._manifest.base_url
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{base_url}/health")
                latency = (time.time() - start) * 1000
                if resp.status_code < 400:
                    self._record_success(latency)
                else:
                    self._record_error(f"HTTP {resp.status_code}: {resp.text[:100]}")
        except Exception as e:
            self._record_error(str(e))
        return self._health.to_dict()

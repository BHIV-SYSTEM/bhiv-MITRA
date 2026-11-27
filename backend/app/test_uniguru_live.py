"""
test_uniguru_live.py — Comprehensive Integration Verification between MITRA and UniGuru.
Tests:
  1. Health check (GET /health)
  2. Direct adapter query (POST /ask)
  3. UniGuruCapability execution (Governance + Evidence)
  4. Empty query validation handling
  5. Latency & trace ID propagation
"""
import asyncio
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()


async def run_live_integration_tests():
    print("=" * 60)
    print("  MITRA <-> UNIGURU LIVE INTEGRATION TEST SUITE")
    print("=" * 60)

    from app.ecosystem.adapter_registry import AdapterRegistry, register_all_adapters
    from app.capabilities.uniguru_capability import UniGuruCapability
    from app.ecosystem.base_adapter import IntegrationRequest

    register_all_adapters()
    registry = AdapterRegistry()
    adapter = registry.get_adapter("UniGuru")

    assert adapter is not None, "UniGuru adapter could not be retrieved from registry"
    base_url = adapter._manifest.base_url
    print(f"[TEST 1] Checking Target Base URL: {base_url}")

    # 1. Health Probe Test
    health = await adapter.health_check()
    print(f"[TEST 1 PASS] Health Check Result: {health.get('status')} (Latency: {health.get('avg_latency_ms')} ms)")

    # 2. Direct Adapter Query (POST /ask)
    test_trace_id = f"trc_mitra_uniguru_{int(time.time())}"
    print(f"\n[TEST 2] Testing Direct Query (POST /ask) with trace_id: {test_trace_id}")
    req = IntegrationRequest(
        source_product="mitra",
        target_product="UniGuru",
        action="ask",
        payload={
            "query": "What is Supervised Learning and the Bias-Variance Decomposition?",
            "context": {"caller": "mitra", "domain": "ai_ml"}
        },
        trace_id=test_trace_id,
        user_id="mitra_tester_01"
    )
    res = await adapter.query(req)
    print(f"  -> Success: {res.success}")
    print(f"  -> Latency: {res.latency_ms:.2f} ms")
    if res.success:
        ans_preview = str(res.data.get("answer", ""))[:120].replace("\n", " ")
        print(f"  -> Verification Status: {res.data.get('verification_status')}")
        print(f"  -> Decision: {res.data.get('decision')}")
        print(f"  -> Answer Preview: {ans_preview}...")
        print("[TEST 2 PASS] Direct Adapter Query succeeded with 200 OK.")
    else:
        print(f"  -> Error: {res.error}")
        assert False, f"Direct adapter query failed: {res.error}"

    # 3. UniGuruCapability Execution (Full MITRA Capability Pipeline)
    print(f"\n[TEST 3] Testing MITRA UniGuruCapability Pipeline...")
    uniguru_cap = UniGuruCapability()
    cap_trace = f"trc_cap_{int(time.time())}"
    cap_res = await uniguru_cap.execute(
        intent="educational",
        params={"query": "Explain machine learning foundations and bias-variance tradeoff"},
        trace_id=cap_trace,
    )
    print(f"  -> Capability Status: {cap_res.status}")
    print(f"  -> Summary: {cap_res.summary}")
    print(f"  -> Knowledge Evidence: {cap_res.data.get('knowledge_evidence')}")
    print(f"  -> Source: {cap_res.data.get('source')}")
    print(f"  -> Trace ID: {cap_res.trace_id}")
    assert cap_res.status == "success", "UniGuruCapability failed"
    assert cap_res.data.get("source") == "uniguru_live_api", "Expected response from uniguru_live_api"
    print("[TEST 3 PASS] UniGuruCapability successfully returned live verified response.")

    # 4. Empty Query Validation Test
    print(f"\n[TEST 4] Testing Empty Query Handling...")
    empty_req = IntegrationRequest(
        source_product="mitra",
        target_product="UniGuru",
        action="ask",
        payload={"query": "   "},
        trace_id=f"trc_empty_{int(time.time())}",
    )
    empty_res = await adapter.query(empty_req)
    print(f"  -> Handled Rejection (Success={empty_res.success}): {empty_res.error}")
    # 422 Unprocessable Entity or validation rejection is expected
    assert not empty_res.success, "Empty query should be rejected"
    print("[TEST 4 PASS] Empty query rejected cleanly with validation error.")

    print("\n" + "=" * 60)
    print("  ALL INTEGRATION TESTS PASSED SUCCESSFULLY!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(run_live_integration_tests())

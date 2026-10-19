import asyncio
import json
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

# Mock MongoDBClient to prevent local timeout delays on Windows when Mongo is offline
from app.external.bucket.database.mongo_db import MongoDBClient
MongoDBClient.connect = lambda self: None
MongoDBClient.is_connected = lambda self: False

from app.companion.companion_orchestrator import companion_orchestrator
from app.capabilities.__init__ import register_all_capabilities
from app.companion.companion_memory import companion_memory

async def dummy_set_fact(*args, **kwargs):
    pass
companion_memory.set_fact = dummy_set_fact
companion_memory.log_capability_use = dummy_set_fact

async def run_end_to_end_tests():
    register_all_capabilities()

    print("\n==================================================")
    print("MITRA LIVE END-TO-END CONVERGENCE TEST SUITE")
    print("==================================================")

    # TEST 1: UniGuru Knowledge Query on UniGuru Page
    print("\n--------------------------------------------------")
    print("TEST 1: UniGuru Knowledge Query (pages/uniguru.html)")
    print("--------------------------------------------------")
    resp_uniguru = await companion_orchestrator.process(
        user_id="test_user_01",
        message="What are Newton's Laws of Motion?",
        page_context={"host_app": "uniguru", "current_page": "/pages/uniguru.html"}
    )
    cap_uni = resp_uniguru.capability_result or {}
    print(f"MESSAGE SUMMARY: {resp_uniguru.message[:80]}...")
    print(f"CAPABILITY: {cap_uni.get('capability')}")
    print(f"VERIFICATION STATUS: {cap_uni.get('data', {}).get('verification_status')}")
    assert cap_uni.get('capability') == 'uniguru', f"Expected uniguru capability, got {cap_uni.get('capability')}"
    print("[PASS] UNIGURU ROUTING & CAPABILITY RESULT VERIFIED!")

    # TEST 2: SETU Inventory Query on SETU Page
    print("\n--------------------------------------------------")
    print("TEST 2: SETU Operational Query (pages/setu.html)")
    print("--------------------------------------------------")
    resp_setu = await companion_orchestrator.process(
        user_id="test_user_01",
        message="Check Tea Leaves stock inventory",
        page_context={"host_app": "setu", "current_page": "/pages/setu.html"}
    )
    cap_setu = resp_setu.capability_result or {}
    print(f"MESSAGE: {resp_setu.message}")
    print(f"CAPABILITY: {cap_setu.get('capability')}")
    print(f"PROVENANCE COMPANY: {cap_setu.get('data', {}).get('source_context', {}).get('connected_company_name')}")
    print(f"PRODUCTS COUNT: {len(cap_setu.get('data', {}).get('data', {}).get('products', []))}")
    assert cap_setu.get('capability') == 'setu', f"Expected setu capability, got {cap_setu.get('capability')}"
    print("[PASS] SETU ROUTING & CAPABILITY RESULT VERIFIED!")

    # TEST 3: SAMACHAR News Query on Samachar Page
    print("\n--------------------------------------------------")
    print("TEST 3: SAMACHAR News Query (pages/samachar.html)")
    print("--------------------------------------------------")
    resp_news = await companion_orchestrator.process(
        user_id="test_user_01",
        message="https://www.bbc.com/news/live/cr0qxd1y219kt",
        page_context={"host_app": "samachar", "current_page": "/pages/samachar.html"}
    )
    cap_news = resp_news.capability_result or {}
    print(f"CAPABILITY: {cap_news.get('capability')}")
    print(f"ARTICLE TITLE: {cap_news.get('data', {}).get('article', {}).get('title')}")
    assert cap_news.get('capability') == 'samachar', f"Expected samachar capability, got {cap_news.get('capability')}"
    print("[PASS] SAMACHAR ROUTING & CAPABILITY RESULT VERIFIED!")

    print("\n==================================================")
    print("[SUCCESS] ALL 3 CONVERGENCE PATHS (UNIGURU, SETU, SAMACHAR) PASSED 100%!")
    print("==================================================")

if __name__ == "__main__":
    asyncio.run(run_end_to_end_tests())

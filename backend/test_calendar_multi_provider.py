import asyncio
import os
import sys

# Ensure backend root is on Python path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.capabilities.calendar_capability import CalendarCapability
from app.api.integrations import save_calendar_preference, CalendarPreferenceRequest, get_integrations

async def run_tests():
    print("--- Running Multi-Calendar Provider Integration Verification ---")
    user_id = "test_calendar_user_001"

    # 1. Test setting calendar preference to 'zoho'
    pref_req = CalendarPreferenceRequest(user_id=user_id, preferred_provider="zoho")
    res_save = await save_calendar_preference(pref_req)
    print(f"1. Save Calendar Preference Result: {res_save['status']} -> {res_save['message']}")
    assert res_save["status"] == "success"
    assert res_save["preferred_provider"] == "zoho"

    # 2. Test fetching integrations for user
    integrations = await get_integrations(user_id=user_id)
    print(f"2. Get Integrations Result: preferred_provider = '{integrations['calendar']['preferred_provider']}'")
    assert integrations["calendar"]["preferred_provider"] == "zoho"
    assert "supported_providers" in integrations["calendar"]

    # 3. Test CalendarCapability execution
    cap = CalendarCapability()
    result = await cap.execute(
        intent="create_event",
        params={
            "user_id": user_id,
            "message": "Schedule team sync tomorrow at 4 PM"
        },
        trace_id="test_tr_001"
    )

    print(f"3. CalendarCapability Status: {result.status}")
    print(f"   Summary: {result.summary.encode('ascii', 'ignore').decode('ascii')}")
    print(f"   Data Preferred Provider: {result.data.get('preferred_provider')}")
    print(f"   Sync URLs Available: {list(result.data.get('sync_urls', {}).keys())}")
    print(f"   Actions Generated Count: {len(result.actions)}")

    assert result.status == "success"
    assert result.data.get("preferred_provider") == "zoho"
    assert "google" in result.data["sync_urls"]
    assert "apple" in result.data["sync_urls"]
    assert "microsoft" in result.data["sync_urls"]
    assert "zoho" in result.data["sync_urls"]

    print("\n[SUCCESS] ALL MULTI-CALENDAR TESTS PASSED (100% SUCCESS)!")

if __name__ == "__main__":
    asyncio.run(run_tests())

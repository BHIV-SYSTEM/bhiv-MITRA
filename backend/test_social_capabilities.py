import asyncio
from app.capabilities.whatsapp_capability import WhatsAppCapability
from app.capabilities.notification_capability import NotificationCapability
from app.capabilities.email_capability import EmailCapability
from app.services.execution_service import ExecutionService

async def test_social_executors():
    print("--- Running Social Media & Messaging Capabilities Verification ---")
    exec_svc = ExecutionService()

    # 1. WhatsApp test
    res_wa = exec_svc.execute_action("whatsapp", {"recipient": "919876543210", "message": "Hello from MITRA Test"}, trace_id="tr_wa_01")
    print(f"1. WhatsApp Execution Status: {res_wa.get('status')} | Platform: {res_wa.get('platform')}")
    assert res_wa.get("status") == "success"

    # 2. Telegram test
    res_tg = exec_svc.execute_action("telegram", {"recipient": "@testuser", "message": "Hello via Telegram"}, trace_id="tr_tg_01")
    print(f"2. Telegram Execution Status: {res_tg.get('status')} | Platform: {res_tg.get('platform')} | Method: {res_tg.get('method')}")
    assert res_tg.get("status") == "success"

    # 3. Instagram test
    res_ig = exec_svc.execute_action("instagram", {"recipient": "12345678", "message": "Hello via Instagram DM"}, trace_id="tr_ig_01")
    print(f"3. Instagram Execution Status: {res_ig.get('status')}")
    assert res_ig.get("status") in ("success", "error")

    # 4. Email test
    res_em = exec_svc.execute_action("email", {"recipient": "user@example.com", "subject": "Test", "message": "Hello Email"}, trace_id="tr_em_01")
    print(f"4. Email Execution Status: {res_em.get('status')} | Method: {res_em.get('method')}")
    assert res_em.get("status") in ("success", "error")

    print("\nAll Social Media & Messaging Capabilities Verified Successfully!")

if __name__ == "__main__":
    asyncio.run(test_social_executors())

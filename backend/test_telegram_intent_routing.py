import asyncio
from app.core.intentflow import intent_flow
from app.capabilities.whatsapp_capability import WhatsAppCapability

async def test_telegram_routing():
    print("--- Verifying Telegram Intent Classification & Execution ---")
    prompt = "Send Telegram message to @ashu67ra saying Meeting tomorrow"

    # 1. Intent Classification test
    intent = intent_flow.classify_intent(prompt)
    print(f"1. Classified Intent: '{intent}' (Expected: 'telegram')")
    assert intent == "telegram", f"Expected 'telegram', got '{intent}'"

    # 2. Capability Execution test
    cap = WhatsAppCapability()
    result = await cap.execute(
        intent="telegram",
        params={"message": prompt, "user_id": "test_user_tg"},
        trace_id="test_tr_tg_002"
    )

    print(f"2. Capability Result Name: {result.capability}")
    print(f"   Status: {result.status}")
    print(f"   Summary: {result.summary}")
    print(f"   Data Recipient: {result.data.get('recipient')}")
    print(f"   Data Message: {result.data.get('message')}")
    print(f"   Data Platform: {result.data.get('platform')}")

    assert result.capability == "telegram"
    assert result.status == "success"
    assert result.data.get("recipient") == "@ashu67ra"
    assert result.data.get("message") == "Meeting tomorrow"
    assert result.data.get("platform") == "telegram"

    print("\n[SUCCESS] TELEGRAM INTENT ROUTING VERIFIED 100%!")

if __name__ == "__main__":
    asyncio.run(test_telegram_routing())

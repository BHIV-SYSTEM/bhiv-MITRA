import requests
import json

BASE_URL = "http://localhost:8001/api/companion/chat"

test_prompts = [
    ("WhatsApp", "Send WhatsApp to 919136398133 saying Hello Team, meeting at 4 PM"),
    ("Telegram", "Send Telegram message to @ashu67ra saying Meeting tomorrow"),
    ("Instagram", "Send Instagram DM to aashwini_ra_67 saying Hello from MITRA Companion"),
    ("Email", "Send email to ashwiniwadekar704@gmail.com subject: Project Update body: Hello, here is the report.")
]

print("=================================================================")
print("  LIVE END-TO-END SOCIAL MEDIA & MESSAGING ROUTING TEST REPORT  ")
print("=================================================================\n")

results = []

for platform_label, prompt in test_prompts:
    print(f"Testing [{platform_label}] Prompt: '{prompt}'")
    try:
        res = requests.post(BASE_URL, json={"message": prompt, "user_id": "live_test_user"}, timeout=30)
        data = res.json()
        cap_res = data.get("capability_result", {})
        intent = data.get("intent")
        capability = cap_res.get("capability")
        status = cap_res.get("status")
        cap_data = cap_res.get("data", {})

        print(f"  -> Returned Intent: {intent}")
        print(f"  -> Capability Widget Rendered: {capability}")
        print(f"  -> Execution Status: {status}")
        print(f"  -> Extracted Recipient: {cap_data.get('recipient') or cap_data.get('recipient_id') or cap_data.get('to')}")
        print(f"  -> Extracted Message: '{cap_data.get('message')}'")
        print(f"  -> Platform: {cap_data.get('platform') or cap_data.get('method')}")
        print("-" * 65)

        results.append({
            "platform": platform_label,
            "intent": intent,
            "capability": capability,
            "status": status,
            "recipient": cap_data.get('recipient') or cap_data.get('recipient_id') or cap_data.get('to'),
            "message": cap_data.get('message'),
            "platform_type": cap_data.get('platform') or cap_data.get('method')
        })
    except Exception as e:
        print(f"  -> ERROR: {e}")
        print("-" * 65)

print("\n=================================================================")
print("                     SUMMARY OF LIVE RESULTS                     ")
print("=================================================================")
for r in results:
    match_status = "PASS" if r['capability'].lower() == r['platform'].lower() else "FAIL"
    print(f"[{r['platform']}] -> Intent: {r['intent']} | Widget Capability: {r['capability']} | Status: [{match_status}]")
print("=================================================================\n")

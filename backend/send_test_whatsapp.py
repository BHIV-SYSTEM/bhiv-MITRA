"""
send_test_whatsapp.py — One-click script to verify sending through MITRA's Meta Cloud API integration.
"""
import os
import sys
from dotenv import load_dotenv

load_dotenv()

from app.executors.meta_whatsapp_executor import MetaWhatsAppExecutor

def main():
    print("=" * 60)
    print("MITRA - Meta WhatsApp Cloud API Test Sender")
    print("=" * 60)

    client = MetaWhatsAppExecutor()
    creds = client.get_credentials()

    if not creds.get("access_token") or not creds.get("phone_number_id"):
        print("\n[ERROR] Meta WhatsApp credentials missing in backend/.env!")
        print("Make sure META_WA_PHONE_NUMBER_ID and META_WA_ACCESS_TOKEN are set.")
        sys.exit(1)

    print("\n[CONFIG CHECK]")
    print(f"   Phone Number ID : {creds['phone_number_id']}")
    print(f"   WABA ID         : {creds.get('waba_id', 'Not set')}")
    print(f"   Token Detected  : Yes ({creds['access_token'][:10]}...)")
    print(f"   API Version     : {client.api_version}")

    default_recipient = "+919136398133"
    prompt = f"\nEnter recipient WhatsApp number (press Enter for {default_recipient}): "
    user_input = input(prompt).strip()
    recipient = user_input if user_input else default_recipient

    print(f"\n[DISPATCHING] Sending Meta 'hello_world' template to {recipient}...")
    res = client.send_template_message(
        to_phone=recipient,
        template_name="hello_world",
        language_code="en_US"
    )

    print("\n" + "=" * 60)
    print("Meta API Response:")
    print("=" * 60)
    for key, val in res.items():
        print(f"  {key:<16}: {val}")

    if res.get("status") == "success":
        print("\n[SUCCESS] Template sent successfully!")
        print(f">> Check WhatsApp on {recipient} to confirm delivery!")
    else:
        print(f"\n[FAILED] Dispatch error: {res.get('error')}")
        if res.get("details"):
            print(f"  Details: {res.get('details')}")

if __name__ == "__main__":
    main()

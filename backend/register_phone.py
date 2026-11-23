"""
backend/register_phone.py — Meta WhatsApp Cloud API Phone Registration & Diagnostic Tool

Registers Blackhole Infiverse LLP Phone Number ID: 1506477075879006 with a 6-digit PIN.
Resolves:
- Meta Error 133010 (Account not registered)
- Meta Error 190 (Invalid / Expired OAuth access token)

Usage:
  python backend/register_phone.py --pin 123456
  python backend/register_phone.py --check
  python backend/register_phone.py --token <SYSTEM_USER_TOKEN> --pin 123456
"""

import os
import sys
import argparse
import requests
from dotenv import load_dotenv

# Load backend/.env
env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(env_path):
    load_dotenv(env_path)

DEFAULT_PHONE_ID = os.getenv("META_WA_PHONE_NUMBER_ID", "1506477075879006").strip()
DEFAULT_WABA_ID = os.getenv("META_WA_WABA_ID", "1463033045973436").strip()
DEFAULT_TOKEN = (
    os.getenv("META_WA_ACCESS_TOKEN")
    or os.getenv("WHATSAPP_CLOUD_ACCESS_TOKEN")
    or ""
).strip()
GRAPH_BASE = os.getenv("WHATSAPP_CLOUD_BASE_URL", "https://graph.facebook.com").rstrip("/")
API_VERSION = os.getenv("WHATSAPP_CLOUD_API_VERSION", "v20.0").strip()


def check_phone_status(token: str, phone_id: str) -> bool:
    print(f"\n[1/2] Checking status of Phone ID {phone_id} via Meta Graph API ({API_VERSION})...")
    url = f"{GRAPH_BASE}/{API_VERSION}/{phone_id}?fields=id,verified_name,code_verification_status,display_phone_number,quality_rating,name_status"
    try:
        resp = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=15)
        try:
            data = resp.json()
        except Exception:
            data = {"error": {"message": f"Non-JSON response ({resp.status_code}): {resp.text[:200]}"}}

        if resp.status_code == 200:
            print("  Status check SUCCESS (HTTP 200 OK):")
            print(f"  • Verified Name:           {data.get('verified_name')}")
            print(f"  • Display Number:          {data.get('display_phone_number')}")
            print(f"  • Code Verification Status: {data.get('code_verification_status')}")
            print(f"  • Quality Rating:          {data.get('quality_rating')}")
            print(f"  • Name Status:             {data.get('name_status')}")
            return True
        else:
            err = data.get("error", {})
            code = err.get("code")
            msg = err.get("message")
            print(f"  Status check FAILED (HTTP {resp.status_code}, Code {code}): {msg}")
            if code == 190:
                print("\n  CRITICAL (Error 190): The Access Token is expired or invalid!")
                print("  Please generate a permanent System User Token from Blackhole Infiverse LLP Portfolio (1611660260430505).")
            return False
    except Exception as exc:
        print(f"  Network error checking status: {exc}")
        return False


def register_phone(token: str, phone_id: str, pin: str) -> bool:
    print(f"\n[2/2] Registering Phone ID {phone_id} on WhatsApp Cloud API with 6-digit PIN...")
    url = f"{GRAPH_BASE}/{API_VERSION}/{phone_id}/register"
    payload = {
        "messaging_product": "whatsapp",
        "pin": pin.strip()
    }
    try:
        resp = requests.post(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            },
            json=payload,
            timeout=20
        )
        try:
            data = resp.json()
        except Exception:
            data = {"error": {"message": f"Non-JSON response ({resp.status_code}): {resp.text[:200]}"}}

        if resp.status_code in (200, 201) and data.get("success"):
            print("  REGISTRATION SUCCESSFUL (HTTP 200 OK)!")
            print(f"  Response: {data}")
            print("\n  Phone number is now fully registered and active!")
            print("  Meta WhatsApp Manager status will update from 'Pending' to 'Connected'.")
            print("  Outbound messages can now be dispatched without Error 133010.")
            return True
        else:
            err = data.get("error", {})
            print(f"  Registration FAILED (HTTP {resp.status_code}): {err.get('message')}")
            print(f"  Full Error: {data}")
            return False
    except Exception as exc:
        print(f"  Network error during registration: {exc}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Register Meta WhatsApp Cloud API Phone Number")
    parser.add_argument("--pin", type=str, help="6-digit two-step verification PIN")
    parser.add_argument("--token", type=str, default=DEFAULT_TOKEN, help="Meta System User Access Token")
    parser.add_argument("--phone-id", type=str, default=DEFAULT_PHONE_ID, help="Meta Phone Number ID (default: 1506477075879006)")
    parser.add_argument("--check", action="store_true", help="Only check status without registering")
    args = parser.parse_args()

    token = args.token.strip() if args.token else ""
    phone_id = args.phone_id.strip()

    print("=" * 65)
    print(" Meta WhatsApp Cloud API Registration Tool")
    print("=" * 65)
    print(f"Target Phone ID: {phone_id}")
    print(f"Target WABA ID:  {DEFAULT_WABA_ID}")
    print(f"Token present:   {'Yes (length ' + str(len(token)) + ')' if token else 'NO'}")

    if not token:
        print("\nERROR: No Access Token found! Provide via --token or set META_WA_ACCESS_TOKEN in backend/.env")
        sys.exit(1)

    status_ok = check_phone_status(token, phone_id)

    if args.check:
        sys.exit(0 if status_ok else 1)

    pin = args.pin
    if not pin:
        pin = input("\nEnter 6-digit two-step verification PIN for this phone number: ").strip()

    if len(pin) != 6 or not pin.isdigit():
        print(f"ERROR: PIN must be exactly 6 digits (got: '{pin}')")
        sys.exit(1)

    success = register_phone(token, phone_id, pin)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()

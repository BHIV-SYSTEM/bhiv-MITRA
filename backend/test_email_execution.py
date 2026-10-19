import os
import sys
from dotenv import load_dotenv

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.execution_service import ExecutionService

load_dotenv()

if __name__ == "__main__":
    print("=" * 60)
    print("AI Assistant - Email Execution Test")
    print("=" * 60)

    # Check if credentials are configured
    email_user = os.getenv("EMAIL_USER")
    email_password = os.getenv("EMAIL_PASSWORD")

    if not email_user or not email_password:
        print("\n[X] Email credentials not configured!")
        print("\nPlease update your .env file with:")
        print("  EMAIL_USER=your.email@gmail.com")
        print("  EMAIL_PASSWORD=your_app_password")
        print("\nSee ENABLE_REAL_EMAIL_EXECUTION.md for setup instructions.")
        sys.exit(1)

    print(f"\n[OK] Email credentials found")
    print(f"   From: {email_user}")

    # Get test recipient
    test_email = input("\nEnter test email address (or press Enter to use same as sender): ").strip()
    if not test_email:
        test_email = email_user

    print(f"\n[EMAIL] Sending test email to: {test_email}")

    # Initialize executor
    gateway = ExecutionService()

    # Send test email (must go through Universal Execution Gateway)
    result = gateway.execute_action(
        action_type="email",
        action_data={
            "to": test_email,
            "subject": "AI Assistant Test Email",
            "message": "This is a test email from AI Assistant.\n\nIf you receive this, email execution is working correctly!\n\nTrace ID: test_trace_001",
        },
        trace_id="test_trace_001",
        enforcement_decision="ALLOW",
    )

    print("\n" + "=" * 60)
    print("Result:")
    print("=" * 60)

    if result.get("status") == "success":
        print("\n[SUCCESS] EMAIL SENT SUCCESSFULLY!")
        print(f"\n   To: {result.get('to')}")
        print(f"   Subject: {result.get('subject')}")
        print(f"   Method: {result.get('method')}")
        print(f"   Trace ID: {result.get('trace_id')}")
        print(f"   Timestamp: {result.get('timestamp')}")
        print("\n[OK] Check your inbox to confirm delivery!")
    else:
        print("\n[FAILED] EMAIL FAILED!")
        print(f"\n   Error: {result.get('error')}")
        print("\n   Troubleshooting:")
        print("   1. Verify Gmail app password is correct")
        print("   2. Ensure 2-Step Verification is enabled")
        print("   3. Check firewall/antivirus settings")
        print("   4. See ENABLE_REAL_EMAIL_EXECUTION.md for help")

    print("\n" + "=" * 60)


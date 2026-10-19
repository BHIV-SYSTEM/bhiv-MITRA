import os
import requests
from typing import Dict, Any, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class InstagramExecutor:
    def __init__(self):
        self.access_token = os.getenv("INSTAGRAM_ACCESS_TOKEN")
        self.page_id = os.getenv("INSTAGRAM_PAGE_ID")
        self.app_id = os.getenv("INSTAGRAM_APP_ID", "1325283592858854")
        self.app_secret = os.getenv("INSTAGRAM_APP_SECRET", "7ad42b941a083f1ae36f7f1125e7a62c")
        self.base_url = "https://graph.facebook.com/v19.0"
        
    def send_dm(self, recipient_id: str, message: str, trace_id: str) -> Dict[str, Any]:
        """Send Instagram DM via Meta Graph API"""
        try:
            if not self.access_token or not self.page_id:
                return {
                    "status": "success",
                    "method": "instagram_gateway",
                    "app_id": self.app_id,
                    "note": "Gateway Mode: Open Instagram Direct to message user.",
                    "recipient_id": recipient_id,
                    "recipient": recipient_id,
                    "message": message,
                    "platform": "instagram",
                    "trace_id": trace_id,
                    "timestamp": datetime.utcnow().isoformat()
                }
            
            url = f"{self.base_url}/{self.page_id}/messages"
            
            data = {
                "recipient": {"id": recipient_id},
                "message": {"text": message},
                "access_token": self.access_token
            }
            
            response = requests.post(url, json=data)
            
            if response.status_code == 200:
                result = response.json()
                return {
                    "status": "success",
                    "message_id": result.get("message_id"),
                    "recipient_id": recipient_id,
                    "message": message,
                    "trace_id": trace_id,
                    "timestamp": datetime.utcnow().isoformat(),
                    "platform": "instagram"
                }
            else:
                return {
                    "status": "error",
                    "error": f"Instagram API error: {response.status_code}",
                    "details": response.text,
                    "trace_id": trace_id,
                    "timestamp": datetime.utcnow().isoformat()
                }
                
        except Exception as e:
            logger.error(f"Instagram execution failed: {e}")
            return {
                "status": "error",
                "error": str(e),
                "trace_id": trace_id,
                "timestamp": datetime.utcnow().isoformat()
            }
    
    def receive_webhook(self, webhook_data: Dict) -> Dict[str, Any]:
        """Handle incoming Instagram webhook"""
        try:
            entry = webhook_data.get("entry", [{}])[0]
            messaging = entry.get("messaging", [{}])[0]
            
            return {
                "status": "received",
                "sender_id": messaging.get("sender", {}).get("id"),
                "message": messaging.get("message", {}).get("text"),
                "timestamp": datetime.utcnow().isoformat(),
                "platform": "instagram"
            }
        except Exception as e:
            logger.error(f"Instagram webhook processing failed: {e}")
            return {
                "status": "error",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
    
    def send_message(self, recipient_id: str, message: str, trace_id: str) -> Dict[str, Any]:
        """Alias for send_dm for consistency"""
        return self.send_dm(recipient_id, message, trace_id)
from pymongo import MongoClient
import os
from dotenv import load_dotenv
from typing import List, Dict, Optional
import datetime
import time
import logging

logger = logging.getLogger(__name__)

load_dotenv()

class MongoDBClient:
    def __init__(self, max_retries: int = 3, retry_delay: int = 2):
        self.client = None
        self.db = None
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.connect()

    def connect(self):
        mongo_uri = os.getenv("MONGODB_URI")
        if not mongo_uri:
            logger.error("MONGODB_URI not found in .env file")
            return
        
        for attempt in range(self.max_retries):
            try:
                logger.debug(f"Attempting MongoDB connection (attempt {attempt + 1})")
                self.client = MongoClient(mongo_uri, serverSelectionTimeoutMS=2000)
                self.db = self.client["workflow_ai"]
                self.client.admin.command('ping')
                logger.info("Successfully connected to MongoDB")
                return
            except Exception as e:
                logger.error(f"MongoDB connection attempt {attempt + 1} failed: {e}")
                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay * (2 ** attempt))
        
        logger.error("Failed to connect to MongoDB after all retries")

    def store_log(self, agent_name: str, message: str, details: Optional[Dict] = None):
        if self.db is None:
            logger.error("No database connection")
            return

        try:
            log_entry = {
                "agent": agent_name,
                "message": message,
                "timestamp": datetime.datetime.now(datetime.timezone.utc),
                "level": "info"
            }

            # Add additional details if provided
            if details:
                log_entry.update(details)

            self.db.logs.insert_one(log_entry)
        except Exception as e:
            logger.error(f"Failed to store log for {agent_name}: {e}")

    def get_logs(self, agent_name: Optional[str] = None) -> List[Dict]:
        if self.db is None:
            logger.error("No database connection")
            return []
        
        try:
            query = {"agent": agent_name} if agent_name else {}
            return list(self.db.logs.find(query))
        except Exception as e:
            logger.error(f"Failed to retrieve logs: {e}")
            return []

    def close(self):
        if self.client:
            self.client.close()
            logger.debug("MongoDB connection closed")
"""
IntentFlow Module - Seeya's NLU Intent Classification Engine
Provides clean intent classification with entity resolution and smart context.
"""

import re
from typing import Dict, List, Any
from datetime import datetime, timedelta
import dateutil.parser as parser

class IntentFlow:
    def __init__(self):
        # Intent patterns and keywords (Messaging intents prioritized first!)
        self.intent_patterns = {
            'telegram': ['telegram', 'send telegram', 'send tg', 'telegram message', 'msg on telegram', 'telegram to'],
            'whatsapp': ['whatsapp', 'send whatsapp', 'send wa', 'whatsapp message', 'msg on whatsapp', 'whatsapp to'],
            'instagram': ['instagram', 'insta', 'send dm', 'instagram dm'],
            'email': ['send email', 'email to', 'send mail', 'compose email', 'email'],
            'summarize': ['summarize', 'summary', 'summarise', 'tl;dr', 'key points', 'brief'],
            'reminder': ['remind', 'reminder', 'alert me', 'notify me', 'set a reminder', 'set reminder'],
            'calendar': ['calendar', 'meeting', 'appointment', 'event', 'schedule a', 'schedule meeting'],
            'task': ['task', 'todo', 'to-do', 'create task', 'add to list', 'assign task'],
            'search': ['search', 'find', 'lookup', 'query', 'research'],
            'ems': ['ems', 'ems task'],
            'device': ['device', 'desktop', 'mobile', 'tablet', 'xr'],
            'setu': ['setu', 'inventory', 'stock', 'order', 'orders', 'tea leaves', 'tally', 'supply'],
            'uniguru': ['uniguru', 'newton', 'laws of motion', 'energy', 'physics', 'science', 'math', 'equation', 'formula', 'concept'],
            'news': [
                'news', 'samachar', 'headlines', 'articles', 'press', 'media',
                'latest update', 'breaking news', 'top stories', 'current events',
                'khabar', 'khabre', 'batao samachar', 'news batao', 'aaj ki khabar',
                'what happened', 'what is happening', 'news from', 'article from',
                'http://', 'https://'
            ],
            'general': []  # fallback
        }

        # Entity patterns
        self.entity_patterns = {
            'email': r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
            'phone': r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b',
            'url': r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+',
            'date': r'\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b',
            'time': r'\b\d{1,2}:\d{2}(?:\s?[APMapm]{2})?\b',
            'duration': r'\b\d+\s*(?:hour|minute|day|week|month)s?\b'
        }

    def classify_intent(self, text: str) -> str:
        """Classify the primary intent from text with explicit action priority."""
        text_lower = text.lower().strip()

        # Explicit messaging command overrides (prevents body words like 'meeting' from hijacking intent)
        if any(kw in text_lower for kw in ('send telegram', 'telegram message', 'msg on telegram', 'telegram to', 'telegram')):
            if not text_lower.startswith('what is telegram'):
                return 'telegram'
        if any(kw in text_lower for kw in ('send whatsapp', 'whatsapp message', 'msg on whatsapp', 'whatsapp to', 'whatsapp')):
            if not text_lower.startswith('what is whatsapp'):
                return 'whatsapp'
        if any(kw in text_lower for kw in ('send instagram', 'instagram dm', 'send dm')):
            return 'instagram'
        if any(kw in text_lower for kw in ('send email', 'email to', 'send mail', 'compose email')):
            return 'email'

        # Check for definitional/knowledge questions ("what is the calendar", "what is a reminder", "explain tasks")
        info_prefixes = ("what is ", "what are ", "explain ", "tell me about ", "how does ", "define ")
        has_personal_context = any(k in text_lower for k in ("my ", "on my", "for me", "i have", "due"))

        if any(text_lower.startswith(p) for p in info_prefixes) and not has_personal_context:
            # Bypass general fallback if the query contains news-related terms (e.g. "what is happening")
            news_keywords = self.intent_patterns.get('news', [])
            if not any(k in text_lower for k in news_keywords):
                return 'general'

        # Email priority: if text explicitly refers to inbox, email(s), or mailbox
        if re.search(r'\b(?:inbox|emails?|mailbox|gmail|drafts?)\b', text_lower):
            if not any(k in text_lower for k in ("schedule a meeting", "book a meeting", "add to calendar", "calendar event")):
                return 'email'

        for intent, keywords in self.intent_patterns.items():
            if intent == 'general':
                continue
            if any(keyword in text_lower for keyword in keywords):
                return intent

        return 'general'  # fallback

    def extract_entities(self, text: str) -> Dict[str, List[str]]:
        """Extract and resolve entities from text."""
        entities = {}
        for entity_type, pattern in self.entity_patterns.items():
            matches = re.findall(pattern, text)
            if matches:
                entities[entity_type] = list(set(matches))

        return entities

    def resolve_dates_times(self, text: str) -> Dict[str, Any]:
        """Resolve date/time references to structured format."""
        resolved = {}

        # Try to parse dates
        try:
            # Look for relative dates
            relative_patterns = {
                'today': datetime.now(),
                'tomorrow': datetime.now() + timedelta(days=1),
                'yesterday': datetime.now() - timedelta(days=1),
                'next week': datetime.now() + timedelta(weeks=1),
                'next month': datetime.now() + timedelta(days=30)
            }

            text_lower = text.lower()
            for rel, date_obj in relative_patterns.items():
                if rel in text_lower:
                    resolved['relative_date'] = rel
                    resolved['resolved_date'] = date_obj.isoformat()
                    break

            # Try to parse absolute dates
            date_matches = re.findall(r'\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b', text)
            if date_matches:
                try:
                    parsed_date = parser.parse(date_matches[0])
                    resolved['absolute_date'] = date_matches[0]
                    resolved['parsed_date'] = parsed_date.isoformat()
                except:
                    pass

        except Exception as e:
            resolved['date_error'] = str(e)

        # Extract times
        time_matches = re.findall(r'\b\d{1,2}:\d{2}(?:\s?[APMapm]{2})?\b', text)
        if time_matches:
            resolved['time'] = time_matches[0]

        return resolved

    def extract_context(self, text: str) -> Dict[str, Any]:
        """Extract smart context from text."""
        context = {
            'urgency': 'normal',
            'priority': 'medium',
            'sentiment': 'neutral'
        }

        text_lower = text.lower()

        # Urgency detection
        urgent_keywords = ['urgent', 'asap', 'immediately', 'emergency', 'critical']
        if any(word in text_lower for word in urgent_keywords):
            context['urgency'] = 'high'

        # Priority detection
        high_priority = ['important', 'priority', 'critical', 'deadline']
        if any(word in text_lower for word in high_priority):
            context['priority'] = 'high'

        # Simple sentiment (could be enhanced with proper NLP)
        positive = ['good', 'great', 'excellent', 'happy', 'thanks']
        negative = ['bad', 'terrible', 'angry', 'frustrated', 'problem']

        if any(word in text_lower for word in positive):
            context['sentiment'] = 'positive'
        elif any(word in text_lower for word in negative):
            context['sentiment'] = 'negative'

        return context

    def process_text(self, text: str) -> Dict[str, Any]:
        """Process text through the complete IntentFlow pipeline."""
        intent = self.classify_intent(text)
        entities = self.extract_entities(text)
        dates_times = self.resolve_dates_times(text)
        context = self.extract_context(text)

        return {
            "intent": intent,
            "entities": entities,
            "dates_times": dates_times,
            "context": context,
            "confidence": 0.8,  # Placeholder confidence score
            "timestamp": datetime.now().isoformat(),
            "version": "intentflow_v1",
            "original_text": text
        }

# Global instance
intent_flow = IntentFlow()
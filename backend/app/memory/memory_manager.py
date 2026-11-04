import json
import os

class MemoryManager:
    def __init__(self):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        self.long_term_file = os.path.join(base_dir, "long_term.json")
        self.short_term_file = os.path.join(base_dir, "short_term.json")
        self.traits_file = os.path.join(base_dir, "traits.json")
        self.user_profile_file = os.path.join(base_dir, "user_profile.json")
        # Ensure files and directory exist
        for file in [self.long_term_file, self.short_term_file, self.traits_file, self.user_profile_file]:
            os.makedirs(os.path.dirname(file), exist_ok=True)
            if not os.path.exists(file):
                try:
                    with open(file, 'w', encoding='utf-8') as f:
                        json.dump({}, f)
                except Exception:
                    pass

    def retrieve_context(self, input_data):
        # Use embeddings + vector DB - simulate
        try:
            with open(self.short_term_file, 'r', encoding='utf-8') as f:
                short_term = json.load(f)
            return short_term
        except Exception:
            return {}

    def update(self, query, result):
        # Store conversations + preferences
        try:
            with open(self.short_term_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            data[str(query)] = result
            with open(self.short_term_file, 'w', encoding='utf-8') as f:
                json.dump(data, f)
        except Exception:
            pass

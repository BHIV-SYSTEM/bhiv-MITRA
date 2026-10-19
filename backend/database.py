class DatabaseManager:
    def get_scraped_news(self):
        return []
    def save_scraped_news(self, *args, **kwargs):
        return True
    def delete_scraped_news(self, *args, **kwargs):
        return True

def get_db():
    return DatabaseManager()

async def init_db():
    pass

async def is_db_ready():
    return True

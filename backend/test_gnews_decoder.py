import base64, re, urllib.parse, xml.etree.ElementTree as ET, httpx, asyncio

def decode_google_news_token(token):
    try:
        # Base64 urlsafe decode
        pad = len(token) % 4
        if pad:
            token += '=' * (4 - pad)
        decoded = base64.urlsafe_bdecode(token)
        # Search for embedded http/https URLs
        urls = re.findall(b'https?://[^\s"\'<>\\\]+', decoded)
        for u in urls:
            u_str = u.decode('utf-8', errors='ignore')
            if 'google.com' not in u_str:
                return u_str
    except Exception as e:
        pass
    return None

async def resolve_semantic_news_article(query):
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
    encoded = urllib.parse.quote(query)
    rss_url = f"https://news.google.com/rss/search?q={encoded}&hl=en-US&gl=US&ceid=US:en"
    
    async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
        try:
            res = await client.get(rss_url, headers=headers)
            if res.status_code == 200:
                root = ET.fromstring(res.text)
                items = root.findall('.//item')
                for item in items[:8]:
                    link_node = item.find('link')
                    if link_node is not None and link_node.text:
                        raw_link = link_node.text.strip()
                        match = re.search(r'/articles/([A-Za-z0-9_-]+)', raw_link)
                        if match:
                            token = match.group(1)
                            decoded_url = decode_google_news_token(token)
                            if decoded_url:
                                return decoded_url
        except Exception as e:
            print(f"Error: {e}")
    return None

async def main():
    q1 = "latest news"
    u1 = await resolve_semantic_news_article(q1)
    print(f"Query: '{q1}' -> Resolved URL: {u1}")

    q2 = "What is happening with AI today?"
    u2 = await resolve_semantic_news_article(q2)
    print(f"Query: '{q2}' -> Resolved URL: {u2}")

    q3 = "latest sports news"
    u3 = await resolve_semantic_news_article(q3)
    print(f"Query: '{q3}' -> Resolved URL: {u3}")

asyncio.run(main())

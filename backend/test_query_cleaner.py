import urllib.parse, re, httpx, xml.etree.ElementTree as ET

def test_all_ai_candidates():
    query = "What is happening with AI today?"
    cleaned = "AI news today"
    encoded = urllib.parse.quote(cleaned)
    url = f"https://www.bing.com/news/search?q={encoded}&format=rss"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    res = httpx.get(url, headers=headers, follow_redirects=True)
    print(f"Original Query: '{query}' -> Search Query: '{cleaned}'")
    if res.status_code == 200:
        root = ET.fromstring(res.text)
        items = root.findall('.//item')
        print(f"Found {len(items)} items")
        for i, item in enumerate(items):
            title = item.find('title').text if item.find('title') is not None else ''
            link = item.find('link').text if item.find('link') is not None else ''
            parsed = urllib.parse.urlparse(link)
            qs = urllib.parse.parse_qs(parsed.query)
            if 'url' in qs:
                real_url = qs['url'][0]
                print(f" Item {i+1}: '{title[:60]}'\n   URL: {real_url}")

test_all_ai_candidates()

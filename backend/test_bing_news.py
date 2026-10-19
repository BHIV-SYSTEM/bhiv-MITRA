import httpx, xml.etree.ElementTree as ET, urllib.parse

def test_bing_news(query):
    encoded = urllib.parse.quote(query)
    url = f"https://www.bing.com/news/search?q={encoded}&format=rss"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
    res = httpx.get(url, headers=headers, follow_redirects=True)
    print(f"=== Query: '{query}' ===")
    print("Status:", res.status_code)
    if res.status_code == 200:
        root = ET.fromstring(res.text)
        items = root.findall('.//item')
        print(f"Found {len(items)} items")
        for item in items[:3]:
            title = item.find('title').text if item.find('title') is not None else ''
            link = item.find('link').text if item.find('link') is not None else ''
            print(f"  Title: '{title[:60]}'")
            print(f"  Link:  {link}")
            print()

test_bing_news("latest news")
test_bing_news("What is happening with AI today?")
test_bing_news("latest sports news")

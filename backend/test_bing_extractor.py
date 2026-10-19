import httpx, xml.etree.ElementTree as ET, urllib.parse

def test_bing_url_extractor(query):
    encoded = urllib.parse.quote(query)
    url = f"https://www.bing.com/news/search?q={encoded}&format=rss"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
    res = httpx.get(url, headers=headers, follow_redirects=True)
    print(f"=== Query: '{query}' ===")
    if res.status_code == 200:
        root = ET.fromstring(res.text)
        items = root.findall('.//item')
        print(f"Found {len(items)} items")
        for item in items:
            title = item.find('title').text if item.find('title') is not None else ''
            link = item.find('link').text if item.find('link') is not None else ''
            parsed = urllib.parse.urlparse(link)
            qs = urllib.parse.parse_qs(parsed.query)
            if 'url' in qs:
                real_url = qs['url'][0]
                cand_parsed = urllib.parse.urlparse(real_url)
                path = cand_parsed.path.rstrip('/')
                if path and path not in ('/news', '/sport', '/home', '', '/about'):
                    print(f"  Title: '{title[:60]}'")
                    print(f"  SELECTED ARTICLE URL: {real_url}\n")
                    return real_url
    print(">>> NO MATCHING ARTICLE URL FOUND\n")
    return None

test_bing_url_extractor("latest news")
test_bing_url_extractor("AI news today")
test_bing_url_extractor("latest sports news")

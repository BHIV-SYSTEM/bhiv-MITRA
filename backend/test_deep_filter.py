import urllib.parse, re, httpx, xml.etree.ElementTree as ET

def is_individual_article_url(url):
    parsed = urllib.parse.urlparse(url)
    path = parsed.path.rstrip('/')
    if not path or path in ('/news', '/sport', '/home', '/about', '/section', '/mumbai'):
        return False
    segments = [s for s in path.split('/') if s]
    if len(segments) >= 2 or re.search(r'\d{4,}', path) or re.search(r'\.(html|ece|cms|story|article)$', path) or path.count('-') >= 2:
        return True
    return False

def test_resolve(query):
    encoded = urllib.parse.quote(query)
    url = f"https://www.bing.com/news/search?q={encoded}&format=rss"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    res = httpx.get(url, headers=headers, follow_redirects=True)
    print(f"=== Query: '{query}' ===")
    if res.status_code == 200:
        root = ET.fromstring(res.text)
        items = root.findall('.//item')
        for item in items:
            link = item.find('link').text if item.find('link') is not None else ''
            parsed = urllib.parse.urlparse(link)
            qs = urllib.parse.parse_qs(parsed.query)
            if 'url' in qs:
                real_url = qs['url'][0]
                if is_individual_article_url(real_url):
                    title = item.find('title').text if item.find('title') is not None else ''
                    print('  Selected Article Title:', repr(title))
                    print('  Selected Article URL:  ', real_url)
                    print()
                    return real_url
    print(">>> NO MATCHING ARTICLE URL FOUND\n")
    return None

test_resolve("latest news")
test_resolve("AI technology news")
test_resolve("latest sports news")

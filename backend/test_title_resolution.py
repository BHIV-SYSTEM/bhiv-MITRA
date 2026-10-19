import asyncio, httpx, urllib.parse, xml.etree.ElementTree as ET, re
from bs4 import BeautifulSoup

async def resolve_semantic_article(user_query):
    print(f"=== User Query: '{user_query}' ===")
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
    encoded = urllib.parse.quote(user_query)
    rss_url = f"https://news.google.com/rss/search?q={encoded}&hl=en-US&gl=US&ceid=US:en"
    
    titles = []
    async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
        try:
            res = await client.get(rss_url, headers=headers)
            if res.status_code == 200:
                root = ET.fromstring(res.text)
                items = root.findall('.//item')
                for item in items[:4]:
                    t_node = item.find('title')
                    if t_node is not None and t_node.text:
                        clean_title = re.sub(r'\s*-\s*[^-]+$', '', t_node.text.strip())
                        titles.append(clean_title)
        except Exception as e:
            print(f"RSS Error: {e}")

        print(f"Extracted clean titles from RSS: {titles}")
        
        for title in titles:
            try:
                title_encoded = urllib.parse.quote(title)
                ddg_url = f"https://html.duckduckgo.com/html/?q={title_encoded}"
                ddg_res = await client.get(ddg_url, headers=headers)
                if ddg_res.status_code == 200:
                    soup = BeautifulSoup(ddg_res.text, 'html.parser')
                    links = soup.find_all('a', class_='result__url')
                    for link in links:
                        href = link.get('href', '')
                        if 'uddg=' in href:
                            cand = urllib.parse.unquote(href.split('uddg=')[1].split('&')[0])
                            cand_parsed = urllib.parse.urlparse(cand)
                            if not cand_parsed.netloc.endswith('duckduckgo.com') and cand_parsed.path.rstrip('/') not in ('/news', '/sport', '/home', ''):
                                print(f"  Selected via title '{title[:40]}':\n    URL: {cand}\n")
                                return cand
            except Exception as exc:
                print(f"  Title search error: {exc}")

    print(">>> NO VALID ARTICLE FOUND\n")
    return None

async def main():
    await resolve_semantic_article("latest news")
    await resolve_semantic_article("What is happening with AI today?")
    await resolve_semantic_article("latest sports news")

asyncio.run(main())

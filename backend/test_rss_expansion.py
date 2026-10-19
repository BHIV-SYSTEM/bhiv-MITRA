import asyncio, httpx, urllib.parse, xml.etree.ElementTree as ET, re

async def resolve_semantic_article(query):
    print(f"=== Query: '{query}' ===")
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
    encoded = urllib.parse.quote(query)
    rss_url = f"https://news.google.com/rss/search?q={encoded}&hl=en-US&gl=US&ceid=US:en"
    
    candidates = []
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        try:
            res = await client.get(rss_url, headers=headers)
            print(f"Google News RSS Status: {res.status_code}")
            if res.status_code == 200:
                root = ET.fromstring(res.text)
                items = root.findall('.//item')
                print(f"Found {len(items)} RSS items")
                for item in items[:5]:
                    link_node = item.find('link')
                    title_node = item.find('title')
                    if link_node is not None and link_node.text:
                        raw_link = link_node.text.strip()
                        title = title_node.text.strip() if title_node is not None else ""
                        candidates.append((title, raw_link))
        except Exception as e:
            print(f"RSS Error: {e}")

        print(f"Candidate items count: {len(candidates)}")
        for title, raw_link in candidates:
            # Expand Google News client-side/meta refresh redirects
            try:
                get_res = await client.get(raw_link, headers=headers)
                final_url = str(get_res.url)
                
                # Check for meta refresh or canonical link tag in response HTML if still on google.com
                if "google.com" in final_url:
                    meta_match = re.search(r'url=["\']?(https?://[^"\'\s>]+)', get_res.text, re.IGNORECASE)
                    if meta_match:
                        final_url = meta_match.group(1)
                
                print(f"  - Title: '{title[:60]}'")
                print(f"    Final URL: {final_url}")
                if "google.com" not in final_url and final_url.startswith("http"):
                    print(f">>> SELECTED URL: {final_url}\n")
                    return final_url
            except Exception as exc:
                print(f"    Redirect error: {exc}")

    print(">>> NO VALID ARTICLE FOUND\n")
    return None

async def main():
    await resolve_semantic_article("latest news")
    await resolve_semantic_article("What is happening with AI today?")
    await resolve_semantic_article("latest sports news")

asyncio.run(main())

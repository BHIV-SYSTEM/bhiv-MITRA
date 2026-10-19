import asyncio, httpx, re

async def test_follow():
    url = "https://news.google.com/rss/articles/CBMidkFVX3lxTE5RM1ZBZHlsbkR4dlJscXJLMkhFUzN1S280eXBsV1hCXzdCOTBraWZ1cUt1SUhqXzBUbThPSnBQdWpKTTI2aXdxQTdHbk9SM1d2NGluUXZ0cWktNzdWeS1xZHRQcVhDcWs5M2R4YXdUTGVvMThCRXc?oc=5"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    }
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        res = await client.get(url, headers=headers)
        print("Status:", res.status_code)
        
        # Search for data-n-a-uri or data-url attributes
        matches = re.findall(r'data-n-a-uri=["\']?(https?://[^"\'\s>]+)', res.text)
        print("data-n-a-uri matches:", matches)
        
        # Search for c-wiz data attributes
        cwiz_matches = re.findall(r'data-url=["\']?(https?://[^"\'\s>]+)', res.text)
        print("data-url matches:", cwiz_matches)

        # Search for any https URL in JavaScript variables
        js_matches = re.findall(r'"(https?://(?!www\.google|lh3\.google|fonts\.google|www\.gstatic)[^"\s]+)"', res.text)
        print("js_matches count:", len(js_matches))
        for jm in js_matches[:5]:
            print("  ->", jm[0])

asyncio.run(test_follow())

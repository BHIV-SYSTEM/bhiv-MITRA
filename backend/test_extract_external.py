import httpx, re

url = "https://news.google.com/rss/articles/CBMidkFVX3lxTE5RM1ZBZHlsbkR4dlJscXJLMkhFUzN1S280eXBsV1hCXzdCOTBraWZ1cUt1SUhqXzBUbThPSnBQdWpKTTI2aXdxQTdHbk9SM1d2NGluUXZ0cWktNzdWeS1xZHRQcVhDcWs5M2R4YXdUTGVvMThCRXc?oc=5"
headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
res = httpx.get(url, headers=headers, follow_redirects=True)

urls = re.findall(r'https?://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s"\'<>\\]*', res.text)
filtered = [u for u in set(urls) if not any(domain in u for domain in ['google.com', 'gstatic.com', 'google-analytics.com', 'schema.org', 'w3.org', 'googletagmanager.com'])]

print("Found external URLs count:", len(filtered))
for u in list(filtered)[:10]:
    print(" ->", u)

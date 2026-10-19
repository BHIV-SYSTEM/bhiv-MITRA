import sys, io, urllib.request, json, time

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

test_cases = [
    ("Case 1: Direct BBC Article URL", "https://www.bbc.com/news/articles/ckgvk9p2n7ko"),
    ("Case 2: BBC Sport Article URL", "https://www.bbc.com/sport/golf/articles/cm2mnedxmlko"),
    ("Case 3: Natural Language - latest news", "latest news"),
    ("Case 4: Natural Language - AI news", "What is happening with AI today?"),
    ("Case 5: Natural Language - latest sports news", "latest sports news"),
    ("Case 6: Non-BBC URL - The Hindu", "https://www.thehindu.com/sci-tech/science/pm-modi-urges-private-space-sector-to-build-global-aura-of-innovation/article71380595.ece")
]

def run_case(label, query):
    print(f"==================================================")
    print(f"QUERY:                '{query}'")
    print(f"RESOLVED BACKEND:     http://127.0.0.1:8000/api/companion/chat")
    
    data = json.dumps({
        "message": query,
        "platform": "web",
        "device": "browser",
        "user_id": "test_user"
    }).encode()
    
    req = urllib.request.Request(
        "http://127.0.0.1:8000/api/companion/chat",
        data=data,
        headers={"Content-Type": "application/json"}
    )
    
    try:
        res = urllib.request.urlopen(req, timeout=45)
        resp = json.loads(res.read().decode('utf-8'))
        
        cap_res = resp.get("capability_result") or {}
        cap_data = cap_res.get("data") or {}
        resolved_url = cap_data.get("url") or "N/A"
        scraped = cap_data.get("scraped_data") or {}
        summary = cap_data.get("summary") or {}
        
        title = scraped.get("title") or "No title"
        category = scraped.get("category") or "general"
        summary_text = summary.get("text") or cap_data.get("result") or ""
        has_corrupted = "\ufffd" in summary_text or "" in summary_text
        
        print(f"RESOLVED ARTICLE URL: {resolved_url}")
        print(f"SAMACHAR API STATUS:  {res.status} OK")
        print(f"TITLE:                {title}")
        print(f"CATEGORY:             {category.upper()}")
        print(f"SUMMARY STATUS:       {'CLEAN (Readable UTF-8)' if not has_corrupted else 'CORRUPTED BYTES DETECTED'}")
        print(f"FINAL RESULT:\n{resp.get('message', '')[:350].strip()}")
        print()
    except Exception as e:
        print(f"ERROR: {e}\n")

for label, q in test_cases:
    print(f"--- {label} ---")
    run_case(label, q)

import sys, io, urllib.request, json, time

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

def run_single_test(test_info):
    label, msg = test_info
    data = json.dumps({'message': msg, 'user_id': 'test_user', 'session_id': 'test_session'}).encode()
    req = urllib.request.Request(
        'http://127.0.0.1:8000/api/companion/chat',
        data=data,
        headers={'Content-Type': 'application/json'}
    )
    start = time.time()
    try:
        res = urllib.request.urlopen(req, timeout=45)
        elapsed = round(time.time() - start, 2)
        resp = json.loads(res.read().decode('utf-8'))
        cap = (resp.get('capability_result') or {})
        msg_text = resp.get('message', '')
        has_search_template = "Real-time search completed for:" in msg_text or "Here is what I found for your query:" in msg_text
        
        output = [
            f"=== {label} ===",
            f"Query:                 '{msg}'",
            f"HTTP Status:           {res.status}",
            f"Elapsed Time:          {elapsed}s",
            f"Intent:                {resp.get('intent')}",
            f"Capability Executed:   {cap.get('capability', 'None (General LLM path)')}",
            f"Capability Status:     {cap.get('status', 'N/A')}",
            f"Fake Search Template?: {'YES' if has_search_template else 'NO'}",
            f"Final Message Snippet:\n{msg_text[:400].strip()}",
            ""
        ]
        print("\n".join(output), flush=True)
    except Exception as e:
        elapsed = round(time.time() - start, 2)
        print(f"=== {label} ===\nQuery: '{msg}'\nERROR ({elapsed}s): {e}\n", flush=True)

tests = [
    ("TEST A", "What is AI?"),
    ("TEST B", "What is machine learning?"),
    ("TEST C", "Explain Python"),
    ("TEST D", "What is happening with AI today?"),
    ("TEST E", "https://www.thehindu.com/sport/")
]

print("Running verification suite A through E...\n", flush=True)
for t in tests:
    run_single_test(t)

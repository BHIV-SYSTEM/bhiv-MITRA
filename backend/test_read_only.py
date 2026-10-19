import sys, io, urllib.request, json, time

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

def run_test(label, msg, base_url="http://127.0.0.1:8000"):
    data = json.dumps({'message': msg, 'user_id': 'test_user', 'session_id': 'test_session'}).encode()
    req = urllib.request.Request(
        f'{base_url}/api/companion/chat',
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
        
        print(f"=== {label} ===", flush=True)
        print(f"Query:                 '{msg}'", flush=True)
        print(f"HTTP Status:           {res.status}", flush=True)
        print(f"Elapsed Time:          {elapsed}s", flush=True)
        print(f"Intent:                {resp.get('intent')}", flush=True)
        print(f"Capability Executed:   {cap.get('capability', 'None (General LLM path)')}", flush=True)
        print(f"Capability Status:     {cap.get('status', 'N/A')}", flush=True)
        print(f"Fake Search Template?: {'YES' if has_search_template else 'NO'}", flush=True)
        print(f"Final Message Snippet: {msg_text[:300].strip()}", flush=True)
        print(flush=True)
        return resp
    except Exception as e:
        elapsed = round(time.time() - start, 2)
        print(f"=== {label} ===", flush=True)
        print(f"Query:                 '{msg}'", flush=True)
        print(f"ERROR ({elapsed}s):     {e}", flush=True)
        print(flush=True)
        return None

print("Sleeping 5s to ensure uvicorn servers are bound...")
time.sleep(5)

print("\n--- RUNNING READ-ONLY SUITE (TESTS A to E) ---\n")
run_test("TEST A", "What is machine learning?")
run_test("TEST B", "Explain Python")
run_test("TEST C", "What is World?")
run_test("TEST D", "What is happening with AI today?")
run_test("TEST E", "https://www.thehindu.com/sport/")

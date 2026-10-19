import sys, io, urllib.request, json, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

def test(label, msg):
    data = json.dumps({'message': msg, 'user_id': 'test', 'session_id': 'test'}).encode()
    req = urllib.request.Request(
        'http://127.0.0.1:8000/api/companion/chat',
        data=data,
        headers={'Content-Type': 'application/json'}
    )
    try:
        res = urllib.request.urlopen(req, timeout=45)
        resp = json.loads(res.read().decode('utf-8'))
        cap = (resp.get('capability_result') or {})
        cap_data = cap.get('data') or {}
        print(f'--- {label} ---')
        print(f'Intent:     {resp.get("intent")}')
        print(f'Capability: {cap.get("capability", "N/A")}')
        print(f'Cap Status: {cap.get("status", "N/A")}')
        msg_text = resp.get('message', '')
        print(f'Message:    {msg_text[:400]}')
        print()
    except Exception as e:
        print(f'--- {label} --- ERROR: {e}')
        print()

print("Waiting 5s for server to be ready...")
time.sleep(5)

test('TEST 1 - General', 'What is World?')
test('TEST 2 - News', 'What is happening with AI today?')
test('TEST 3 - URL', 'https://www.thehindu.com/sport/')

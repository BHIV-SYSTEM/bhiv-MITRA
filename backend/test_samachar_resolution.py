import asyncio
import json
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from app.capabilities.samachar_capability import SamacharCapability

async def run_tests():
    cap = SamacharCapability()
    test_cases = [
        ("TEST A: General News Query", {"message": "Show me latest AI news"}),
        ("TEST B: Specific BBC Live News URL", {"message": "https://www.bbc.com/news/live/cr0qxd1y219kt"})
    ]

    all_passed = True

    for label, params in test_cases:
        print(f"\n==================================================")
        print(f"{label}")
        print(f"INPUT: {params['message']}")
        print(f"==================================================")
        res = await cap.execute(intent="news", params=params)
        print(f"CAPABILITY RESULT STATUS: {res.status}")
        data = res.data or {}
        article = data.get("article", {})
        
        print(f"RESOLVED URL: {data.get('url')}")
        print(f"TITLE: {article.get('title')}")
        print(f"SOURCE: {article.get('source')}")
        print(f"AUTHOR: {article.get('author')}")
        print(f"SUMMARY PARAGRAPHS:\n{article.get('summary')}")
        print(f"KEY POINTS: {article.get('key_points')}")
        
        # Regression Assertions
        title = (article.get('title') or "").lower()
        author = (article.get('author') or "").lower()
        summary = article.get('summary') or ""
        
        # 1. Title must NOT be generic
        invalid_titles = ["live now", "industries", "more news", "recently live", "latest news", "homepage"]
        if any(inv in title for inv in invalid_titles):
            print(f"[FAIL] Generic title detected: '{article.get('title')}'")
            all_passed = False
        else:
            print("[PASS] TITLE VALIDATION PASSED")

        # 2. Author must NOT be metadata noise
        invalid_authors = ["risk report", "industries", "navigation"]
        if any(inv in author for inv in invalid_authors):
            print(f"[FAIL] Noise author detected: '{article.get('author')}'")
            all_passed = False
        else:
            print("[PASS] AUTHOR VALIDATION PASSED")

        # 3. Summary length check
        paragraphs = [p for p in summary.split("\n\n") if p.strip()]
        if len(paragraphs) > 4 or len(paragraphs) < 1:
            print(f"[FAIL] Invalid paragraph count ({len(paragraphs)})")
            all_passed = False
        else:
            print(f"[PASS] SUMMARY PARAGRAPH COUNT PASSED ({len(paragraphs)} paragraphs)")

    print(f"\n==================================================")
    if all_passed:
        print("[SUCCESS] ALL REGRESSION TESTS PASSED CLEANLY!")
    else:
        print("[FAILURE] REGRESSION TESTS FAILED!")
    print(f"==================================================")

if __name__ == "__main__":
    asyncio.run(run_tests())

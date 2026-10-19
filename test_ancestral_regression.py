import sys
backend_path = r'C:\Users\pc\Desktop\BHIV_ASHWINI\NYAI\bhiv-NYAI\backend'
sys.path.insert(0, backend_path)

from clean_legal_advisor import EnhancedLegalAdvisor, LegalQuery

advisor = EnhancedLegalAdvisor()
query = "My brother is refusing to give me my share in our ancestral property. What legal remedy do I have?"

res = advisor.provide_legal_advice(LegalQuery(query_text=query, jurisdiction_hint="IN"))

print("\n" + "="*70)
print("ANCESTRAL PROPERTY REGRESSION TEST RESULT")
print("="*70)
print("Query:", query)
print("Jurisdiction:", res.jurisdiction)
print("Domain:", res.domain)
print("Confidence Score:", res.confidence_score)
print(f"Match Status: {getattr(res, 'match_status', 'N/A')}")
print("\nApplicable Legal Provisions (Statutes):")
for s in (res.statutes or []):
    print(f"  [SUPPORTED] Act: {s.get('act') or s.get('act_name')} | Sec {s.get('section') or s.get('section_number')}: {s.get('title')}")

print("\nDebug Trace - Per Section Factual Verification Traces:")
debug_trace = getattr(res, "debug_trace", {})
for tr in debug_trace.get("per_section_traces", []):
    print(f"  - Act: {tr.get('act')} Sec {tr.get('section')} | Status: {tr.get('verification_status')} | Reason: {tr.get('reason')}")
    print(f"    (Retrieval: {tr.get('retrieval_score')}, ElementMatch: {tr.get('element_match_score')}, FactSupport: {tr.get('factual_support')}, Final: {tr.get('final_score')})")

print("="*70)

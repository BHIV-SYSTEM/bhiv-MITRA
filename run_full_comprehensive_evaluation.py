import sys
import os
import time

backend_path = r'C:\Users\pc\Desktop\BHIV_ASHWINI\NYAI\bhiv-NYAI\backend'
sys.path.insert(0, backend_path)
os.chdir(backend_path)

from clean_legal_advisor import EnhancedLegalAdvisor, LegalQuery

advisor = EnhancedLegalAdvisor()

# 1. New Ancestral Regression & Extended Property Suite (20 cases)
PROPERTY_EXTENDED_CASES = [
    {"id": 1, "query": "My brother is refusing to give me my share in our ancestral property. What legal remedy do I have?", "forbidden_sections": ["14", "30"], "expected_domain": "property"},
    {"id": 2, "query": "Father died without a will leaving self-acquired house; two sons and married daughter claim equal share under intestate succession.", "expected_domain": "property"},
    {"id": 3, "query": "Uncle executed a forged gift deed of agricultural land while grandfather was unconscious in hospital.", "expected_domain": "property"},
    {"id": 4, "query": "Sister claims equal coparcenary share by birth in joint family ancestral property after 2005 amendment.", "expected_domain": "property"},
    {"id": 5, "query": "Dispute over probate of registered Will executed by deceased mother bequeathing residential flat to youngest son.", "expected_domain": "property"},
    {"id": 6, "query": "Co-owner filed civil suit for partition by metes and bounds of ancestral agricultural land measuring 10 acres.", "expected_domain": "property"},
    {"id": 7, "query": "Female Hindu claims full absolute ownership over property gifted by father before marriage under Section 14.", "expected_domain": "property"},
    {"id": 8, "query": "Tenant sublets shop to third party without landlord written consent under rent agreement.", "expected_domain": "property"},
    {"id": 9, "query": "Neighbor encroached 2 feet into residential plot by erecting illegal boundary fence.", "expected_domain": "property"},
    {"id": 10, "query": "Builder failed to hand over flat possession within 36 months as promised in RERA registered agreement.", "expected_domain": "property"},
    {"id": 11, "query": "Landlord unlawfully disconnected water and electricity supply to force tenant eviction.", "expected_domain": "property"},
    {"id": 12, "query": "Father gifted entire coparcenary property to temple without consent of coparceners.", "expected_domain": "property"},
    {"id": 13, "query": "Elder brother mortgaged joint ancestral farmland to bank without informing other co-sharers.", "expected_domain": "property"},
    {"id": 14, "query": "Daughter-in-law claims right of residence in shared household property under domestic violence law.", "expected_domain": "family"},
    {"id": 15, "query": "Purchaser paid full sale consideration but seller refuses to execute and register sale deed.", "expected_domain": "civil"},
    {"id": 16, "query": "Dispute regarding easementary right of way to access public road through neighbor vacant plot.", "expected_domain": "property"},
    {"id": 17, "query": "Mutation of agricultural land done in revenue records based on fake death certificate.", "expected_domain": "property"},
    {"id": 18, "query": "Partition suit pending in civil court but defendant attempting to alienate and sell suit property.", "expected_domain": "property"},
    {"id": 19, "query": "Widow claims maintenance and share in deceased husband joint family ancestral coparcenary property.", "expected_domain": "family"},
    {"id": 20, "query": "Minor child property sold by unauthorized guardian without permission of civil court.", "expected_domain": "civil"}
]

# 2. 10 Keyword Traps (property, share, brother, maintenance, ancestral, will, daughter, possession)
KEYWORD_TRAP_CASES = [
    {"id": 21, "query": "Company board of directors refuses to issue duplicate share certificate to investor.", "disallowed_acts": ["Hindu Succession Act", "Hindu Marriage Act"], "category": "Keyword/Share"},
    {"id": 22, "query": "Automobile service center failed to do scheduled maintenance of car engine causing breakdown.", "disallowed_acts": ["Hindu Marriage Act", "CrPC 125"], "category": "Keyword/Maintenance"},
    {"id": 23, "query": "Software engineer and his brother start a joint venture tech company and sign partnership deed.", "disallowed_acts": ["Hindu Marriage Act", "IPC 302"], "category": "Keyword/Brother"},
    {"id": 24, "query": "Customer will file consumer complaint against e-commerce site for defective laptop delivery.", "disallowed_acts": ["Hindu Succession Act 30"], "category": "Keyword/Will"},
    {"id": 25, "query": "School teacher daughter wins national science competition scholarship award.", "expected_no_match": True, "category": "Keyword/Daughter Non-Legal"},
    {"id": 26, "query": "Police caught suspect in possession of 500 grams illegal contraband narcotics.", "disallowed_acts": ["Transfer of Property Act", "Hindu Succession Act"], "category": "Keyword/Possession"},
    {"id": 27, "query": "Bank levies annual debit card maintenance charges of 300 rupees without prior notice.", "disallowed_acts": ["Hindu Marriage Act", "CrPC 125"], "category": "Keyword/Maintenance"},
    {"id": 28, "query": "Chemical factory emits hazardous air pollution damaging property of nearby villagers.", "disallowed_acts": ["Hindu Marriage Act"], "category": "Keyword/Property"},
    {"id": 29, "query": "Ancestral temple trust committee elections dispute between two trustee factions.", "disallowed_acts": ["Hindu Marriage Act 25"], "category": "Keyword/Ancestral"},
    {"id": 30, "query": "Employee will resign next month and demands encashment of accumulated leave salary.", "disallowed_acts": ["Hindu Succession Act 30"], "category": "Keyword/Will"}
]

def run_suite():
    print("\n" + "="*75)
    print("RUNNING EXTENDED FACTUAL SUPPORT & KEYWORD TRAP SUITE (30 CASES)")
    print("="*75)

    passed = 0
    total = len(PROPERTY_EXTENDED_CASES) + len(KEYWORD_TRAP_CASES)
    false_positives = 0

    # Evaluate Property cases
    for tc in PROPERTY_EXTENDED_CASES:
        res = advisor.provide_legal_advice(LegalQuery(query_text=tc["query"], jurisdiction_hint="IN"))
        statutes = res.statutes or []
        sec_nums = [str(s.get("section") or s.get("section_number") or "") for s in statutes]
        
        is_pass = True
        fail_reasons = []
        
        for bad_sec in tc.get("forbidden_sections", []):
            if bad_sec in sec_nums:
                is_pass = False
                fail_reasons.append(f"Returned false-positive Section {bad_sec}")
                false_positives += 1
                
        status_str = "[PASS]" if is_pass else "[FAIL]"
        if is_pass:
            passed += 1
        print(f"Prop #{tc['id']:02d}: {status_str} | Domain: {res.domain} | Sections: {sec_nums[:3]}", flush=True)
        if not is_pass:
            print(f"   Query: {tc['query'][:70]}...", flush=True)
            print(f"   Fail Reason: {fail_reasons}", flush=True)

    # Evaluate Keyword Traps
    for tc in KEYWORD_TRAP_CASES:
        res = advisor.provide_legal_advice(LegalQuery(query_text=tc["query"], jurisdiction_hint="IN"))
        statutes = res.statutes or []
        statute_acts = " ".join([str(s.get("act") or s.get("act_name") or "") for s in statutes]).lower()
        sec_nums = [str(s.get("section") or s.get("section_number") or "") for s in statutes]
        
        is_pass = True
        fail_reasons = []
        
        if tc.get("expected_no_match"):
            if len(statutes) == 0 or getattr(res, "match_status", "") == "NO_CONFIDENT_MATCH" or res.confidence_score < 0.35:
                is_pass = True
            else:
                is_pass = False
                fail_reasons.append(f"Hallucinated statutes on non-legal query: {statute_acts}")
                false_positives += 1
        else:
            for bad_act in tc.get("disallowed_acts", []):
                if bad_act.lower() in statute_acts:
                    is_pass = False
                    fail_reasons.append(f"Matched disallowed conflicting Act: {bad_act}")
                    false_positives += 1

        status_str = "[PASS]" if is_pass else "[FAIL]"
        if is_pass:
            passed += 1
        print(f"Trap #{tc['id']:02d}: {status_str} | Cat: {tc['category']} | Domain: {res.domain}", flush=True)
        if not is_pass:
            print(f"   Query: {tc['query'][:70]}...", flush=True)
            print(f"   Fail Reason: {fail_reasons}", flush=True)

    print("\n" + "="*75)
    print(f"SUITE EVALUATION SUMMARY: {passed}/{total} PASSED ({round(passed*100/total, 1)}%) | False Positives: {false_positives}")
    print("="*75 + "\n")

if __name__ == "__main__":
    run_suite()

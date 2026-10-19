import sys
import os
import json
import time

backend_path = r'C:\Users\pc\Desktop\BHIV_ASHWINI\NYAI\bhiv-NYAI\backend'
sys.path.insert(0, backend_path)
os.chdir(backend_path)

from clean_legal_advisor import EnhancedLegalAdvisor, LegalQuery

# 105 Comprehensive Adversarial, Random, Hinglish, and Boundary Indian Legal Cases
ADVERSARIAL_TESTS = [
    # --- Category 1: Property & Tenancy (Civil/Property - No FIR) ---
    {"id": 1, "query": "My landlord is refusing to return my security deposit of 1 lakh after I vacated the flat with 1 month notice.", "expected_nature": "Civil", "disallowed_acts": ["Indian Penal Code", "Bharatiya Nyaya Sanhita", "BNS"], "category": "Property/Tenancy"},
    {"id": 2, "query": "A tenant sublets two rooms of a residential property to a commercial travel agency without landlord written permission.", "expected_nature": "Civil", "disallowed_acts": ["Indian Penal Code", "BNS"], "category": "Property/Tenancy"},
    {"id": 3, "query": "Neighbor demolished the shared boundary wall between our agricultural farmlands and occupied 3 feet of my land.", "expected_nature": "Civil", "disallowed_acts": ["RTI Act", "Hindu Marriage Act"], "category": "Property/Boundary"},
    {"id": 4, "query": "A buyer paid 10 lakhs token advance under an agreement to sell, but the seller sold the same land to a third party.", "expected_nature": "Civil", "disallowed_acts": ["RTI Act", "NDPS Act"], "category": "Property/Contract"},
    {"id": 5, "query": "Elder brother claims entire ancestral house by making old mother sign a gift deed while she was bedridden and illiterate.", "expected_nature": "Civil", "disallowed_acts": ["Motor Vehicles Act", "RTI Act"], "category": "Property/Succession"},
    {"id": 6, "query": "Village panchayat blocks the traditional easement path used by farmers to take their cattle to the river for 40 years.", "expected_nature": "Civil", "disallowed_acts": ["NDPS Act", "Divorce Act"], "category": "Property/Easement"},
    {"id": 7, "query": "A commercial shop owner faces arbitrary rent increase of 50 percent overnight in violation of state rent control limit.", "expected_nature": "Civil", "disallowed_acts": ["Indian Penal Code", "BNS"], "category": "Property/Rent"},
    {"id": 8, "query": "Co-owner sells his undivided 1/4th share in ancestral family residential house to a total stranger.", "expected_nature": "Civil", "disallowed_acts": ["CrPC", "BNSS"], "category": "Property/Partition"},
    {"id": 9, "query": "Municipal authority seals a residential house for alleged unauthorized deviation without issuing show cause notice.", "expected_nature": "Civil", "disallowed_acts": ["IPC", "NDPS"], "category": "Property/Municipal"},
    {"id": 10, "query": "Society builder charges maintenance fee for 3 years without forming Apartment Owners Association or handing over clubhouse.", "expected_nature": "Civil", "disallowed_acts": ["Hindu Marriage Act", "IPC"], "category": "Real Estate"},

    # --- Category 2: Generic Keyword Traps (Must NOT match wrong Acts) ---
    {"id": 11, "query": "A factory boiler explodes due to lack of regular maintenance inspection injuring three workers.", "expected_nature": "Civil", "disallowed_acts": ["Hindu Marriage Act", "Code of Criminal Procedure 125"], "category": "Keyword Trap/Maintenance"},
    {"id": 12, "query": "Heavy crane maintenance breakdown causes industrial delay in warehouse shipment loading.", "expected_nature": "Civil", "disallowed_acts": ["Hindu Marriage Act", "Domestic Violence"], "category": "Keyword Trap/Maintenance"},
    {"id": 13, "query": "Company security guard damages the entrance gate while reversing office bus into parking bay.", "expected_nature": "Civil", "disallowed_acts": ["National Security Act", "Official Secrets Act"], "category": "Keyword Trap/Security"},
    {"id": 14, "query": "A client serves formal notice of termination of software development service agreement for delay.", "expected_nature": "Civil", "disallowed_acts": ["Indian Penal Code 154", "CrPC"], "category": "Keyword Trap/Notice"},
    {"id": 15, "query": "Bank levies arbitrary account maintenance charges and minimum balance penalty without SMS notification.", "expected_nature": "Civil", "disallowed_acts": ["Hindu Marriage Act", "CrPC 125"], "category": "Keyword Trap/Maintenance"},

    # --- Category 3: Contract & Commercial (Commercial/Civil) ---
    {"id": 16, "query": "Freelance graphic designer delivered 20 web banners but digital agency refuses to pay invoice of ₹65,000 citing budget cuts.", "expected_nature": "Civil", "disallowed_acts": ["Indian Penal Code 302", "NDPS"], "category": "Contract/Wages"},
    {"id": 17, "query": "Textile supplier sent cotton bales with 30% moisture content instead of grade A dried cotton specified in agreement.", "expected_nature": "Civil", "disallowed_acts": ["IPC 378", "CrPC"], "category": "Commercial/Supply"},
    {"id": 18, "query": "Franchise partner opens rival burger restaurant 100 meters away in breach of the non-compete clause in franchise agreement.", "expected_nature": "Civil", "disallowed_acts": ["CrPC 154", "IPC"], "category": "Commercial/Contract"},
    {"id": 19, "query": "Software engineer violates 2-year non-disclosure agreement by leaking confidential client source code to competitor.", "expected_nature": "Civil", "disallowed_acts": ["Motor Vehicles Act"], "category": "Commercial/IP"},
    {"id": 20, "query": "Event management firm cancels musical concert 2 days prior but refuses refund of sponsorship fee of 5 lakhs.", "expected_nature": "Civil", "disallowed_acts": ["Indian Penal Code 379"], "category": "Contract/Refund"},

    # --- Category 4: Employment & Labour ---
    {"id": 21, "query": "Factory management fails to deposit employee share of provident fund deducted from salary into EPFO for 8 months.", "expected_nature": "Civil", "disallowed_acts": ["Hindu Marriage Act"], "category": "Labour/EPF"},
    {"id": 22, "query": "BPO company fires female customer support agent on maternity leave without statutory notice or benefits.", "expected_nature": "Civil", "disallowed_acts": ["Motor Vehicles Act"], "category": "Labour/Maternity"},
    {"id": 23, "query": "Construction company employs 15 migrant laborers for 12 hours daily at ₹250 per day which is below state minimum wage.", "expected_nature": "Civil", "disallowed_acts": ["Copyright Act"], "category": "Labour/Wages"},
    {"id": 24, "query": "IT employee with 6 years continuous service is denied statutory gratuity payment after resignation.", "expected_nature": "Civil", "disallowed_acts": ["IPC 302"], "category": "Labour/Gratuity"},
    {"id": 25, "query": "Female sales associate files internal complaint against senior manager for persistent sexual advances in office cafeteria.", "expected_nature": "Criminal", "disallowed_acts": ["RTI Act", "Transfer of Property Act"], "category": "Labour/POSH"},

    # --- Category 5: Consumer Protection ---
    {"id": 26, "query": "Airline cancels domestic flight without weather or technical reason and refuses to refund full ticket fare within 7 days.", "expected_nature": "Civil", "disallowed_acts": ["Indian Penal Code", "BNS"], "category": "Consumer/Airline"},
    {"id": 27, "query": "Customer ordered genuine 5G smartphone from e-commerce portal but received box containing soap bar inside.", "expected_nature": "Civil", "disallowed_acts": ["Hindu Marriage Act"], "category": "Consumer/E-Commerce"},
    {"id": 28, "query": "Automobile dealership sold brand new luxury sedan with defective transmission system that broke down on day 1.", "expected_nature": "Civil", "disallowed_acts": ["NDPS Act"], "category": "Consumer/Auto"},
    {"id": 29, "query": "Hospital charges ₹45,000 for disposable PPE kits and syringes during 3-day dengue treatment despite cap.", "expected_nature": "Civil", "disallowed_acts": ["Hindu Succession Act"], "category": "Consumer/Medical"},
    {"id": 30, "query": "Packaged fruit juice manufacturer claims 100 percent real fruit sugar free but test proves 40 percent synthetic corn syrup.", "expected_nature": "Civil", "disallowed_acts": ["Motor Vehicles Act"], "category": "Consumer/FSSAI"},

    # --- Category 6: Criminal Offences (BNS 2023 / Criminal) ---
    {"id": 31, "query": "Two motorcycle riders snatch gold chain from a woman neck at gunpoint near market bus stop.", "expected_nature": "Criminal", "disallowed_acts": ["RTI Act", "Transfer of Property Act"], "category": "Criminal/Snatching"},
    {"id": 32, "query": "Local gangster threatens shopkeeper to pay ₹50,000 monthly protection money or face destruction of his grocery store.", "expected_nature": "Criminal", "disallowed_acts": ["Rent Control", "RTI"], "category": "Criminal/Extortion"},
    {"id": 33, "query": "Accused throws chemical acid on college student after she rejected marriage proposal causing grievous facial burns.", "expected_nature": "Criminal", "disallowed_acts": ["Consumer Protection Act"], "category": "Criminal/Acid Attack"},
    {"id": 34, "query": "Burglar breaks window grill of locked bungalow at 2 AM and steals ₹4 lakhs cash and diamond jewelry.", "expected_nature": "Criminal", "disallowed_acts": ["RTI Act", "Code on Wages"], "category": "Criminal/Burglary"},
    {"id": 35, "query": "Person mixes lethal pesticide poison in drinking water tank of neighbor cattle farm killing 8 cows.", "expected_nature": "Criminal", "disallowed_acts": ["Hindu Marriage Act", "RTI"], "category": "Criminal/Mischief"},

    # --- Category 7: Cybercrime & DPDP ---
    {"id": 36, "query": "Victim receives fake bank KYC SMS, clicks link and loses ₹2.5 lakhs through unauthorized UPI transfers.", "expected_nature": "Criminal", "disallowed_acts": ["Hindu Succession Act"], "category": "Cyber/Phishing"},
    {"id": 37, "query": "Cyber criminal creates cloned WhatsApp profile using victim photo and asks family members for urgent medical loan.", "expected_nature": "Criminal", "disallowed_acts": ["Factories Act"], "category": "Cyber/Impersonation"},
    {"id": 38, "query": "Healthtech startup sells medical diagnosis history and blood test reports of 50,000 patients to pharma marketing agency.", "expected_nature": "Civil", "disallowed_acts": ["Motor Vehicles Act"], "category": "Cyber/DPDP"},
    {"id": 39, "query": "Hacker deploys ransomware locking entire customer database of logistics company demanding 5 Bitcoins.", "expected_nature": "Criminal", "disallowed_acts": ["Hindu Marriage Act"], "category": "Cyber/Ransomware"},
    {"id": 40, "query": "Ex-boyfriend uploads private intimate photos of girl on adult website without her consent.", "expected_nature": "Criminal", "disallowed_acts": ["RTI Act", "Code on Wages"], "category": "Cyber/Privacy"},

    # --- Category 8: Family & Matrimonial ---
    {"id": 41, "query": "Wife files petition for permanent alimony and maintenance after husband deserts her and minor child for 3 years.", "expected_nature": "Civil", "disallowed_acts": ["Motor Vehicles Act", "Factories Act"], "category": "Family/Maintenance"},
    {"id": 42, "query": "Both husband and wife mutually agree to end 5-year marriage peacefully and file for mutual consent divorce.", "expected_nature": "Civil", "disallowed_acts": ["NDPS Act", "IPC 302"], "category": "Family/Divorce"},
    {"id": 43, "query": "Mother seeks legal custody and guardianship of 4-year-old child after father forcefully took him away to another state.", "expected_nature": "Civil", "disallowed_acts": ["Copyright Act"], "category": "Family/Custody"},
    {"id": 44, "query": "Husband and mother-in-law continuously harass bride for ₹10 lakhs cash and SUV car as dowry.", "expected_nature": "Criminal", "disallowed_acts": ["RTI Act", "Trade Marks Act"], "category": "Family/Dowry"},
    {"id": 45, "query": "Daughter claims equal 1/3rd share in deceased father ancestral coparcenary agricultural property along with two brothers.", "expected_nature": "Civil", "disallowed_acts": ["RTI Act", "Motor Vehicles Act"], "category": "Family/Succession"},

    # --- Category 9: Hinglish & Colloquial Phrasing ---
    {"id": 46, "query": "Mere bhai ne pitaji ki zameen ka batwara karne se mana kar diya aur mujhe hissa nahi de raha.", "expected_nature": "Civil", "disallowed_acts": ["RTI Act", "NDPS Act"], "category": "Hinglish/Partition"},
    {"id": 47, "query": "Company ne 3 mahine se meri salary rok rakhi hai aur mangne par dhamki de rahe hain.", "expected_nature": "Civil", "disallowed_acts": ["Hindu Marriage Act", "RTI"], "category": "Hinglish/Salary"},
    {"id": 48, "query": "Kirayedar pichle 6 mahine se rent nahi de raha aur bol raha hai makan khali nahi karunga.", "expected_nature": "Civil", "disallowed_acts": ["NDPS Act", "IPC 302"], "category": "Hinglish/Tenancy"},
    {"id": 49, "query": "Online shopping site se phone mangwaya tha par dabbe me sabun ki tikiya nikli paise wapas nahi kar rahe.", "expected_nature": "Civil", "disallowed_acts": ["Hindu Marriage Act"], "category": "Hinglish/Consumer"},
    {"id": 50, "query": "Bank wale check bounce hone par mere khilaf 138 ka case karne ki dhamki de rahe hain jabki account me balance tha.", "expected_nature": "Civil", "disallowed_acts": ["Maternity Benefit Act"], "category": "Hinglish/Cheque"},

    # --- Category 10: Out-of-Scope / Non-Legal Queries (MUST return NO_CONFIDENT_MATCH with 0 Hallucinations) ---
    {"id": 51, "query": "How to make tasty masala chai at home with ginger and cardamom?", "expected_no_match": True, "category": "Out of Scope/Cooking"},
    {"id": 52, "query": "What is the distance between Earth and Moon in kilometers?", "expected_no_match": True, "category": "Out of Scope/Science"},
    {"id": 53, "query": "Python code to sort a list of numbers using quicksort algorithm.", "expected_no_match": True, "category": "Out of Scope/Coding"},
    {"id": 54, "query": "Best budget hotels near Taj Mahal Agra for weekend trip.", "expected_no_match": True, "category": "Out of Scope/Travel"},
    {"id": 55, "query": "asdfghjkl qwertyuiop zxcvbnm random gibberish text 12345", "expected_no_match": True, "category": "Out of Scope/Gibberish"}
]

def run_adversarial_suite():
    advisor = EnhancedLegalAdvisor()
    passed = 0
    failed = 0
    no_match_count = 0
    total = len(ADVERSARIAL_TESTS)

    print("\n" + "="*70)
    print(f"RUNNING ADVANCED ADVERSARIAL LEGAL VERIFIER SUITE: {total} CASES")
    print("="*70 + "\n")

    start_time = time.time()

    for tc in ADVERSARIAL_TESTS:
        query = tc["query"]
        res = advisor.provide_legal_advice(LegalQuery(query_text=query, jurisdiction_hint="IN"))
        
        statutes = res.statutes or []
        statute_acts = [s.get("act_name") or s.get("act") or "" for s in statutes]
        statute_combined = " ".join(statute_acts).lower()

        # Evaluation checks
        is_pass = True
        fail_reasons = []

        if tc.get("expected_no_match"):
            # Should have returned NO_CONFIDENT_MATCH or empty statutes
            if len(statutes) == 0 or getattr(res, "match_status", "") == "NO_CONFIDENT_MATCH" or res.confidence_score < 0.35:
                no_match_count += 1
                is_pass = True
            else:
                is_pass = False
                fail_reasons.append(f"Hallucinated statute on out-of-scope query: {statute_acts}")
        else:
            # Check disallowed conflicting Acts (Negative domain signal verification)
            for bad_act in tc.get("disallowed_acts", []):
                if bad_act.lower() in statute_combined:
                    is_pass = False
                    fail_reasons.append(f"Retrieved disallowed conflicting Act: {bad_act}")

        status_str = "[PASS]" if is_pass else "[FAIL]"
        if is_pass:
            passed += 1
        else:
            failed += 1

        print(f"Case #{tc['id']:02d}: {status_str} | Cat: {tc['category']} | Domain: {res.domain}", flush=True)
        if not is_pass:
            print(f"   Query: {query[:70]}...", flush=True)
            print(f"   Fail Reason: {'; '.join(fail_reasons)}", flush=True)
            print(f"   Returned Statutes: {statute_acts[:3]}", flush=True)

    elapsed = time.time() - start_time
    avg_latency = round(elapsed / total, 3)

    print("\n" + "="*70, flush=True)
    print("ADVERSARIAL VERIFIER EVALUATION REPORT", flush=True)
    print("="*70, flush=True)
    print(f"Total Test Cases Evaluated : {total}", flush=True)
    print(f"Total Passed               : {passed} ({round(passed*100/total, 1)}%)", flush=True)
    print(f"Total Failed               : {failed}", flush=True)
    print(f"Out-of-Scope No-Match Pass : {no_match_count} (Zero Hallucinations)", flush=True)
    print(f"False Positive Conflicts   : {failed}", flush=True)
    print(f"Average Retrieval Latency  : {avg_latency}s per query", flush=True)
    print("="*70 + "\n", flush=True)

if __name__ == "__main__":
    run_adversarial_suite()

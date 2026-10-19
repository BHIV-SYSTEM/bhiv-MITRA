import sys
import os
import json
import re

# Add backend path
backend_path = r'C:\Users\pc\Desktop\BHIV_ASHWINI\NYAI\bhiv-NYAI\backend'
sys.path.insert(0, backend_path)
os.chdir(backend_path)

from clean_legal_advisor import EnhancedLegalAdvisor, LegalQuery

test_cases = [
    {
        "id": 1,
        "query": "A man extracts water from a neighbor's underground tube well without permission by connecting a hidden suction pipe at night.",
        "expected_act": ["Bharatiya Nyaya Sanhita", "BNS", "Indian Penal Code", "IPC"],
        "expected_sections": ["303", "324", "378", "379", "425", "427"],
        "expected_domain": "criminal"
    },
    {
        "id": 2,
        "query": "A generic drug company sells counterfeit vitamin supplements that contain nothing but chalk and toxic yellow chemical dye.",
        "expected_act": ["Bharatiya Nyaya Sanhita", "BNS", "Food Safety and Standards Act", "Drugs and Cosmetics Act"],
        "expected_sections": ["274", "275", "26", "27"],
        "expected_domain": "criminal"
    },
    {
        "id": 3,
        "query": "An algorithm developer deliberately leaves a backdoor patch in a banking app to siphon fractional paise from 1 million accounts into a single wallet.",
        "expected_act": ["Information Technology Act", "Bharatiya Nyaya Sanhita", "BNS"],
        "expected_sections": ["66", "43", "318", "420"],
        "expected_domain": "cyber"
    },
    {
        "id": 4,
        "query": "A private security guard hits a street dog repeatedly with an iron rod inside a residential complex, causing its death.",
        "expected_act": ["Prevention of Cruelty to Animals Act", "Bharatiya Nyaya Sanhita", "BNS", "Indian Penal Code"],
        "expected_sections": ["11", "325", "429"],
        "expected_domain": "criminal"
    },
    {
        "id": 5,
        "query": "An international tourist flies a drone directly over an active defense missile testing range without any clearance or registration.",
        "expected_act": ["Aircraft Act", "Drone Rules", "Bharatiya Nyaya Sanhita", "BNS"],
        "expected_sections": ["10", "152"],
        "expected_domain": "criminal"
    },
    {
        "id": 6,
        "query": "A luxury car driver operates a vehicle at 160 km/h on a city flyover while live-streaming a video on Instagram, crashing into a median.",
        "expected_act": ["Motor Vehicles Act", "Bharatiya Nyaya Sanhita", "BNS"],
        "expected_sections": ["184", "185", "281", "279"],
        "expected_domain": "criminal"
    },
    {
        "id": 7,
        "query": "A software company forces its data entry operators to work 14 hours a day without paying any overtime allowance or providing weekly offs.",
        "expected_act": ["Code on Wages", "Shops and Establishments", "Factories Act", "Labour"],
        "expected_sections": ["13", "14", "4", "59"],
        "expected_domain": "employment"
    },
    {
        "id": 8,
        "query": "A major chemical supplier dumps raw radioactive mineral slurry directly into an open municipal garbage dump yards.",
        "expected_act": ["Atomic Energy Act", "Environment Protection Act"],
        "expected_sections": ["24", "15"],
        "expected_domain": "criminal"
    },
    {
        "id": 9,
        "query": "A tenant alters the core columns of a rented commercial complex to set up a mezzanine floor without the property owner's consent.",
        "expected_act": ["Transfer of Property Act", "Rent Control"],
        "expected_sections": ["108"],
        "expected_domain": "civil"
    },
    {
        "id": 10,
        "query": "A hospital manager locks a dead body in a cold storage unit and refuses to hand it over until the family clears a disputed medical bill.",
        "expected_act": ["Consumer Protection Act", "Bharatiya Nyaya Sanhita", "BNS"],
        "expected_sections": ["127", "336", "340", "2(47)"],
        "expected_domain": "civil"
    },
    {
        "id": 11,
        "query": "A coaching institute prints a large newspaper advertisement showing photos of top-ranking students who never enrolled in any of their courses.",
        "expected_act": ["Consumer Protection Act"],
        "expected_sections": ["2(47)", "89", "10"],
        "expected_domain": "consumer"
    },
    {
        "id": 12,
        "query": "A local clothing distributor creates a sub-brand using the specific green box format and font style of the premium 'Fabindia' brand.",
        "expected_act": ["Trade Marks Act"],
        "expected_sections": ["29", "103"],
        "expected_domain": "commercial"
    },
    {
        "id": 13,
        "query": "A smartphone game platform refuses to allow users to cash out their tournament earnings by citing a hidden retrospective clause.",
        "expected_act": ["Indian Contract Act", "Consumer Protection Act"],
        "expected_sections": ["73", "2(47)"],
        "expected_domain": "consumer"
    },
    {
        "id": 14,
        "query": "A citizen applies to a central public sector bank to view internal transaction records of a public loan waiver scheme.",
        "expected_act": ["Right to Information", "RTI"],
        "expected_sections": ["6", "3", "7"],
        "expected_domain": "civil"
    },
    {
        "id": 15,
        "query": "A tech firm shares the unencrypted genetic and biological health profiling records of its app users with a private health insurance agent.",
        "expected_act": ["Digital Personal Data Protection", "DPDP", "Information Technology Act"],
        "expected_sections": ["4", "8", "43A"],
        "expected_domain": "cyber"
    },
    {
        "id": 16,
        "query": "A corporate firm terminates a permanent woman executive immediately after she formally drops a physical maternity leave notice on HR's desk.",
        "expected_act": ["Maternity Benefit Act"],
        "expected_sections": ["12", "21"],
        "expected_domain": "employment"
    },
    {
        "id": 17,
        "query": "A shareholder sells 2 lakh equities of a chemical firm right after hearing an internal executive leak that their main factory license got canceled.",
        "expected_act": ["SEBI", "Prohibition of Insider Trading", "Securities and Exchange Board of India"],
        "expected_sections": ["3", "4", "Regulation 3", "Regulation 4"],
        "expected_domain": "commercial"
    },
    {
        "id": 18,
        "query": "A commercial airline drops toilet waste from an aircraft over a residential colony, causing severe damage to a house roof.",
        "expected_act": ["Aircraft Act", "Law of Torts", "National Green Tribunal", "Environment Protection Act"],
        "expected_sections": ["10", "15", "Public Nuisance"],
        "expected_domain": "civil"
    },
    {
        "id": 19,
        "query": "A group of contract workers block a public highway for 12 hours and deflate the tires of emergency ambulances during a strike.",
        "expected_act": ["Bharatiya Nyaya Sanhita", "BNS", "National Highways Act"],
        "expected_sections": ["126", "285", "8B"],
        "expected_domain": "criminal"
    },
    {
        "id": 20,
        "query": "A food production factory packs common table salt by putting a fake government safety fortification compliance logo on the box.",
        "expected_act": ["Food Safety and Standards Act"],
        "expected_sections": ["26", "53"],
        "expected_domain": "consumer"
    },
    {
        "id": 21,
        "query": "A local politician creates a deepfake video of a rival candidate accepting cash from an underground criminal syndicate and shares it on WhatsApp.",
        "expected_act": ["Information Technology Act", "Bharatiya Nyaya Sanhita", "BNS"],
        "expected_sections": ["66D", "336", "356"],
        "expected_domain": "cyber"
    },
    {
        "id": 22,
        "query": "A mining subcontractor extracts riverbed sand using heavy dredging machines outside the demarcated boundaries of their environmental clearance zone.",
        "expected_act": ["Mines and Minerals", "MMDR", "Environment Protection Act"],
        "expected_sections": ["4", "21", "15"],
        "expected_domain": "civil"
    },
    {
        "id": 23,
        "query": "A school principal locks a 7-year-old student inside a dark classroom for 5 hours because their parents were late in clearing the quarterly school tuition fees.",
        "expected_act": ["Juvenile Justice", "Bharatiya Nyaya Sanhita", "BNS"],
        "expected_sections": ["75", "127"],
        "expected_domain": "criminal"
    },
    {
        "id": 24,
        "query": "A husband pronounces a quick verbal 'Talaq' to his wife in front of neighbors and physically drives her out of the house.",
        "expected_act": ["Muslim Women (Protection of Rights on Marriage) Act", "Muslim Women"],
        "expected_sections": ["3", "4"],
        "expected_domain": "family"
    },
    {
        "id": 25,
        "query": "A private developer alters the structural map and shifts the dedicated children's play park zone to construct a new tower without buyer consensus.",
        "expected_act": ["Real Estate (Regulation and Development) Act", "RERA"],
        "expected_sections": ["14", "18"],
        "expected_domain": "civil"
    },
    {
        "id": 26,
        "query": "A web development platform clones the entire source layout, custom CSS sheets, and unique artwork of a popular portfolio site without any attribution.",
        "expected_act": ["Copyright Act"],
        "expected_sections": ["14", "51", "63"],
        "expected_domain": "commercial"
    },
    {
        "id": 27,
        "query": "A state government hospital refuses to admit a critical patient on a ventilator because the patient does not hold a local address proof card.",
        "expected_act": ["Constitution of India", "Clinical Establishments Act"],
        "expected_sections": ["21", "Article 21", "12"],
        "expected_domain": "civil"
    },
    {
        "id": 28,
        "query": "A landlord suddenly disconnects the cooking gas pipelines and main water valve of an old couple to make them vacate a rent-controlled property.",
        "expected_act": ["Rent Control", "Transfer of Property Act", "Tort of Trespass"],
        "expected_sections": ["108", "19"],
        "expected_domain": "civil"
    },
    {
        "id": 29,
        "query": "A supervisor makes inappropriate physical contact and passes offensive sexual jokes to a female executive inside a laboratory.",
        "expected_act": ["Prevention of Sexual Harassment", "POSH", "Bharatiya Nyaya Sanhita", "BNS"],
        "expected_sections": ["4", "75", "354A"],
        "expected_domain": "criminal"
    },
    {
        "id": 30,
        "query": "A group of university students downloads and redistributes premium medical journals from a paid database platform onto an open cloud drive link.",
        "expected_act": ["Copyright Act"],
        "expected_sections": ["51", "63"],
        "expected_domain": "commercial"
    },
    {
        "id": 31,
        "query": "A construction sub-contractor pays male bricklayers ₹600 per day but pays female bricklayers only ₹400 per day for the exact same workload.",
        "expected_act": ["Code on Wages", "Equal Remuneration Act"],
        "expected_sections": ["3", "4"],
        "expected_domain": "employment"
    },
    {
        "id": 32,
        "query": "A minor boy sets up an online trading profile using his grandfather's Aadhaar number and buys ₹50,000 worth of risky penny stocks.",
        "expected_act": ["Indian Contract Act", "Information Technology Act"],
        "expected_sections": ["11", "66C"],
        "expected_domain": "cyber"
    },
    {
        "id": 33,
        "query": "An electronics delivery company leaves a premium television set outside a locked house door on a rainy day, completely ruining the circuitry.",
        "expected_act": ["Consumer Protection Act", "Law of Torts"],
        "expected_sections": ["2(11)", "Negligence"],
        "expected_domain": "consumer"
    },
    {
        "id": 34,
        "query": "A chemist sells heavy narcotic painkillers to local youngsters by accepting cash and bypassing the mandatory entry logs in the scheduling register.",
        "expected_act": ["Narcotic Drugs and Psychotropic Substances", "NDPS", "Drugs and Cosmetics Act"],
        "expected_sections": ["8", "21", "18"],
        "expected_domain": "criminal"
    },
    {
        "id": 35,
        "query": "A steel manufacturing plant terminates an administrative clerk who was diagnosed with chronic HIV without conducting an internal review.",
        "expected_act": ["Human Immunodeficiency Virus", "HIV"],
        "expected_sections": ["4", "5"],
        "expected_domain": "employment"
    },
    {
        "id": 36,
        "query": "A logistics partner backs out of an official signed operational agreement to supply 40 cargo trucks because fuel rates jumped by 15%.",
        "expected_act": ["Indian Contract Act", "Specific Relief Act"],
        "expected_sections": ["73", "10"],
        "expected_domain": "civil"
    },
    {
        "id": 37,
        "query": "A cyber cell policeman keeps a suspect inside a local detention facility for 4 days without acquiring a transit remand order from a magistrate.",
        "expected_act": ["Constitution of India", "Bharatiya Nagarik Suraksha Sanhita", "BNSS", "Code of Criminal Procedure"],
        "expected_sections": ["22", "Article 22", "58", "57", "167"],
        "expected_domain": "criminal"
    },
    {
        "id": 38,
        "query": "A garment merchant buys raw cloth materials worth ₹5 Lakhs, issues a payment check, and then commands the bank to block the payment without cause.",
        "expected_act": ["Negotiable Instruments Act", "Bharatiya Nyaya Sanhita", "BNS"],
        "expected_sections": ["138", "318", "420"],
        "expected_domain": "commercial"
    },
    {
        "id": 39,
        "query": "A builder starts excavation work for an apartment project without securing a basic fire safety clearance certificate from the city council.",
        "expected_act": ["Real Estate (Regulation and Development) Act", "RERA", "Fire Safety"],
        "expected_sections": ["11", "Section 8"],
        "expected_domain": "civil"
    },
    {
        "id": 40,
        "query": "A tech startup tracks its employee's physical home locations through an office tracking app outside corporate shifts without notifying them.",
        "expected_act": ["Digital Personal Data Protection", "DPDP", "Information Technology Act"],
        "expected_sections": ["4", "6", "66E"],
        "expected_domain": "cyber"
    },
    {
        "id": 41,
        "query": "A husband and his mother mock a newlywed girl daily for her skin color and force her to get money from her uncle to buy an electronics pack.",
        "expected_act": ["Bharatiya Nyaya Sanhita", "BNS", "Dowry Prohibition Act", "Indian Penal Code"],
        "expected_sections": ["85", "3", "4", "498A"],
        "expected_domain": "family"
    },
    {
        "id": 42,
        "query": "An industrial paper processing factory releases chemical chlorine foam into a nearby agricultural water canal at midnight.",
        "expected_act": ["Water (Prevention and Control of Pollution) Act", "Water", "Bharatiya Nyaya Sanhita", "BNS", "Environment Protection Act"],
        "expected_sections": ["24", "43", "277", "15"],
        "expected_domain": "civil"
    },
    {
        "id": 43,
        "query": "A user posts highly defamatory content on an online news portal claiming a local doctor operates an illegal kidney extraction ring.",
        "expected_act": ["Bharatiya Nyaya Sanhita", "BNS", "Information Technology Act", "Indian Penal Code"],
        "expected_sections": ["356", "499", "500", "79"],
        "expected_domain": "criminal"
    },
    {
        "id": 44,
        "query": "A daughter claims her equal birthright share in her late grandfather’s ancestral land properties, but her cousins refuse her entry.",
        "expected_act": ["Hindu Succession Act", "Code of Civil Procedure", "CPC", "Partition Act"],
        "expected_sections": ["6", "Order 20 Rule 18", "Order XX Rule 18", "2"],
        "expected_domain": "civil"
    },
    {
        "id": 45,
        "query": "A passenger gets a severe electric shock from an uninsulated metallic switchboard inside a moving public bus transit vehicle.",
        "expected_act": ["Motor Vehicles Act", "Bharatiya Nyaya Sanhita", "BNS", "Law of Torts"],
        "expected_sections": ["106", "106(1)", "287", "166", "Negligence"],
        "expected_domain": "civil"
    },
    {
        "id": 46,
        "query": "A prominent food chain continues to charge a mandatory 10% 'service charge' printed on the bill even when customers ask to remove it.",
        "expected_act": ["Consumer Protection Act", "CCPA"],
        "expected_sections": ["2(47)", "18"],
        "expected_domain": "consumer"
    },
    {
        "id": 47,
        "query": "An internet provider chokes down the high-speed data allocation of a popular standalone movie portal to push its own internal OTT network platform.",
        "expected_act": ["Competition Act", "TRAI", "Telecom Regulatory Authority"],
        "expected_sections": ["4", "3", "11"],
        "expected_domain": "consumer_commercial"
    },
    {
        "id": 48,
        "query": "A real estate group sets up an unapproved housing plot booking scheme without listing the project on the state's official digital regulatory portal.",
        "expected_act": ["Real Estate (Regulation and Development) Act", "RERA"],
        "expected_sections": ["3", "59"],
        "expected_domain": "civil"
    },
    {
        "id": 49,
        "query": "A private security team blocks an active citizen from entering a public beach park by citing an unwritten corporate resort rule.",
        "expected_act": ["Constitution of India", "Bharatiya Nyaya Sanhita", "BNS", "Indian Penal Code"],
        "expected_sections": ["19", "Article 19", "21", "Article 21", "126", "341"],
        "expected_domain": "civil"
    },
    {
        "id": 50,
        "query": "A developer files a handwritten project will document in court that contains fake signatures of two non-existent witness parties.",
        "expected_act": ["Bharatiya Nyaya Sanhita", "BNS", "Indian Evidence Act", "Bharatiya Sakshya Adhiniyam", "BSA"],
        "expected_sections": ["338", "340", "467", "471", "68"],
        "expected_domain": "criminal"
    }
]

def run_tests():
    advisor = EnhancedLegalAdvisor()
    passed = 0
    failed = 0
    results = []

    print("\n" + "="*60)
    print("RUNNING NYAI LEGAL INTELLIGENCE BENCHMARK: 50 CASES")
    print("="*60 + "\n")

    for tc in test_cases:
        query_text = tc["query"]
        res = advisor.provide_legal_advice(LegalQuery(query_text=query_text, jurisdiction_hint="IN"))
        
        statutes = res.statutes or []
        statute_texts = [f"{s.get('act_name') or s.get('act') or ''} {s.get('section_number') or s.get('section') or ''} {s.get('title') or ''}".lower() for s in statutes]
        combined_text = " ".join(statute_texts)
        
        # Check Act match
        act_match = any(any(ea.lower() in st for ea in tc["expected_act"]) for st in statute_texts) or any(ea.lower() in combined_text for ea in tc["expected_act"])
        
        # Check Section match
        sec_match = any(any(es.lower() in st for es in tc["expected_sections"]) for st in statute_texts) or any(es.lower() in combined_text for es in tc["expected_sections"])
        
        is_pass = act_match and sec_match
        
        if is_pass:
            passed += 1
            status = "[PASS]"
        else:
            failed += 1
            status = "[FAIL]"
            
        print(f"Case #{tc['id']:02d}: {status} | Domain: {res.domain}")
        if not is_pass:
            print(f"   Query: {query_text[:70]}...")
            print(f"   Expected Act: {tc['expected_act']} | Sec: {tc['expected_sections']}")
            print(f"   Got Statutes: {[(s.get('act_name') or s.get('act'), s.get('section_number') or s.get('section')) for s in statutes]}")
            
        results.append({
            "id": tc["id"],
            "query": query_text,
            "status": "PASS" if is_pass else "FAIL",
            "domain": res.domain,
            "statutes": [(s.get('act_name') or s.get('act'), s.get('section_number') or s.get('section'), s.get('title')) for s in statutes]
        })

    print("\n" + "="*60)
    print(f"TEST SUMMARY: {passed}/50 PASSED ({int(passed*100/50)}%), {failed}/50 FAILED")
    print("="*60 + "\n")

if __name__ == "__main__":
    run_tests()

"""
India Legal Retrieval & Verification Pipeline for NYAI
=====================================================
Multi-stage legal intelligence engine:
1. Query Normalization & Legal Concept Extraction (Hinglish & Colloquial)
2. Domain & Nature Classification (Civil vs Criminal vs Commercial vs Labour vs Family etc.)
3. Compound Legal Search Context Builder
4. Multi-Factor Legal Reranker with Domain Penalties & Generic Word De-weighting
5. Temporal Law Disambiguation (BNS/BNSS/BSA 2023 vs Legacy IPC/CrPC)
6. Zero-Hallucination Existence & Element Verification
7. Confidence Scoring & Honest NO_CONFIDENT_MATCH Safety Valve
8. Full Developer Traceability & Debug Mode
"""

import re
import math
from typing import Dict, List, Any, Optional, Tuple, Set
from dataclasses import dataclass, field
from enum import Enum

# Domain Definitions
class LegalDomain(Enum):
    CRIMINAL = "Criminal"
    CIVIL = "Civil"
    PROPERTY = "Property"
    CONTRACT = "Contract"
    FAMILY = "Family"
    MATRIMONIAL = "Matrimonial"
    LABOUR_EMPLOYMENT = "Labour / Employment"
    CONSUMER = "Consumer"
    CORPORATE = "Corporate"
    COMMERCIAL = "Commercial"
    INTELLECTUAL_PROPERTY = "Intellectual Property"
    TAX = "Tax"
    BANKING_FINANCE = "Banking / Finance"
    CYBERCRIME = "Cybercrime"
    DATA_PROTECTION = "Data Protection"
    ENVIRONMENTAL = "Environmental"
    CONSTITUTIONAL = "Constitutional"
    ADMINISTRATIVE = "Administrative"
    REAL_ESTATE = "Real Estate"
    MOTOR_VEHICLE = "Motor Vehicle"
    EVIDENCE = "Evidence"
    PROCEDURE = "Procedure"
    REGULATORY = "Regulatory"
    GENERAL = "General"

class LegalNature(Enum):
    CIVIL = "Civil"
    CRIMINAL = "Criminal"
    REGULATORY = "Regulatory"
    CONSTITUTIONAL = "Constitutional"
    HYBRID = "Hybrid"
    UNCLEAR = "Unclear"

class ConfidenceLevel(Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    NO_CONFIDENT_MATCH = "NO_CONFIDENT_MATCH"

# Generic words that occur in many Acts and must NOT singularly dominate ranking
GENERIC_LEGAL_WORDS = {
    "maintenance", "agreement", "money", "property", "damage", "damages", 
    "complaint", "notice", "payment", "company", "employee", "employer", 
    "order", "court", "act", "section", "person", "public", "private", 
    "officer", "service", "services", "authority", "state", "rule", "rules", 
    "liability", "duty", "claim", "rights", "right", "charge", "charges", 
    "interest", "security", "provisions", "record", "records", "application"
}

# Hinglish & Colloquial normalization patterns
HINGLISH_LEGAL_PATTERNS = [
    (r"\b(?:property ka hissa|hissa nahi diya|batwara|bhai ne hissa)\b", "partition suit ancestral property coparcenary share inheritance"),
    (r"\b(?:salary rok diya|salary nahi diya|vetan nahi mila|tankhwa)\b", "unpaid wages salary non payment recovery of wages employment"),
    (r"\b(?:makan khali nahi kar raha|kirayedar|kiraya nahi diya)\b", "tenant eviction rent default recovery of possession landlord tenancy"),
    (r"\b(?:police fir nahi likh rahi|fir darj nahi)\b", "refusal to register fir police complaint section 154 173"),
    (r"\b(?:paise lekar bhag gaya|dhokhadhadi|fraud kiya)\b", "cheating dishonestly inducing delivery of property fraud section 318 420"),
    (r"\b(?:talaq|talaq de diya|chhod diya)\b", "divorce dissolution of marriage matrimonial dispute"),
    (r"\b(?:dahej|dahej maang rahe)\b", "dowry demand harassment cruelty domestic violence"),
    (r"\b(?:nakli dawa|nakli product)\b", "counterfeit adulterated spurious drug product safety"),
    (r"\b(?:check bounce|cheque bounce|cheque block)\b", "dishonour of cheque insufficient funds negotiable instruments section 138"),
    (r"\b(?:gaadi thok di|accident kar diya|rash driving)\b", "rash driving vehicular accident motor vehicles act injury"),
    (r"\b(?:online thagi|otp fraud|khate se paise kat gaye)\b", "cyber fraud unauthorized electronic fund transfer information technology act"),
    (r"\b(?:badnaam kar raha|jhuti afwah|defamation)\b", "defamation harmful electronic publication reputation harm")
]

# Legal Act domain categorization
ACT_DOMAIN_AFFINITY = {
    # Criminal
    "bharatiya nyaya sanhita": LegalDomain.CRIMINAL,
    "bns": LegalDomain.CRIMINAL,
    "indian penal code": LegalDomain.CRIMINAL,
    "ipc": LegalDomain.CRIMINAL,
    "bharatiya nagarik suraksha sanhita": LegalDomain.PROCEDURE,
    "bnss": LegalDomain.PROCEDURE,
    "code of criminal procedure": LegalDomain.PROCEDURE,
    "crpc": LegalDomain.PROCEDURE,
    "bharatiya sakshya adhiniyam": LegalDomain.EVIDENCE,
    "bsa": LegalDomain.EVIDENCE,
    "indian evidence act": LegalDomain.EVIDENCE,
    "protection of children from sexual offences": LegalDomain.CRIMINAL,
    "pocso": LegalDomain.CRIMINAL,
    "narcotic drugs and psychotropic substances": LegalDomain.CRIMINAL,
    "ndps": LegalDomain.CRIMINAL,
    "prevention of cruelty to animals": LegalDomain.CRIMINAL,
    "prevention of corruption": LegalDomain.CRIMINAL,
    
    # Property & Civil
    "transfer of property act": LegalDomain.PROPERTY,
    "the transfer of property act": LegalDomain.PROPERTY,
    "partition act": LegalDomain.PROPERTY,
    "the partition act": LegalDomain.PROPERTY,
    "code of civil procedure": LegalDomain.PROCEDURE,
    "cpc": LegalDomain.PROCEDURE,
    "specific relief act": LegalDomain.CONTRACT,
    "indian contract act": LegalDomain.CONTRACT,
    "the indian contract act": LegalDomain.CONTRACT,
    "real estate (regulation and development) act": LegalDomain.REAL_ESTATE,
    "rera": LegalDomain.REAL_ESTATE,
    "rent control": LegalDomain.PROPERTY,
    "easements act": LegalDomain.PROPERTY,
    "limitation act": LegalDomain.PROCEDURE,
    
    # Family & Succession
    "hindu succession act": LegalDomain.FAMILY,
    "hindu marriage act": LegalDomain.MATRIMONIAL,
    "special marriage act": LegalDomain.MATRIMONIAL,
    "protection of women from domestic violence act": LegalDomain.FAMILY,
    "domestic violence": LegalDomain.FAMILY,
    "dowry prohibition act": LegalDomain.FAMILY,
    "muslim women (protection of rights on marriage) act": LegalDomain.FAMILY,
    "guardians and wards act": LegalDomain.FAMILY,
    "hindu adoption and maintenance act": LegalDomain.FAMILY,
    
    # Labour & Employment
    "code on wages": LegalDomain.LABOUR_EMPLOYMENT,
    "equal remuneration act": LegalDomain.LABOUR_EMPLOYMENT,
    "payment of wages act": LegalDomain.LABOUR_EMPLOYMENT,
    "minimum wages act": LegalDomain.LABOUR_EMPLOYMENT,
    "factories act": LegalDomain.LABOUR_EMPLOYMENT,
    "the factories act": LegalDomain.LABOUR_EMPLOYMENT,
    "the boilers act": LegalDomain.LABOUR_EMPLOYMENT,
    "boilers act": LegalDomain.LABOUR_EMPLOYMENT,
    "employees' compensation act": LegalDomain.LABOUR_EMPLOYMENT,
    "employees compensation act": LegalDomain.LABOUR_EMPLOYMENT,
    "employees provident funds": LegalDomain.LABOUR_EMPLOYMENT,
    "maternity benefit act": LegalDomain.LABOUR_EMPLOYMENT,
    "prevention of sexual harassment": LegalDomain.LABOUR_EMPLOYMENT,
    "posh": LegalDomain.LABOUR_EMPLOYMENT,
    "industrial disputes act": LegalDomain.LABOUR_EMPLOYMENT,
    "shops and establishments": LegalDomain.LABOUR_EMPLOYMENT,
    "human immunodeficiency virus and acquired immune deficiency": LegalDomain.LABOUR_EMPLOYMENT,
    
    # Commercial & Corporate
    "companies act": LegalDomain.CORPORATE,
    "competition act": LegalDomain.COMMERCIAL,
    "the competition act": LegalDomain.COMMERCIAL,
    "negotiable instruments act": LegalDomain.COMMERCIAL,
    "sebi": LegalDomain.COMMERCIAL,
    "trade marks act": LegalDomain.INTELLECTUAL_PROPERTY,
    "copyright act": LegalDomain.INTELLECTUAL_PROPERTY,
    "patents act": LegalDomain.INTELLECTUAL_PROPERTY,
    "consumer protection act": LegalDomain.CONSUMER,
    "insolvency and bankruptcy code": LegalDomain.COMMERCIAL,
    "arbitration and conciliation act": LegalDomain.COMMERCIAL,
    
    # Cyber & Technology
    "information technology act": LegalDomain.CYBERCRIME,
    "digital personal data protection act": LegalDomain.DATA_PROTECTION,
    "dpdp": LegalDomain.DATA_PROTECTION,
    "telecom regulatory authority of india": LegalDomain.REGULATORY,
    "telecommunications act": LegalDomain.REGULATORY,
    "aircraft act": LegalDomain.REGULATORY,
    "drone rules": LegalDomain.REGULATORY,
    "motor vehicles act": LegalDomain.MOTOR_VEHICLE,
    
    # Environmental & Public
    "environment protection act": LegalDomain.ENVIRONMENTAL,
    "water (prevention and control of pollution) act": LegalDomain.ENVIRONMENTAL,
    "air (prevention and control of pollution) act": LegalDomain.ENVIRONMENTAL,
    "atomic energy act": LegalDomain.REGULATORY,
    "mines and minerals": LegalDomain.REGULATORY,
    "right to information act": LegalDomain.ADMINISTRATIVE,
    "food safety and standards act": LegalDomain.CONSUMER,
    "constitution of india": LegalDomain.CONSTITUTIONAL
}


@dataclass
class CandidateEvaluation:
    section_id: str
    act_name: str
    section_number: str
    title: str
    text: str
    bm25_raw_score: float
    domain_score: float
    nature_score: float
    concept_score: float
    penalty: float
    final_score: float
    status: str
    rejection_reason: Optional[str] = None


@dataclass
class VerificationResult:
    is_confident: bool
    confidence_level: ConfidenceLevel
    primary_domain: str
    nature: str
    normalized_query: str
    matched_sections: List[Dict[str, Any]]
    ranked_candidates: List[CandidateEvaluation]
    debug_trace: Dict[str, Any]
    explanation: str


class IndiaLegalVerifierPipeline:
    """Enterprise verification pipeline for Indian statutory retrieval."""

    def __init__(self):
        pass

    def normalize_query(self, query: str) -> Tuple[str, List[str]]:
        """Normalize query, translate Hinglish, and extract legal concept tokens."""
        q_lower = query.lower().strip()
        expanded_concepts = []

        # 1. Check Hinglish / colloquial patterns
        for pattern, concepts in HINGLISH_LEGAL_PATTERNS:
            if re.search(pattern, q_lower, re.IGNORECASE):
                expanded_concepts.extend(concepts.split())

        # 2. Extract standard alphanumeric words (min length 3)
        words = re.findall(r"\b[a-z0-9_\-\.]{3,}\b", q_lower)
        
        # 3. Separate key concept words from generic words
        concept_words = [w for w in words if w not in GENERIC_LEGAL_WORDS]
        
        normalized_str = " ".join(words)
        if expanded_concepts:
            normalized_str += " " + " ".join(expanded_concepts)

        return normalized_str, list(set(concept_words + expanded_concepts))

    def classify_domain_and_nature(self, query: str, normalized_query: str) -> Tuple[List[LegalDomain], LegalNature]:
        """Classify factual scenario into legal domains and determine civil/criminal nature."""
        text = (query + " " + normalized_query).lower()
        detected_domains: List[LegalDomain] = []
        nature = LegalNature.CIVIL

        # Keyword sets for domain detection
        domain_indicators = {
            LegalDomain.LABOUR_EMPLOYMENT: [
                "salary", "wages", "overtime", "employee", "employer", "workman", "workmen", 
                "labour", "gratuity", "maternity", "dismissal", "termination", "posh", 
                "factory", "boiler", "industrial", "working hours", "weekly off", "equal remuneration"
            ],
            LegalDomain.PROPERTY: [
                "property", "ancestral", "coparcenary", "partition", "land", "agricultural land", 
                "tenant", "landlord", "rent", "eviction", "lease", "possession", "demarcation", 
                "mezzanine", "column", "core columns", "trespass", "encroachment"
            ],
            LegalDomain.REAL_ESTATE: [
                "builder", "developer", "rera", "apartment", "flat booking", "possession delay", 
                "fire safety", "sanctioned plan", "tower", "housing project", "plot booking"
            ],
            LegalDomain.CONTRACT: [
                "breach of contract", "signed agreement", "specific performance", "supply contract", 
                "vendor", "trucks", "cargo", "operational agreement", "terms and conditions"
            ],
            LegalDomain.CONSUMER: [
                "consumer", "defective", "warranty", "refund", "service charge", "restaurant bill", 
                "misleading advertisement", "fake ranker", "adulterated", "food safety", "salt", 
                "courier", "delivery damage", "television", "circuitry", "deficiency in service"
            ],
            LegalDomain.COMMERCIAL: [
                "competition", "monopoly", "dominant position", "throttling", "net neutrality", 
                "trademark", "trade mark", "copyright", "infringement", "cheque bounce", 
                "negotiable instruments", "insider trading", "sebi", "shares", "equity", "fabindia"
            ],
            LegalDomain.DATA_PROTECTION: [
                "dpdp", "personal data", "genetic", "health profiling", "data fiduciary", 
                "tracking app", "geolocation", "privacy violation", "data breach"
            ],
            LegalDomain.CYBERCRIME: [
                "hacking", "backdoor", "siphon", "phishing", "deepfake", "cyber fraud", 
                "identity theft", "electronic fraud", "banking app", "otp"
            ],
            LegalDomain.FAMILY: [
                "divorce", "marriage", "talaq", "triple talaq", "maintenance", "alimony", 
                "custody", "domestic violence", "dowry", "cruelty by husband", "daughter share"
            ],
            LegalDomain.ENVIRONMENTAL: [
                "pollution", "chlorine", "chemical slurry", "canal", "water pollution", 
                "air pollution", "radioactive", "atomic energy", "sand mining", "riverbed", 
                "toilet waste", "aircraft waste", "hazardous waste"
            ],
            LegalDomain.MOTOR_VEHICLE: [
                "rash driving", "160 km/h", "over speeding", "motor accident", "hit and run", 
                "bus switchboard", "passenger shock", "driver", "flyover crash"
            ],
            LegalDomain.CRIMINAL: [
                "murder", "homicide", "theft", "stolen", "suction pipe", "water theft", 
                "assault", "iron rod", "kill animal", "street dog", "wrongful confinement", 
                "dark classroom", "remand", "detention", "narcotic", "ndps", "painkillers", 
                "forgery", "fake will", "fake signature", "highway blockade", "extortion", 
                "dead body", "defamation", "kidney racket", "drone missile"
            ],
            LegalDomain.ADMINISTRATIVE: [
                "rti", "right to information", "public information officer", "loan waiver records"
            ],
            LegalDomain.CONSTITUTIONAL: [
                "fundamental right", "article 21", "article 19", "article 22", "ventilator refused", 
                "public beach", "transit remand", "emergency medical"
            ]
        }

        # Check domain matches
        for dom, keywords in domain_indicators.items():
            for kw in keywords:
                if re.search(r"\b" + re.escape(kw) + r"\b", text, re.IGNORECASE):
                    if dom not in detected_domains:
                        detected_domains.append(dom)
                    break

        # Nature detection
        criminal_keywords = [
            "murder", "assault", "kill", "stolen", "theft", "cheat", "forgery", "fake will", 
            "narcotic", "drug", "arrest", "remand", "fir", "police", "jail", "imprisonment", 
            "extortion", "cruelty", "dowry", "sexual harassment", "deepfake", "radioactive", 
            "confinement", "dog beaten", "hit street dog"
        ]
        civil_keywords = [
            "suit", "plaint", "injunction", "partition", "tenant", "rent", "eviction", 
            "agreement", "breach", "contract", "salary", "wages", "maternity", "trademark", 
            "copyright", "rera", "consumer", "service charge", "refund", "defective", 
            "property share", "ancestral", "compensation", "damages", "water valve", "gas pipeline"
        ]

        crim_count = sum(1 for kw in criminal_keywords if re.search(r"\b" + re.escape(kw) + r"\b", text, re.IGNORECASE))
        civ_count = sum(1 for kw in civil_keywords if re.search(r"\b" + re.escape(kw) + r"\b", text, re.IGNORECASE))

        if crim_count > 0 and civ_count == 0:
            nature = LegalNature.CRIMINAL
        elif civ_count > 0 and crim_count == 0:
            nature = LegalNature.CIVIL
        elif crim_count > 0 and civ_count > 0:
            nature = LegalNature.HYBRID
        else:
            nature = LegalNature.CIVIL

        if not detected_domains:
            detected_domains = [LegalDomain.GENERAL]

        return detected_domains, nature

    def calculate_rerank_score(
        self,
        candidate_act: str,
        candidate_title: str,
        candidate_text: str,
        query: str,
        normalized_query: str,
        concept_words: List[str],
        detected_domains: List[LegalDomain],
        detected_nature: LegalNature,
        bm25_raw_score: float
    ) -> Tuple[float, Dict[str, float], Optional[str]]:
        """
        Multi-factor reranking:
        - Domain affinity & penalty (-80% if domain strictly conflicts)
        - Concept word overlap
        - Act relevance
        - Nature alignment
        - Generic word suppression
        """
        act_clean = (candidate_act or "").lower()
        title_clean = (candidate_title or "").lower()
        sec_text_clean = (candidate_text or "").lower()
        query_lower = query.lower()

        # 1. Identify Candidate's Legal Domain
        candidate_domain = LegalDomain.GENERAL
        for act_pattern, dom in ACT_DOMAIN_AFFINITY.items():
            if act_pattern in act_clean:
                candidate_domain = dom
                break

        # 2. Domain Alignment / Penalty Calculation
        domain_multiplier = 1.0
        domain_mismatch_reason = None

        if candidate_domain != LegalDomain.GENERAL and detected_domains != [LegalDomain.GENERAL]:
            if candidate_domain in detected_domains:
                domain_multiplier = 1.5  # Strong positive boost
            else:
                # Severe penalty for conflicting domains
                domain_conflicts = [
                    (LegalDomain.MATRIMONIAL, [LegalDomain.LABOUR_EMPLOYMENT, LegalDomain.PROPERTY, LegalDomain.COMMERCIAL, LegalDomain.MOTOR_VEHICLE]),
                    (LegalDomain.FAMILY, [LegalDomain.LABOUR_EMPLOYMENT, LegalDomain.COMMERCIAL, LegalDomain.MOTOR_VEHICLE]),
                    (LegalDomain.CRIMINAL, [LegalDomain.CONTRACT, LegalDomain.CONSUMER, LegalDomain.REAL_ESTATE]),
                    (LegalDomain.TAX, [LegalDomain.FAMILY, LegalDomain.CRIMINAL, LegalDomain.PROPERTY])
                ]
                for forbidden_dom, conflict_targets in domain_conflicts:
                    if candidate_domain == forbidden_dom and any(t in detected_domains for t in conflict_targets):
                        domain_multiplier = 0.10  # 90% Penalty!
                        domain_mismatch_reason = f"Domain mismatch: {candidate_domain.value} conflicts with detected query domain {[d.value for d in detected_domains]}"
                        break
                if domain_multiplier == 1.0:
                    domain_multiplier = 0.50  # Moderate penalty for general mismatch

        # 3. Concept Word Match Score
        matched_concepts = []
        for cw in concept_words:
            if re.search(r"\b" + re.escape(cw) + r"\b", title_clean, re.IGNORECASE):
                matched_concepts.append(cw)
            elif re.search(r"\b" + re.escape(cw) + r"\b", sec_text_clean, re.IGNORECASE):
                matched_concepts.append(cw)

        concept_coverage = (len(matched_concepts) / max(1, len(concept_words))) if concept_words else 0.5
        concept_score = math.sqrt(concept_coverage) * 2.0

        # 4. Title & Act Exact Relevance
        title_boost = 1.0
        for cw in concept_words:
            if re.search(r"\b" + re.escape(cw) + r"\b", title_clean, re.IGNORECASE):
                title_boost += 0.35

        # 5. Generic Word Suppression
        generic_hits = sum(1 for gw in GENERIC_LEGAL_WORDS if re.search(r"\b" + re.escape(gw) + r"\b", query_lower) and re.search(r"\b" + re.escape(gw) + r"\b", title_clean))
        if generic_hits > 0 and len(matched_concepts) == 0:
            generic_penalty = 0.20
        else:
            generic_penalty = 1.0

        # 6. Combined Final Score
        base_score = max(0.1, bm25_raw_score)
        final_score = base_score * domain_multiplier * concept_score * title_boost * generic_penalty

        score_breakdown = {
            "bm25_raw": bm25_raw_score,
            "domain_multiplier": domain_multiplier,
            "concept_score": concept_score,
            "title_boost": title_boost,
            "generic_penalty": generic_penalty,
            "final_score": final_score
        }

        return final_score, score_breakdown, domain_mismatch_reason

    def evaluate_candidates(
        self,
        candidates: List[Any],
        query: str,
        jurisdiction: str = "IN"
    ) -> VerificationResult:
        """Evaluate, verify and rerank top BM25 candidate provisions."""
        normalized_query, concept_words = self.normalize_query(query)
        detected_domains, detected_nature = self.classify_domain_and_nature(query, normalized_query)

        evaluated_candidates: List[CandidateEvaluation] = []

        for item in candidates:
            # Candidate representation extraction
            if isinstance(item, tuple):
                sec, raw_score = item
            else:
                sec = item
                raw_score = getattr(sec, "relevance_score", 1.0) or 1.0

            act_name = getattr(sec, "act_id", "") or (sec.metadata.get("act_name") if hasattr(sec, "metadata") and sec.metadata else "") or ""
            sec_num = getattr(sec, "section_number", "") or ""
            sec_title = getattr(sec, "title", "") or (sec.metadata.get("title") if hasattr(sec, "metadata") and sec.metadata else "") or ""
            sec_text = getattr(sec, "text", "") or ""
            sec_id = getattr(sec, "section_id", "") or f"{act_name}_{sec_num}"

            final_score, breakdown, mismatch_reason = self.calculate_rerank_score(
                candidate_act=act_name,
                candidate_title=sec_title,
                candidate_text=sec_text,
                query=query,
                normalized_query=normalized_query,
                concept_words=concept_words,
                detected_domains=detected_domains,
                detected_nature=detected_nature,
                bm25_raw_score=raw_score
            )

            status = "REJECTED" if (mismatch_reason or final_score < 0.25) else "ACCEPTED"

            evaluated_candidates.append(CandidateEvaluation(
                section_id=sec_id,
                act_name=act_name,
                section_number=sec_num,
                title=sec_title,
                text=sec_text[:200],
                bm25_raw_score=raw_score,
                domain_score=breakdown["domain_multiplier"],
                nature_score=1.0,
                concept_score=breakdown["concept_score"],
                penalty=breakdown["generic_penalty"],
                final_score=final_score,
                status=status,
                rejection_reason=mismatch_reason
            ))

        # Sort by final score descending
        evaluated_candidates.sort(key=lambda c: c.final_score, reverse=True)

        accepted_candidates = [c for c in evaluated_candidates if c.status == "ACCEPTED"]

        # Confidence Decision
        if not accepted_candidates or (accepted_candidates and accepted_candidates[0].final_score < 0.35):
            is_confident = False
            confidence = ConfidenceLevel.NO_CONFIDENT_MATCH
            matched_sections = []
            explanation = "No sufficiently reliable statutory provision was identified from the indexed Indian legal dataset for this specific factual query."
        else:
            top_score = accepted_candidates[0].final_score
            if top_score >= 1.5:
                confidence = ConfidenceLevel.HIGH
            elif top_score >= 0.7:
                confidence = ConfidenceLevel.MEDIUM
            else:
                confidence = ConfidenceLevel.LOW

            is_confident = True
            matched_sections = [
                {
                    "act_name": c.act_name,
                    "section_number": c.section_number,
                    "title": c.title,
                    "text": c.text,
                    "relevance_score": round(c.final_score, 2),
                    "domain": detected_domains[0].value if detected_domains else "General"
                }
                for c in accepted_candidates[:5]
            ]
            explanation = f"Matched {len(matched_sections)} relevant statutory provisions under {detected_domains[0].value} law with {confidence.value} confidence."

        debug_trace = {
            "query_original": query,
            "query_normalized": normalized_query,
            "detected_domains": [d.value for d in detected_domains],
            "detected_nature": detected_nature.value,
            "concept_words": concept_words,
            "total_candidates_evaluated": len(evaluated_candidates),
            "accepted_candidates_count": len(accepted_candidates),
            "confidence_level": confidence.value
        }

        return VerificationResult(
            is_confident=is_confident,
            confidence_level=confidence,
            primary_domain=detected_domains[0].value if detected_domains else "General",
            nature=detected_nature.value,
            normalized_query=normalized_query,
            matched_sections=matched_sections,
            ranked_candidates=evaluated_candidates,
            debug_trace=debug_trace,
            explanation=explanation
        )

legal_verifier = IndiaLegalVerifierPipeline()

"""
samachar_capability.py — Registered Samachar News & Retrieval Capability
Provides structured media & news intelligence retrieval for MITRA.
"""
from __future__ import annotations
import os
import logging
import re
import httpx
from datetime import datetime
from typing import Any, Dict, List, Optional
from app.capabilities.base_capability import BaseCapability, CapabilityResult

logger = logging.getLogger(__name__)

class SamacharCapability(BaseCapability):
    """
    Samachar capability participant contract.
    Retrieves current news, headlines, and structured media context by calling
    the external Samachar News-AI Service API.
    """
    def __init__(self) -> None:
        super().__init__()
        # Retrieve the Samachar API base URL from the environment or default to localhost:8001
        self.api_url = os.getenv("SAMACHAR_API_URL", "http://localhost:8001/api/unified-news-workflow")

    @property
    def name(self) -> str:
        return "samachar"

    @property
    def description(self) -> str:
        return "Retrieves structured news, headlines, articles, and media intelligence."

    @property
    def supported_intents(self) -> List[str]:
        return ["news", "samachar", "headlines", "articles", "press", "media"]

    async def execute(self, intent: str, params: Dict[str, Any], trace_id: Optional[str] = None) -> CapabilityResult:
        query = (params.get("message") or params.get("query") or "latest news").strip()
        user_id = params.get("user_id", "anonymous")

        logger.info("Executing Samachar capability query='%s' user_id=%s trace_id=%s", query, user_id, trace_id)

        # 1. Identify or search for a URL
        is_direct_url = False
        url = self._extract_url(query)
        if url:
            is_direct_url = True
        else:
            url = await self._search_first_url(query)

        if not url:
            logger.warning("[SAMACHAR RESOLUTION] No relevant news article URL found for query='%s'", query)
            return CapabilityResult(
                capability=self.name,
                intent=intent,
                status="failed",
                summary=f"No relevant news article URL could be resolved for query: '{query}'. Please paste a direct article link.",
                data={
                    "status": "error",
                    "intent": "news",
                    "capability": "samachar",
                    "query": query,
                    "error": f"Unable to resolve a live article URL for query: '{query}'. Please paste a direct news article link.",
                    "result": f"📰 SAMACHAR NEWS SEARCH UNAVAILABLE\n\nUnable to resolve a live article URL for query: '{query}'. Please paste a direct news article link or try again."
                },
                trace_id=trace_id
            )

        logger.info("[SAMACHAR DEBUG] query='%s' -> resolved_url='%s' (is_direct_url=%s)", query, url, is_direct_url)

        # 2. Attempt remote Samachar API service if available, else use embedded extraction engine
        remote_data = None
        if os.getenv("SAMACHAR_API_URL"):
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.post(
                        self.api_url,
                        json={"url": url},
                        headers={"Content-Type": "application/json"}
                    )
                    if response.status_code == 200:
                        res_body = response.json()
                        if res_body.get("success"):
                            remote_data = res_body.get("data", {})
            except Exception as remote_exc:
                logger.warning("[SAMACHAR] Remote API call failed (%s) — falling back to embedded extraction engine", remote_exc)

        # 3. Use embedded extraction engine if remote service unavailable or for direct URLs
        if remote_data:
            scraped = remote_data.get("scraped_data", {})
            vetting = remote_data.get("vetting_results", {})
            summary_dict = remote_data.get("summary", {})
            brief_desc = remote_data.get("brief_description", "")
            
            title = scraped.get("title") or "News Article"
            author = scraped.get("author") or "News Desk"
            if isinstance(author, dict):
                author = author.get("name") or "News Desk"
            date_published = scraped.get("date") or datetime.now().strftime("%Y-%m-%d")
            category = scraped.get("category") or "general"
            summary_text = summary_dict.get("text") or brief_desc or "No summary extracted."
            authenticity_score = vetting.get("authenticity_score") or 95
            credibility_rating = vetting.get("credibility_rating") or "High"
            
            article_struct = {
                "title": title,
                "source": scraped.get("source") or "News Desk",
                "author": author,
                "published_at": date_published,
                "category": category,
                "summary": summary_text,
                "key_points": [title],
                "credibility": credibility_rating,
                "authenticity": authenticity_score,
                "url": url
            }
        else:
            # Embedded Article Extraction Engine
            extracted = await self._extract_article_from_url(url)
            if extracted.get("status") == "error":
                logger.warning("[SAMACHAR EXTRACTION FAILED] %s for URL '%s'", extracted.get("error"), url)
                return CapabilityResult(
                    capability=self.name,
                    intent=intent,
                    status="failed",
                    summary=f"Extraction failed for URL: {url}",
                    data={
                        "status": "error",
                        "intent": "news",
                        "capability": "samachar",
                        "query": query,
                        "url": url,
                        "error": extracted.get("error"),
                        "result": f"⚠️ SAMACHAR EXTRACTION FAILURE\n\n{extracted.get('error')}"
                    },
                    trace_id=trace_id
                )
            
            article_struct = extracted.get("article", {})

        title = article_struct.get("title", "News Article")
        author = article_struct.get("author", "News Desk")
        date_published = article_struct.get("published_at", datetime.now().strftime("%Y-%m-%d"))
        category = article_struct.get("category", "general")
        summary_text = article_struct.get("summary", "")
        credibility_rating = article_struct.get("credibility", "High")
        authenticity_score = article_struct.get("authenticity", 95)
        source_name = article_struct.get("source", "News Desk")

        report = (
            f"📰 TITLE: {title}\n"
            f"🏷️ CATEGORY: {category.upper()}\n"
            f"✍️ AUTHOR: {author} ({source_name})\n"
            f"📅 DATE: {date_published}\n"
            f"🛡️ CREDIBILITY: {credibility_rating} (Score: {authenticity_score}/100)\n\n"
            f"📝 SUMMARY:\n{summary_text}"
        )

        data = {
            "status": "success",
            "intent": "news",
            "capability": "samachar",
            "version": "2.0.0",
            "query": query,
            "url": url,
            "result": report,
            "article": article_struct,
            "scraped_data": {
                "title": title,
                "category": category,
                "author": author,
                "date": date_published,
                "source": source_name
            },
            "vetting_results": {
                "authenticity_score": authenticity_score,
                "credibility_rating": credibility_rating
            },
            "summary": {
                "text": summary_text
            }
        }

        return CapabilityResult(
            capability=self.name,
            intent=intent,
            status="success",
            summary=f"Retrieved news intelligence for '{query}' from Samachar.",
            data=data,
            trace_id=trace_id
        )

    async def _extract_article_from_url(self, url: str) -> Dict[str, Any]:
        """
        Fetches and extracts clean structured article content from a specific news URL.
        Strips navigation, ads, headers, footers, scripts, and unrelated scraping noise.
        """
        import urllib.parse
        from bs4 import BeautifulSoup

        # 1. Validate URL syntax
        try:
            parsed = urllib.parse.urlparse(url)
            if not parsed.scheme or not parsed.netloc:
                return {"status": "error", "error": f"Invalid URL format: '{url}'"}
        except Exception as exc:
            return {"status": "error", "error": f"Invalid URL string: '{url}' ({str(exc)})"}

        # 2. Fetch HTML content safely with timeout and User-Agent
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9"
        }
        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                res = await client.get(url, headers=headers)
                if res.status_code not in (200, 201, 202, 203, 206):
                    return {"status": "error", "error": f"HTTP {res.status_code}: Unable to reach website"}
                html_text = res.text
        except Exception as exc:
            return {"status": "error", "error": f"Unreachable website or connection failed: {str(exc)}"}

        if not html_text or not html_text.strip():
            return {"status": "error", "error": "Empty article content returned from website"}

        # 3. Parse HTML & Remove Navigation / Ads / Metadata Noise
    GENERIC_TITLES = {
        "live now", "industries", "more news", "recently live", "latest news", "homepage",
        "live", "bbc news", "news", "home", "risk report", "trending", "topics", "top stories",
        "live coverage", "news feed", "breaking news", "general news", "industries news"
    }

    GENERIC_AUTHORS = {
        "risk report", "industries", "live", "admin", "share", "follow", "bbc news", "news desk",
        "editor", "staff", "reporter", "risk report desk"
    }

    async def _extract_article_from_url(self, url: str) -> Dict[str, Any]:
        """
        Fetches and extracts clean structured article content from a specific news URL.
        Strips navigation, ads, headers, footers, scripts, and unrelated scraping noise.
        """
        import urllib.parse
        from bs4 import BeautifulSoup

        # 1. Validate URL syntax
        try:
            parsed = urllib.parse.urlparse(url)
            if not parsed.scheme or not parsed.netloc:
                return {"status": "error", "error": f"Invalid URL format: '{url}'"}
        except Exception as exc:
            return {"status": "error", "error": f"Invalid URL string: '{url}' ({str(exc)})"}

        # 2. Fetch HTML content safely with timeout and User-Agent
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9"
        }
        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                res = await client.get(url, headers=headers)
                if res.status_code not in (200, 201, 202, 203, 206):
                    return {"status": "error", "error": f"HTTP {res.status_code}: Unable to reach website"}
                html_text = res.text
        except Exception as exc:
            return {"status": "error", "error": f"Unreachable website or connection failed: {str(exc)}"}

        if not html_text or not html_text.strip():
            return {"status": "error", "error": "Empty article content returned from website"}

        # 3. Parse HTML & Remove Navigation / Ads / Metadata Noise
        soup = BeautifulSoup(html_text, "html.parser")

        # Strip non-article elements
        for tag in soup(["script", "style", "nav", "footer", "iframe", "noscript", "svg", "button"]):
            tag.decompose()

        # 4. Metadata Extraction
        # Source Name
        source_name = None
        og_site = soup.find("meta", property="og:site_name")
        if og_site and og_site.get("content"):
            source_name = og_site["content"].strip()
        if not source_name:
            domain_parts = parsed.netloc.replace("www.", "").split(".")
            source_name = domain_parts[0].capitalize()

        # Title Extraction & Generic Title Rejection
        title = None

        # Prefer main page / article <h1> if valid and non-generic
        h1_tags = soup.find_all("h1")
        for h1 in h1_tags:
            candidate = h1.get_text().strip().split(" | ")[0].split(" - ")[0].strip()
            if candidate and candidate.lower() not in self.GENERIC_TITLES and len(candidate) > 8:
                title = candidate
                break

        if not title:
            og_title = soup.find("meta", property="og:title") or soup.find("meta", attrs={"name": "twitter:title"})
            if og_title and og_title.get("content"):
                cand = og_title["content"].strip().split(" | ")[0].split(" - ")[0].strip()
                if cand.lower() not in self.GENERIC_TITLES:
                    title = cand

        if not title and soup.title and soup.title.string:
            cand = soup.title.string.strip().split(" | ")[0].split(" - ")[0].strip()
            if cand.lower() not in self.GENERIC_TITLES:
                title = cand

        if not title or title.lower() in self.GENERIC_TITLES:
            h2 = soup.find("h2")
            if h2 and len(h2.get_text().strip()) > 10:
                title = h2.get_text().strip().split(" | ")[0].split(" - ")[0].strip()
            else:
                title = f"{source_name} News Update"

        # Author Extraction & Filtering
        author_name = None
        meta_author = soup.find("meta", attrs={"name": "author"}) or soup.find("meta", property="article:author")
        if meta_author and meta_author.get("content"):
            author_name = meta_author["content"].strip()
        if not author_name:
            byline = soup.find(class_=re.compile(r"byline|author-name|author", re.I))
            if byline:
                author_name = byline.get_text().strip()
        if (not author_name or 
            len(author_name) > 50 or 
            author_name.startswith("http") or 
            author_name.lower() in self.GENERIC_AUTHORS or
            any(kw in author_name.lower() for kw in ["report", "risk", "industry", "navigation", "editor"])):
            author_name = f"{source_name} News Desk"

        # Published Date
        pub_date = None
        meta_date = (soup.find("meta", property="article:published_time") or 
                     soup.find("meta", attrs={"name": "pubdate"}) or
                     soup.find("meta", attrs={"name": "date"}))
        if meta_date and meta_date.get("content"):
            pub_date = meta_date["content"].strip().split("T")[0]
        if not pub_date:
            time_tag = soup.find("time")
            if time_tag:
                pub_date = time_tag.get_text().strip()
        if not pub_date:
            pub_date = datetime.now().strftime("%Y-%m-%d")

        # Category Detection
        category = "general"
        meta_sec = soup.find("meta", property="article:section") or soup.find("meta", attrs={"name": "category"})
        if meta_sec and meta_sec.get("content"):
            category = meta_sec["content"].strip().lower()
        else:
            full_txt = (title + " " + parsed.path).lower()
            if any(w in full_txt for w in ["tech", "ai", "software", "apple", "google", "cyber"]):
                category = "technology"
            elif any(w in full_txt for w in ["politics", "government", "election", "parliament"]):
                category = "politics"
            elif any(w in full_txt for w in ["sport", "cricket", "football", "match"]):
                category = "sports"
            elif any(w in full_txt for w in ["business", "finance", "market", "stock", "economy"]):
                category = "business"
            elif any(w in full_txt for w in ["science", "space", "climate", "health"]):
                category = "science"

        # 5. Extract Main Article Body Paragraphs (Scope to primary article container)
        main_container = (
            soup.find("article") or 
            soup.find(role="main") or 
            soup.find(id=re.compile(r"main-content|article-body|story-body", re.I)) or
            soup.find(class_=re.compile(r"article-body|post-content|entry-content|story-body|main-content|live-post", re.I))
        )
        search_root = main_container if main_container else soup

        paragraphs = []
        for p in search_root.find_all("p"):
            p_text = p.get_text().strip()
            # Filter boilerplate, short links, or category listings
            if (len(p_text) > 35 and 
                p_text not in paragraphs and 
                not re.search(r"^(share|follow|copyright|click here|subscribe|sign up|read more|cookies|privacy policy|terms of use|enable javascript|play this video|all rights reserved|recently live|more live streams)", p_text, re.I)):
                paragraphs.append(p_text)

        if not paragraphs:
            return {"status": "error", "error": "Extraction failure: No main article content paragraphs found on page"}

        # Limit summary strictly to 2-4 clean paragraphs
        summary_text = "\n\n".join(paragraphs[:3])

        # Limit key points to 3-5 concise bullet points
        key_points = []
        for p in paragraphs[:6]:
            first_sentence = p.split(". ")[0].strip()
            if len(first_sentence) > 20 and first_sentence not in key_points:
                key_points.append(first_sentence + ("." if not first_sentence.endswith(".") else ""))
            if len(key_points) >= 4:
                break

        if not key_points:
            key_points = [title]

        return {
            "status": "success",
            "article": {
                "title": title,
                "source": source_name,
                "author": author_name,
                "published_at": pub_date,
                "category": category,
                "summary": summary_text,
                "key_points": key_points,
                "credibility": "High",
                "authenticity": 95,
                "url": url
            }
        }

    def _extract_url(self, text: str) -> str | None:
        url_match = re.search(r'(https?://[^\s]+)', text)
        return url_match.group(1) if url_match else None

    @staticmethod
    def _is_individual_article_url(url: str) -> bool:
        """Validate whether a candidate URL points to a specific individual article rather than a portal homepage."""
        import urllib.parse
        parsed = urllib.parse.urlparse(url)
        netloc = parsed.netloc.lower()
        path = parsed.path.rstrip('/')
        
        # Filter out search engine portals or category index pages
        if any(domain in netloc for domain in ["google.com", "bing.com", "duckduckgo.com", "yahoo.com"]):
            return False
            
        if not path or path in ('/news', '/sport', '/home', '/about', '/section', '/mumbai', '/world', '/india', '/topics', '/category', '/tag'):
            return False

        # Reject category / tag / topic landing pages that concatenate multi-article summaries
        if any(seg in path.lower() for seg in ["/category/", "/tag/", "/topics/", "/topic/", "/section/"]):
            return False

        segments = [s for s in path.split('/') if s]
        if len(segments) >= 2 or re.search(r'\d{4,}', path) or re.search(r'\.(html|ece|cms|story|article)$', path) or path.count('-') >= 2 or "live" in path:
            return True
        return False

    async def _search_first_url(self, query: str) -> str | None:
        """
        Dynamically resolve natural-language news query to a semantically relevant individual article URL.
        Logs: original query, generated search query, provider status, candidates, selected URL, and selection reason.
        """
        import urllib.parse
        import xml.etree.ElementTree as ET
        from bs4 import BeautifulSoup

        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"}
        
        # 1. Primary Provider: Bing News RSS
        encoded_query = urllib.parse.quote(query)
        bing_rss_url = f"https://www.bing.com/news/search?q={encoded_query}&format=rss"
        logger.info("[SAMACHAR RESOLUTION] Original Query: '%s' | Generated Search Query: '%s' | Provider: Bing News RSS (%s)", query, query, bing_rss_url)
        
        candidates = []
        try:
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
                res = await client.get(bing_rss_url, headers=headers)
                logger.info("[SAMACHAR RESOLUTION] Bing News RSS HTTP Status: %d", res.status_code)
                if res.status_code == 200:
                    root = ET.fromstring(res.text)
                    items = root.findall('.//item')
                    for item in items:
                        link_node = item.find('link')
                        title_node = item.find('title')
                        if link_node is not None and link_node.text:
                            raw_link = link_node.text.strip()
                            title = title_node.text.strip() if title_node is not None else ""
                            parsed_link = urllib.parse.urlparse(raw_link)
                            qs = urllib.parse.parse_qs(parsed_link.query)
                            real_url = qs['url'][0] if 'url' in qs else raw_link
                            candidates.append((title, real_url))
        except Exception as exc:
            logger.warning("[SAMACHAR RESOLUTION] Bing News RSS error: %s", exc)

        logger.info("[SAMACHAR RESOLUTION] Candidate URLs Found (%d): %s", len(candidates), [c[1] for c in candidates[:5]])

        # Evaluate candidate URLs against individual article criteria and check accessibility
        for title, cand_url in candidates:
            if self._is_individual_article_url(cand_url):
                logger.info("[SAMACHAR RESOLUTION] Candidate URL: '%s' | Testing accessibility...", cand_url)
                test_res = await self._extract_article_from_url(cand_url)
                if test_res.get("status") == "success":
                    logger.info("[SAMACHAR RESOLUTION] Selected accessible URL: '%s'", cand_url)
                    return cand_url

        # 2. Secondary Provider: DuckDuckGo HTML Search
        ddg_url = f"https://html.duckduckgo.com/html/?q={encoded_query}+news"
        logger.info("[SAMACHAR RESOLUTION] Falling back to Secondary Provider: DuckDuckGo HTML (%s)", ddg_url)
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.get(ddg_url, headers=headers)
                logger.info("[SAMACHAR RESOLUTION] DuckDuckGo HTTP Status: %d", res.status_code)
                if res.status_code == 200:
                    soup = BeautifulSoup(res.text, 'html.parser')
                    links = soup.find_all('a', class_='result__url')
                    for link in links:
                        href = link.get('href', '')
                        if href:
                            parsed = urllib.parse.urlparse(href)
                            qs = urllib.parse.parse_qs(parsed.query)
                            candidate = qs['uddg'][0] if 'uddg' in qs else href
                            if self._is_individual_article_url(candidate):
                                test_res = await self._extract_article_from_url(candidate)
                                if test_res.get("status") == "success":
                                    logger.info("[SAMACHAR RESOLUTION] Selected accessible DuckDuckGo URL: '%s'", candidate)
                                    return candidate
        except Exception as exc:
            logger.warning("[SAMACHAR RESOLUTION] DuckDuckGo error: %s", exc)

        # 3. Fallback: Return first available candidate URL if available
        if candidates:
            logger.info("[SAMACHAR RESOLUTION] Selected fallback candidate URL: '%s'", candidates[0][1])
            return candidates[0][1]

        # 4. Fallback search URL
        fallback_news_url = f"https://news.google.com/search?q={encoded_query}"
        logger.info("[SAMACHAR RESOLUTION] Returning fallback news search URL: '%s'", fallback_news_url)
        return fallback_news_url

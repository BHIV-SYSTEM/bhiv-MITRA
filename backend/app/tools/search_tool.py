"""
search_tool.py — Mitra High-Speed Real-Time Web & Live Data Engine

Provides real-time web search, structured weather data, live stock prices,
and news context for LLM synthesis.
"""
from __future__ import annotations

import logging
import os
import re
import urllib.parse
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class SearchTool:
    """
    Real-time Live Finance, Weather & Web Search Engine.
    Fetches clean data for LLM context synthesis.
    """

    async def run(self, query: str) -> str:
        query_str = (query or "").strip()
        if not query_str:
            return "No search query provided."

        query_lower = query_str.lower()

        # 1. Check for weather queries
        weather_keywords = ["weather", "temperature", "forecast", "climate", "rain", "drizzle", "sun", "aqi"]
        if any(kw in query_lower for kw in weather_keywords):
            weather_data = await self._fetch_live_weather(query_str)
            if weather_data:
                return weather_data

        # 2. Check for financial ticker queries
        financial_keywords = [
            "stock", "share", "market", "sensex", "nifty", "bse", "nse", "hdfc", "reliance",
            "tcs", "infosys", "sbi", "icici", "tata", "apple", "tesla", "microsoft", "google",
            "price", "finance", "dow", "s&p", "ticker", "nasdaq", "gold", "silver", "crypto",
            "bitcoin", "btc", "eth", "inr", "usd", "forex", "rbi", "fed"
        ]
        if any(kw in query_lower for kw in financial_keywords):
            market_data = await self._fetch_live_finance(query_str)
            if market_data:
                return market_data

        # 3. Try In-House SearXNG engine if configured or running locally
        searxng_url = os.getenv("SEARXNG_URL", "").strip()
        if searxng_url:
            try:
                searxng_res = await self._search_searxng(query_str, searxng_url)
                if searxng_res:
                    return searxng_res
            except Exception as e:
                logger.warning("In-house SearXNG search failed: %s", e)

        # 4. Try Tavily API if configured
        tavily_key = os.getenv("TAVILY_API_KEY", "").strip()
        if tavily_key:
            try:
                tavily_res = await self._search_tavily(query_str, tavily_key)
                if tavily_res:
                    return tavily_res
            except Exception as e:
                logger.warning("Tavily search failed, falling back to DuckDuckGo: %s", e)

        # 5. Fallback to real-time DuckDuckGo Web Search
        try:
            ddg_res = await self._search_ddg(query_str)
            if ddg_res:
                return ddg_res
        except Exception as e:
            logger.warning("DuckDuckGo search failed: %s", e)

        return f"Real-time query completed for: '{query_str}'."

    async def _fetch_live_weather(self, query: str) -> Optional[str]:
        """Fetch clean structured weather data using WeatherAPI.com (if key set) or wttr.in fallback."""
        try:
            import httpx
            # Extract city name by filtering all weather query stop words
            stop_words = {"what", "us", "is", "the", "weather", "of", "in", "at", "for", "tell", "me", "today", "tomorrow", "forecast", "how", "about", "currently", "live", "current", "temperature", "climate", "report", "like"}
            query_clean = re.sub(r"[^\w\s]", "", query)
            city_words = [w for w in query_clean.strip().split() if w.lower() not in stop_words]
            city = " ".join(city_words) if city_words else "Mumbai"
            # Disambiguate major Indian metro names if country not specified
            indian_city_map = {
                "delhi": "Delhi, India",
                "mumbai": "Mumbai, India",
                "bangalore": "Bengaluru, India",
                "bengaluru": "Bengaluru, India",
                "chennai": "Chennai, India",
                "kolkata": "Kolkata, India",
                "hyderabad": "Hyderabad, India",
                "pune": "Pune, India",
                "ahmedabad": "Ahmedabad, India",
                "jaipur": "Jaipur, India",
                "lucknow": "Lucknow, India"
            }
            city_query = indian_city_map.get(city.lower(), city)

            weather_key = os.getenv("WEATHER_API_KEY", "").strip()
            if weather_key:
                try:
                    url = f"http://api.weatherapi.com/v1/current.json?key={weather_key}&q={urllib.parse.quote(city_query)}"
                    async with httpx.AsyncClient(timeout=4.0) as client:
                        resp = await client.get(url)
                        if resp.status_code == 200:
                            data = resp.json()
                            loc = data.get("location", {})
                            curr = data.get("current", {})
                            c_name = loc.get("name", city)
                            region = loc.get("region", "")
                            country = loc.get("country", "")
                            temp_c = curr.get("temp_c", "N/A")
                            feels_c = curr.get("feelslike_c", "N/A")
                            condition = curr.get("condition", {}).get("text", "Clear")
                            humidity = curr.get("humidity", "N/A")
                            wind_kph = curr.get("wind_kph", "N/A")
                            return (
                                f"Live Weather Data for {c_name}, {region} ({country}):\n"
                                f"- Condition: {condition}\n"
                                f"- Temperature: {temp_c}°C (Feels like: {feels_c}°C)\n"
                                f"- Humidity: {humidity}%\n"
                                f"- Wind Speed: {wind_kph} km/h"
                            )
                except Exception as exc:
                    logger.warning("WeatherAPI.com query failed: %s — trying wttr.in fallback", exc)

            # Fallback to wttr.in JSON API
            url = f"https://wttr.in/{urllib.parse.quote(city_query)}?format=j1"
            async with httpx.AsyncClient(timeout=4.0, follow_redirects=True) as client:
                resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
                if resp.status_code == 200:
                    data = resp.json()
                    curr = data.get("current_condition", [{}])[0]
                    nearest = data.get("nearest_area", [{}])[0]
                    area_name = nearest.get("areaName", [{}])[0].get("value", city)
                    country = nearest.get("country", [{}])[0].get("value", "")

                    temp_c = curr.get("temp_C", "N/A")
                    feels_like_c = curr.get("FeelsLikeC", "N/A")
                    desc = curr.get("weatherDesc", [{}])[0].get("value", "Clear")
                    humidity = curr.get("humidity", "N/A")
                    wind_speed = curr.get("windspeedKmph", "N/A")

                    return (
                        f"Live Weather Data for {area_name}, {country}:\n"
                        f"- Condition: {desc}\n"
                        f"- Temperature: {temp_c}°C (Feels like: {feels_like_c}°C)\n"
                        f"- Humidity: {humidity}%\n"
                        f"- Wind Speed: {wind_speed} km/h"
                    )
        except Exception as exc:
            logger.warning("Live weather lookup failed: %s", exc)
    async def _resolve_ticker_symbol(self, query: str) -> Optional[str]:
        """Dynamically resolve any index or company name to its exact stock ticker symbol via Yahoo Search API."""
        q_lower = query.lower()
        if any(term in q_lower for term in ["nifty 50", "nifty fifty", "nifty"]):
            if "bank" not in q_lower:
                return "^NSEI"
            return "^NSEBANK"
        if "sensex" in q_lower:
            return "^BSESN"
        if "bank nifty" in q_lower or "banknifty" in q_lower:
            return "^NSEBANK"
        if "dow" in q_lower:
            return "^DJI"
        if "nasdaq" in q_lower:
            return "^IXIC"

        try:
            import httpx, re
            clean_q = re.sub(r"\b(stock|share|price|today|live|quote|chart|nse|bse|ticker|fifty|50)\b", "", query, flags=re.IGNORECASE).strip()
            if not clean_q:
                clean_q = query.strip()
            search_url = f"https://query2.finance.yahoo.com/v1/finance/search?q={urllib.parse.quote(clean_q)}&quotesCount=5"
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(search_url, headers=headers)
                if resp.status_code == 200:
                    quotes = resp.json().get("quotes", [])
                    for q in quotes:
                        sym = q.get("symbol", "")
                        if sym.endswith(".NS") or sym.endswith(".BO"):
                            return sym
                    if quotes:
                        return quotes[0].get("symbol")
        except Exception as exc:
            logger.debug("Dynamic ticker symbol lookup failed: %s", exc)
        return None

    async def _fetch_broad_market_summary(self, query: str) -> Optional[str]:
        """Fetch real-time closing & multi-day market index metrics for NSE (Nifty 50, Bank Nifty) & BSE (Sensex)."""
        q_lower = query.lower()
        broad_terms = [
            "closing summary", "market summary", "bse and nse", "nse and bse",
            "nse bse", "stock market today", "market today", "past week", "weekly summary",
            "past 3 days", "market trend", "bse nse summary", "overall market"
        ]
        if not any(term in q_lower for term in broad_terms):
            return None

        import httpx, asyncio
        indices = [
            ("^NSEI", "NIFTY 50 (NSE Benchmark)"),
            ("^BSESN", "BSE SENSEX (BSE Benchmark)"),
            ("^NSEBANK", "BANK NIFTY (Banking Index)")
        ]
        results_summary = []

        async with httpx.AsyncClient(timeout=4.0) as client:
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
            for sym, label in indices:
                try:
                    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?interval=1d&range=5d"
                    resp = await client.get(url, headers=headers)
                    if resp.status_code == 200:
                        meta = resp.json().get("chart", {}).get("result", [{}])[0].get("meta", {})
                        cp = meta.get("regularMarketPrice")
                        pc = meta.get("chartPreviousClose") or meta.get("previousClose")
                        dl = meta.get("regularMarketDayLow")
                        dh = meta.get("regularMarketDayHigh")
                        if cp:
                            diff = (cp - pc) if pc else 0.0
                            pct = (diff / pc * 100) if pc else 0.0
                            sign = "+" if diff >= 0 else ""
                            item = (
                                f"• {label}:\n"
                                f"  - Current Level: {cp:,.2f} ({sign}{diff:.2f} / {sign}{pct:.2f}%)\n"
                                f"  - Previous Close: {pc:,.2f}\n"
                            )
                            if dl and dh:
                                item += f"  - Day's Range: {dl:,.2f} – {dh:,.2f}\n"
                            results_summary.append(item)
                except Exception as exc:
                    logger.debug("Failed fetching index %s: %s", sym, exc)

        if results_summary:
            tavily_key = os.getenv("TAVILY_API_KEY", "")
            news_context = await self._search_tavily(f"NSE BSE Indian stock market closing news summary {query}", tavily_key) if tavily_key else None
            summary_card = "Indian Equity Markets Live Closing & Index Summary (NSE & BSE Benchmarks):\n" + "\n".join(results_summary)
            if news_context:
                summary_card += f"\n\nMarket Headlines & Sectoral Context:\n{news_context}"
            return summary_card
        return None

    async def _fetch_fii_dii_summary(self, query: str) -> Optional[str]:
        """Fetch live FII/DII institutional net buy/sell values and India VIX volatility index."""
        q_lower = query.lower()
        fii_terms = ["fii", "dii", "institutional", "fii dii", "vix", "volatility", "pcr", "put call ratio"]
        if not any(term in q_lower for term in fii_terms):
            return None

        import httpx
        vix_str = "India VIX: N/A"
        try:
            url = "https://query1.finance.yahoo.com/v8/finance/chart/^INDIAVIX?interval=1d&range=1d"
            headers = {"User-Agent": "Mozilla/5.0"}
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    meta = resp.json().get("chart", {}).get("result", [{}])[0].get("meta", {})
                    price = meta.get("regularMarketPrice")
                    pc = meta.get("chartPreviousClose")
                    if price:
                        diff = (price - pc) if pc else 0.0
                        sign = "+" if diff >= 0 else ""
                        vix_str = f"India VIX (Market Volatility Index): {price:.2f} ({sign}{diff:.2f})"
        except Exception as exc:
            logger.debug("Failed fetching India VIX: %s", exc)

        tavily_key = os.getenv("TAVILY_API_KEY", "")
        fii_snippets = await self._search_tavily(f"FII DII net buy sell activity today NSE BSE moneycontrol cash market {query}", tavily_key) if tavily_key else None

        card = f"Institutional FII/DII Net Flow & Volatility Sentiment Card:\n- {vix_str}\n"
        if fii_snippets:
            card += f"\nInstitutional Cash Market Buying/Selling Data:\n{fii_snippets}\n"

        card += (
            "INSTRUCTION TO LLM: Synthesize the FII/DII figures and India VIX level above into an executive market sentiment card. "
            "Clearly state whether FIIs/DIIs are net buyers or sellers in ₹ Crores, explain what India VIX indicates for market risk, and provide an executive summary."
        )
        return card

    async def _fetch_live_finance(self, query: str) -> Optional[str]:
        """Fetch live ticker prices and stock metrics from Yahoo Finance API without hardcoded maps."""
        fii_res = await self._fetch_fii_dii_summary(query)
        if fii_res:
            return fii_res

        broad_res = await self._fetch_broad_market_summary(query)
        if broad_res:
            return broad_res

        symbol = await self._resolve_ticker_symbol(query)
        if not symbol:
            return None

        try:
            import httpx
            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=1d"
            async with httpx.AsyncClient(timeout=4.0) as client:
                resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
                if resp.status_code == 200:
                    data = resp.json()
                    result = data.get("chart", {}).get("result", [{}])[0]
                    meta = result.get("meta", {})
                    current_price = meta.get("regularMarketPrice")
                    prev_close = meta.get("chartPreviousClose") or meta.get("previousClose")
                    day_low = meta.get("regularMarketDayLow") or meta.get("dayLow")
                    day_high = meta.get("regularMarketDayHigh") or meta.get("dayHigh")
                    fifty_two_low = meta.get("fiftyTwoWeekLow")
                    fifty_two_high = meta.get("fiftyTwoWeekHigh")
                    currency = meta.get("currency", "INR")
                    long_name = meta.get("longName") or meta.get("shortName") or name

                    if current_price:
                        def _safe_float(val):
                            try:
                                return float(val)
                            except (TypeError, ValueError):
                                return None

                        cp = _safe_float(current_price)
                        pc = _safe_float(prev_close)
                        dl = _safe_float(day_low)
                        dh = _safe_float(day_high)
                        ftl = _safe_float(fifty_two_low)
                        fth = _safe_float(fifty_two_high)

                        diff_str = ""
                        pct_str = ""
                        if cp is not None and pc is not None and pc > 0:
                            diff = round(cp - pc, 2)
                            pct = round((diff / pc) * 100, 2)
                            symbol_str = "+" if diff >= 0 else ""
                            diff_str = f" ({symbol_str}{diff:.2f})"
                            pct_str = f" {symbol_str}{pct:.2f}%"

                        range_str = f"{currency} {dl:.2f} – {dh:.2f}" if (dl is not None and dh is not None) else "N/A"
                        ft_str = f"{currency} {ftl:.2f} / {fth:.2f}" if (ftl is not None and fth is not None) else "N/A"

                        cp_fmt = f"{cp:.2f}" if cp is not None else str(current_price)
                        pc_fmt = f"{pc:.2f}" if pc is not None else "N/A"

                        card = (
                            f"Live Financial Ticker Card ({long_name} / Symbol: {symbol}):\n"
                            f"- Current Share Price: {currency} {cp_fmt}{diff_str}{pct_str}\n"
                            f"- Previous Close: {currency} {pc_fmt}\n"
                            f"- Day's Range: {range_str}\n"
                            f"- 52-Week High / Low: {ft_str}\n"
                        )

                        tavily_key = os.getenv("TAVILY_API_KEY", "")
                        if tavily_key:
                            if symbol.startswith("^"):
                                fund_snippets = await self._search_tavily(f"{long_name} stock market index news analysis today Indian equity market", tavily_key)
                            else:
                                fund_snippets = await self._search_tavily(f"{query} stock P/E ratio market cap ROE debt equity fundamental ratios screener", tavily_key)
                            if fund_snippets:
                                card += f"\nFundamental Ratios & Financial Overview:\n{fund_snippets}\n"

                        card += (
                            f"INSTRUCTION TO LLM: Present this stock data in a clean, executive Google AI Overview format. "
                            f"Include a short summary sentence, Key Stock Statistics & Fundamental Ratios bullet points, and an inviting follow-up question."
                        )
                        return card
        except Exception as e:
            logger.warning("Live Yahoo Finance lookup failed for %s: %s", symbol, e)
        return None

    async def _search_tavily(self, query: str, api_key: str) -> Optional[str]:
        """Call Tavily API for clean web search context."""
        try:
            import httpx
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(
                    "https://api.tavily.com/search",
                    json={
                        "api_key": api_key,
                        "query": query,
                        "search_depth": "basic",
                        "max_results": 4
                    }
                )
                if resp.status_code == 200:
                    results = resp.json().get("results", [])
                    if results:
                        snippets = [
                            f"- {r.get('title')}: {self._clean_text(r.get('content', ''))}"
                            for r in results[:4]
                        ]
                        return "\n".join(snippets)
        except Exception as e:
            logger.warning("Tavily API call failed: %s", e)
        return None

    async def _search_searxng(self, query: str, base_url: str) -> Optional[str]:
        """Call in-house self-hosted SearXNG metasearch engine."""
        try:
            import httpx
            endpoint = f"{base_url.rstrip('/')}/search"
            async with httpx.AsyncClient(timeout=4.0) as client:
                resp = await client.get(
                    endpoint,
                    params={"q": query, "format": "json"},
                    headers={"User-Agent": "MitraInHouseCompanion/1.0"}
                )
                if resp.status_code == 200:
                    results = resp.json().get("results", [])
                    if results:
                        snippets = [
                            f"- {r.get('title')}: {self._clean_text(r.get('content', ''))}"
                            for r in results[:4]
                        ]
                        return "\n".join(snippets)
        except Exception as e:
            logger.warning("SearXNG search call failed (%s): %s", base_url, e)
        return None

    async def _search_ddg(self, query: str) -> Optional[str]:
        """Real-time DuckDuckGo web search fallback."""
        try:
            import httpx
            from bs4 import BeautifulSoup
            encoded = urllib.parse.quote(query)
            url = f"https://html.duckduckgo.com/html/?q={encoded}"
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
                if resp.status_code == 200:
                    soup = BeautifulSoup(resp.text, "html.parser")
                    results = soup.find_all("a", class_="result__snippet")
                    snippets = []
                    for r in results[:4]:
                        text = self._clean_text(r.get_text())
                        if text:
                            snippets.append(f"- {text}")
                    if snippets:
                        return "\n".join(snippets)
        except Exception as e:
            logger.warning("DuckDuckGo search failed: %s", e)
        return None

    @staticmethod
    def _clean_text(text: str) -> str:
        """Strip HTML tags, raw pipe table syntax, timestamp IDs, and extra whitespace."""
        if not text:
            return ""
        # Remove script and style elements
        t = re.sub(r"<script.*?>.*?</script>", "", text, flags=re.DOTALL | re.IGNORECASE)
        t = re.sub(r"<style.*?>.*?</style>", "", t, flags=re.DOTALL | re.IGNORECASE)
        t = re.sub(r"<.*?>", " ", t)
        # Remove table pipe dividers like | 58% | 59% |
        t = re.sub(r"\|\s*", " ", t)
        # Remove 8+ digit numeric timestamp IDs like 125735712
        t = re.sub(r"\b\d{8,}\b", "", t)
        # Normalize whitespace
        t = re.sub(r"\s+", " ", t).strip()
        return t
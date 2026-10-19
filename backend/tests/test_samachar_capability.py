import pytest
from unittest.mock import AsyncMock, patch
from app.capabilities.samachar_capability import SamacharCapability
from app.capabilities.base_capability import CapabilityResult

@pytest.fixture
def anyio_backend():
    return "asyncio"

@pytest.mark.anyio
async def test_samachar_capability_execute_with_url():
    capability = SamacharCapability()
    
    # Mock HTTP response data matching the Samachar API contract
    mock_response_data = {
        "success": True,
        "data": {
            "scraped_data": {
                "title": "Mitra Integration Succeeds",
                "author": "Ashwini Wadekar",
                "date": "2026-08-21",
                "category": "Technology"
            },
            "vetting_results": {
                "authenticity_score": 95,
                "credibility_rating": "High"
            },
            "summary": {
                "text": "Mitra companion has successfully completed the integration of Samachar capability using clean HTTP contracts."
            },
            "brief_description": "Mitra successfully integrates Samachar."
        },
        "message": "Complete 3-tool workflow finished successfully",
        "timestamp": "2026-08-21T12:00:00"
    }

    # Mock httpx AsyncClient
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        from unittest.mock import MagicMock
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_response_data
        mock_post.return_value = mock_response

        # Execute capability with a query containing a URL
        params = {
            "message": "Check this article: https://example.com/mitra-news",
            "user_id": "test_user"
        }
        
        result = await capability.execute(intent="news", params=params, trace_id="trc_test_001")
        
        assert result.status == "success"
        assert "TITLE: Mitra Integration Succeeds" in result.data["result"]
        assert "CREDIBILITY: High" in result.data["result"]
        assert "Score: 95/100" in result.data["result"]
        assert "SUMMARY:\nMitra companion has successfully completed" in result.data["result"]
        assert result.data["url"] == "https://example.com/mitra-news"


@pytest.mark.anyio
async def test_samachar_capability_execute_with_text_query():
    capability = SamacharCapability()
    
    # Mock DuckDuckGo URL search to return a mock link
    async def mock_search_first_url(query):
        return "https://example.com/scraped-news-link"

    capability._search_first_url = mock_search_first_url

    # Mock HTTP response data
    mock_response_data = {
        "success": True,
        "data": {
            "scraped_data": {
                "title": "Search Query Resolved",
                "author": "Tech News Daily",
                "date": "2026-08-21",
                "category": "News"
            },
            "vetting_results": {
                "authenticity_score": 82,
                "credibility_rating": "Medium"
            },
            "summary": {
                "text": "DuckDuckGo search returns the top URL, which is then successfully parsed by Samachar."
            }
        }
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        from unittest.mock import MagicMock
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_response_data
        mock_post.return_value = mock_response

        # Execute capability with a plain text query
        params = {
            "message": "latest news about Mitra integration",
            "user_id": "test_user"
        }
        
        result = await capability.execute(intent="news", params=params, trace_id="trc_test_002")
        
        assert result.status == "success"
        assert result.data["url"] == "https://example.com/scraped-news-link"
        assert "TITLE: Search Query Resolved" in result.data["result"]
        assert "CREDIBILITY: Medium" in result.data["result"]

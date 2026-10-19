# MITRA - Complete Startup Guide

## Quick Start

### Prerequisites

1. Python 3.11+ installed
2. Node.js 16+ installed
3. MongoDB Atlas account (or local MongoDB)
4. Docker & Docker Compose (for containerized deployment)

---

## Option 1: Docker Compose (Recommended)

### 1. Navigate to Backend Directory

```bash
cd backend
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `backend/.env`:

```env
# Required
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/?appName=Mitra
DATABASE_NAME=mitra_production
API_KEY=your_secure_api_key_here
JWT_SECRET_KEY=your_secure_jwt_secret_here

# Optional: LLM providers
GROQ_API_KEY=your_groq_key
OPENAI_API_KEY=your_openai_key

# Optional: Ecosystem products
UNIGURU_API_URL=https://uniguru.bhiv.example.com/api/v1
UNIGURU_API_KEY=your_key
```

### 3. Start All Services

```bash
docker-compose up -d
```

This starts 7 services:
- `mitra-core` - Backend API (port 8000)
- `mitra-worker` - Background worker
- `mongodb` - Database (port 27017)
- `redis` - Cache (port 6379)
- `prometheus` - Metrics (port 9090)
- `grafana` - Dashboards (port 3001)
- `otel-collector` - Tracing (port 4317)

### 4. Verify

```bash
# Health check
curl http://localhost:8000/health

# Prometheus
curl http://localhost:9090

# Grafana (admin/admin)
open http://localhost:3001
```

---

## Option 2: Kubernetes

### 1. Apply Manifests

```bash
cd backend/deploy/kubernetes

kubectl apply -f namespace.yml
kubectl apply -f configmap.yml
kubectl apply -f secrets.yml
kubectl apply -f deployment.yml
kubectl apply -f service.yml
kubectl apply -f ingress.yml
kubectl apply -f network-policy.yml
```

### 2. Verify

```bash
kubectl -n mitra get pods
kubectl -n mitra get services
```

---

## Option 3: Local Development

### Backend Setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Mac/Linux
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend Setup

```bash
cd frontend/frontend
npm install
npm start
```

### Verify

- Backend: http://localhost:8000/docs
- Frontend: http://localhost:3000
- Health: http://localhost:8000/health

---

## API Endpoints

### Core

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | API info and endpoint listing |
| `/health` | GET | Health check with MongoDB probe |
| `/health/system` | GET | Deep system health |

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/signup` | POST | User registration |
| `/api/auth/login` | POST | User login |
| `/api/auth/me` | GET | Get current user |
| `/api/auth/logout` | POST | User logout |

### Assistant

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/assistant` | POST | Main chat endpoint (V3.0.0) |
| `/api/mitra/evaluate` | POST | Policy evaluation |

### Ecosystem Integration

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ecosystem/products` | GET | List BHIV products |
| `/api/ecosystem/manifests` | GET | Integration manifests |
| `/api/ecosystem/health` | GET | Integration health |
| `/api/ecosystem/query` | POST | Query a BHIV product |
| `/api/ecosystem/execute` | POST | Execute on a BHIV product |
| `/api/ecosystem/snapshot` | GET | Full registry snapshot |

### Replay & Audit

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/replay/{trace_id}` | POST | Replay a trace |
| `/api/replay/{trace_id}/stages` | GET | Get trace stages |
| `/api/replay/compare` | POST | Compare traces |

### Observability

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/metrics` | GET | System metrics |
| `/api/metrics/system` | GET | Detailed metrics |
| `/api/metrics/enforcement` | GET | Enforcement metrics |
| `/metrics` | GET | Prometheus metrics |

### Voice

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tts` | POST | Text-to-speech |
| `/api/tts/status` | GET | TTS engine status |

### Webhooks

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhooks/whatsapp` | POST | WhatsApp inbound |
| `/webhooks/telegram` | POST | Telegram inbound |
| `/webhooks/email` | POST | Email inbound |
| `/webhooks/instagram` | POST | Instagram inbound |

---

## Testing

### Test Backend API

**Signup:**
```bash
curl -X POST http://localhost:8000/api/auth/signup \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key" \
  -d '{"name": "Test User", "email": "test@example.com", "password": "testpass123"}'
```

**Chat:**
```bash
curl -X POST http://localhost:8000/api/assistant \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key" \
  -d '{
    "version": "3.0.0",
    "input": {"message": "Hello, what can you do?"},
    "context": {"platform": "web", "device": "desktop"}
  }'
```

**Ecosystem Query:**
```bash
curl -X GET http://localhost:8000/api/ecosystem/products \
  -H "X-API-Key: your_api_key"
```

### Load Testing

```bash
cd backend
pip install locust
bash deploy/loadtest/run_loadtest.sh 50 10 60
```

---

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `DATABASE_NAME` | Database name |
| `API_KEY` | API authentication key |
| `JWT_SECRET_KEY` | JWT signing secret |

### Optional (AI)

| Variable | Description |
|----------|-------------|
| `GROQ_API_KEY` | Groq API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `GOOGLE_API_KEY` | Google Gemini key |
| `MISTRAL_API_KEY` | Mistral API key |

### Optional (Ecosystem)

| Variable | Description |
|----------|-------------|
| `UNIGURU_API_URL` | UniGuru API URL |
| `UNIGURU_API_KEY` | UniGuru API key |
| `SETU_API_URL` | SETU API URL |
| `SETU_API_KEY` | SETU API key |
| `GURUKUL_API_URL` | Gurukul API URL |
| `GURUKUL_API_KEY` | Gurukul API key |
| `SAMRUDDHI_API_URL` | Samruddhi API URL |
| `SAMRUDDHI_API_KEY` | Samruddhi API key |
| `NAMAMI_GANGE_API_URL` | Namami Gange API URL |
| `NAMAMI_GANGE_API_KEY` | Namami Gange API key |
| `SVACS_API_URL` | SVACS API URL |
| `SVACS_API_KEY` | SVACS API key |
| `UCCIS_API_URL` | UCCIS API URL |
| `UCCIS_API_KEY` | UCCIS API key |
| `NYAI_API_URL` | NYAI API URL |
| `NYAI_API_KEY` | NYAI API key |
| `BRAHMANDA_API_URL` | Brahmanda API URL |
| `BRAHMANDA_API_KEY` | Brahmanda API key |
| `TANTRA_API_URL` | TANTRA API URL |
| `TANTRA_API_KEY` | TANTRA API key |

### Optional (Integrations)

| Variable | Description |
|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Twilio SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token |
| `BREVO_API_KEY` | Brevo email key |
| `SENDGRID_API_KEY` | SendGrid key |

### Optional (Monitoring)

| Variable | Description |
|----------|-------------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTEL collector endpoint |
| `OTEL_SERVICE_NAME` | Service name for traces |
| `SENTRY_DSN` | Sentry error tracking |

---

## Troubleshooting

### Backend Won't Start

1. Check Python version: `python --version` (need 3.11+)
2. Check MongoDB connection: Verify `MONGODB_URI` in `.env`
3. Check port availability: Ensure port 8000 is not in use

### Docker Issues

1. Check Docker is running: `docker ps`
2. Check logs: `docker-compose logs mitra-core`
3. Rebuild: `docker-compose build --no-cache`

### Monitoring Not Working

1. Verify OTEL collector: `docker-compose logs otel-collector`
2. Check Prometheus targets: http://localhost:9090/targets
3. Verify Grafana datasource: http://localhost:3001/datasources

### Ecosystem Adapters Failing

1. Check adapter health: `curl -H "X-API-Key: your_key" http://localhost:8000/api/ecosystem/health`
2. Verify product API URLs in environment variables
3. Check network connectivity to product APIs

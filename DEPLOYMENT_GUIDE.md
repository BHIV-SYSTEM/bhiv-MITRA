# MITRA Enterprise Deployment Guide

## Prerequisites

- Docker & Docker Compose
- kubectl (for Kubernetes)
- MongoDB Atlas account or local MongoDB
- Python 3.11+
- Node.js 16+

## Quick Start (Docker Compose)

```bash
cd backend

# Create .env file
cp .env.example .env
# Edit .env with your API keys

# Start all services
docker-compose up -d

# Verify
curl http://localhost:8000/health
curl http://localhost:9090 (Prometheus)
curl http://localhost:3001 (Grafana)
```

## Kubernetes Deployment

```bash
cd backend/deploy/kubernetes

# Create namespace
kubectl apply -f namespace.yml

# Apply configs
kubectl apply -f configmap.yml
kubectl apply -f secrets.yml

# Deploy
kubectl apply -f deployment.yml
kubectl apply -f service.yml
kubectl apply -f ingress.yml
kubectl apply -f network-policy.yml

# Verify
kubectl -n mitra get pods
kubectl -n mitra get services
```

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

### Optional (Integrations)
| Variable | Description |
|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Twilio SID |
| `TELEGRAM_BOT_TOKEN` | Telegram token |
| `BREVO_API_KEY` | Brevo email key |
| `SENDGRID_API_KEY` | SendGrid key |

### Optional (Ecosystem)
| Variable | Description |
|----------|-------------|
| `UNIGURU_API_URL` | UniGuru API URL |
| `UNIGURU_API_KEY` | UniGuru API key |
| `SETU_API_URL` | SETU API URL |
| `SETU_API_KEY` | SETU API key |
| (same pattern for all BHIV products) |

### Optional (Monitoring)
| Variable | Description |
|----------|-------------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTEL collector endpoint |
| `OTEL_SERVICE_NAME` | Service name for traces |
| `SENTRY_DSN` | Sentry error tracking |

## Monitoring

### Prometheus
- URL: `http://localhost:9090`
- Metrics: Request rate, latency, errors, enforcement

### Grafana
- URL: `http://localhost:3001`
- Default password: `admin`
- Dashboard: MITRA Enterprise Dashboard

### OpenTelemetry
- Collector: `http://localhost:4317`
- Traces and metrics exported via OTLP

## Load Testing

```bash
cd backend

# Install locust
pip install locust

# Run load test
bash deploy/loadtest/run_loadtest.sh 50 10 60

# Run stress test
python deploy/loadtest/stress_test.py
```

## Troubleshooting

### Backend won't start
1. Check Python version: `python --version` (need 3.11+)
2. Check MongoDB connection in `.env`
3. Check port 8000 availability

### Monitoring not working
1. Verify OTEL collector is running
2. Check Prometheus scrape targets at `http://localhost:9090/targets`
3. Verify Grafana datasource connection

### Ecosystem adapters failing
1. Check product API URLs in environment variables
2. Verify API keys are set correctly
3. Check adapter health at `/api/ecosystem/health`

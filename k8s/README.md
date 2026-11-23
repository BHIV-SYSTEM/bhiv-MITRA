# MITRA Kubernetes manifests

These manifests are based on the repository's current deployment structure:

- Backend: FastAPI/Uvicorn, listens on container port 8000.
- Frontend: React static build served on container port 3000.
- Images: `bhiv/mitra-backend` and `bhiv/mitra-frontend`.
- MongoDB: external service; Kubernetes does not create a MongoDB instance.
- Public host: `mitra.blackholeinfiverse.com`.

## Important before deploying

1. Build and push immutable image tags for both services. Replace `latest` in
   `backend-deployment.yaml` and `frontend-deployment.yaml` with the same tested
   Git SHA tag used by CI/CD.
2. Create the `mitra` namespace, then create `mitra-backend-secrets` in it.
   Do not commit real credentials. `secret.example.yaml` is a template only.
3. Set `MONGODB_URI` to a reachable production MongoDB connection string.
4. The existing frontend Dockerfile compiles `REACT_APP_API_URL` and
   `REACT_APP_API_KEY` into the React build. Build the frontend image with:
   - `REACT_APP_API_URL=https://mitra.blackholeinfiverse.com/api`
   - `REACT_APP_AUTH_API_URL=https://mitra.blackholeinfiverse.com/api`
   - `REACT_APP_API_KEY` equal to the backend `API_KEY`
   - `REACT_APP_USER_ID=user_default`
   These are build-time values, not runtime ConfigMap values.
5. Install an NGINX Ingress Controller and provision the TLS secret `mitra-tls`
   in namespace `mitra` (or change the Ingress for your cluster's ingress class
   and certificate manager).
6. Ensure the cluster has a default StorageClass, or set `storageClassName` in
   `backend-pvc.yaml`.

## Apply

Create the namespace and secret first:

```bash
kubectl apply -f namespace.yaml
kubectl -n mitra create secret generic mitra-backend-secrets \
  --from-literal=API_KEY='REPLACE_ME' \
  --from-literal=JWT_SECRET_KEY='REPLACE_ME' \
  --from-literal=TOKEN_ENCRYPTION_KEY='REPLACE_ME' \
  --from-literal=MONGODB_URI='mongodb+srv://USER:PASSWORD@HOST/mitra_db' \
  --from-literal=GROQ_API_KEY='' \
  --from-literal=OPENAI_API_KEY='' \
  --from-literal=GOOGLE_API_KEY='' \
  --from-literal=MISTRAL_API_KEY='' \
  --from-literal=SENTRY_DSN=''

kubectl apply -k .
kubectl -n mitra rollout status deployment/mitra-backend
kubectl -n mitra rollout status deployment/mitra-frontend
kubectl -n mitra get pods,svc,ingress,pvc
```

For an already-created Secret, subsequent `kubectl apply -k .` will reuse it.

## Internal service URLs

- Backend: `http://mitra-backend.mitra.svc.cluster.local:8000`
- Frontend: `http://mitra-frontend.mitra.svc.cluster.local:3000`

## Validation and troubleshooting

```bash
kubectl -n mitra get pods -o wide
kubectl -n mitra describe pod -l app.kubernetes.io/name=mitra-backend
kubectl -n mitra logs deployment/mitra-backend --tail=100
kubectl -n mitra logs deployment/mitra-frontend --tail=100
kubectl -n mitra get events --sort-by=.lastTimestamp
kubectl -n mitra port-forward svc/mitra-backend 8000:8000
curl http://127.0.0.1:8000/health
```

## Design notes

- Backend is intentionally set to one replica because current code includes
  in-memory notifications/session state and optional reminder scheduling.
  Do not enable multiple backend replicas or an HPA until that state is moved
  to shared storage and scheduler execution is made singleton-safe.
- Backend `/health` checks MongoDB connectivity. A failed MongoDB connection
  must be treated as a dependency/configuration issue, not a Kubernetes
  networking issue by default.
- Backend data is persisted on a 5Gi PVC; logs use `emptyDir` and should be
  collected from stdout/stderr by the cluster logging stack.
- Ingress sends `/api` to FastAPI and all other paths to the React frontend.
  Confirm the frontend build's API URL and API route prefixes match this rule.

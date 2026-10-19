# MITRA PHASE 9: NEXT 3 TASKS

**Date:** July 4, 2026
**Version:** 3.0.0
**Classification:** Constitutional Audit Deliverable

---

## MANDATORY TASKS

Each task must:
- Reduce risk
- Increase convergence
- Improve replayability
- Improve authority discipline

---

## TASK 1: FIX IDENTITY PROPAGATION

**Priority:** CRITICAL
**Risk Reduction:** HIGH
**Convergence Improvement:** +10%
**Replayability Improvement:** MEDIUM
**Authority Discipline Improvement:** HIGH

### Problem

User identity does NOT flow from frontend to backend assistant requests. The JWT token is stored in localStorage but not forwarded to `/api/assistant`. Additionally, JWT contracts between Express (legacy) and FastAPI (current) are mismatched.

### Evidence

1. `api.ts:19-23`: Frontend gets token from localStorage
2. `api.ts:79`: Frontend calls `/api/assistant` with token
3. `assistant.py:88-128`: Backend attempts to extract user from token
4. `INTEGRATION_DISCLOSURE_REPORT.md:117-125`: Documents JWT mismatch

### Solution

**Step 1: Align JWT Contracts**

Ensure FastAPI and Express use the same JWT format:
- Same `sub` claim
- Same `JWT_SECRET_KEY`
- Same token structure

**Step 2: Forward Bearer Token**

Ensure frontend forwards Bearer token in assistant requests:
```typescript
// api.ts
const headers: Record<string, string> = {
  'Content-Type': 'application/json',
  'X-API-Key': API_KEY,
};
const token = getToken();
if (token) {
  headers['Authorization'] = `Bearer ${token}`;
}
```

**Step 3: Backend Enrichment**

Ensure backend enriches request with authenticated user:
```python
# assistant.py
authenticated_user_context = _build_authenticated_user_context(
    request_context=request.context,
    x_api_key=x_api_key,
    authorization=authorization,
)
```

**Step 4: Remove Legacy Express Auth**

Archive or remove `frontend/Signup/` to eliminate confusion.

### Verification

1. End-to-end test: signup → login → chat → response with user identity
2. Backend logs show authenticated user in request context
3. No legacy Express auth service running

### Estimated Effort

- JWT alignment: 2-3 hours
- Token forwarding: 1 hour
- Backend enrichment: 2-3 hours
- Legacy removal: 1 hour
- Testing: 2-3 hours
- **Total: 8-11 hours**

---

## TASK 2: IMPLEMENT REPLAY TEST HARNESS

**Priority:** HIGH
**Risk Reduction:** HIGH
**Convergence Improvement:** +8%
**Replayability Improvement:** HIGH
**Authority Discipline Improvement:** MEDIUM

### Problem

No tool exists to replay a trace end-to-end. A future developer cannot:
- Replay a request with modified input
- Replay policy against historical input
- Replay enforcement against historical input
- Test policy changes against historical data

### Evidence

1. No replay endpoint in any router
2. No replay test in `tests/`
3. No replay tool in `app/`
4. `TRACE_AND_REPLAY_REPORT.md`: "Replay Capability: NOT IMPLEMENTED"

### Solution

**Step 1: Create Replay Endpoint**

Add `/api/replay/{trace_id}` endpoint:
```python
# app/api/replay.py
@router.post("/api/replay/{trace_id}")
async def replay_trace(trace_id: str, modifications: dict = None):
    # 1. Load original request from bucket
    # 2. Apply modifications
    # 3. Re-run through pipeline
    # 4. Compare results
    # 5. Return comparison
```

**Step 2: Create Replay Test Suite**

Add tests that:
- Replay historical traces
- Test policy changes against historical data
- Test enforcement changes against historical data
- Compare original vs replayed results

**Step 3: Create Replay CLI Tool**

Add `tools/replay.py` command-line tool:
```bash
python tools/replay.py --trace-id <id> --modify '{"input": {"message": "new message"}}'
```

### Verification

1. Replay endpoint works
2. Replay tests pass
3. CLI tool can replay any trace
4. Comparison results are accurate

### Estimated Effort

- Replay endpoint: 4-6 hours
- Replay test suite: 4-6 hours
- CLI tool: 2-3 hours
- Testing: 2-3 hours
- **Total: 12-18 hours**

---

## TASK 3: ADD AUTHORITY BOUNDARY TESTS

**Priority:** HIGH
**Risk Reduction:** MEDIUM
**Convergence Improvement:** +5%
**Replayability Improvement:** MEDIUM
**Authority Discipline Improvement:** HIGH

### Problem

No tests verify authority boundaries:
- No test verifies entry guard rejects direct enforcement
- No test verifies conflict guard prevents RL override
- No test verifies enforcement requires bucket artifact
- No test verifies execution requires ALLOW

### Evidence

1. `tests/` directory: No authority boundary tests
2. `AUTHORITY_MATRIX.md`: Documents authority but no tests
3. `GOVERNANCE_DRIFT_REPORT.md`: "Testing → Legitimacy Drift"

### Solution

**Step 1: Create Authority Test Suite**

Add `tests/test_authority_boundaries.py`:
```python
def test_entry_guard_rejects_direct_enforcement():
    # Verify PermissionError when calling enforcement directly

def test_conflict_guard_prevents_rl_override():
    # Verify RL cannot change policy decision

def test_enforcement_requires_bucket_artifact():
    # Verify enforcement fails closed without artifact

def test_execution_requires_allow():
    # Verify execution blocked unless verdict is ALLOW

def test_trace_id_immutable():
    # Verify trace_id cannot be overridden
```

**Step 2: Create Governance Test Suite**

Add `tests/test_governance.py`:
```python
def test_policy_immutability():
    # Verify policy decision cannot be changed after evaluation

def test_enforcement_verdict_immutability():
    # Verify verdict is frozen dataclass

def test_bucket_immutability():
    # Verify bucket documents are write-once

def test_authority_hierarchy():
    # Verify authority flows correctly through pipeline
```

### Verification

1. All authority boundary tests pass
2. All governance tests pass
3. Tests catch regressions

### Estimated Effort

- Authority tests: 4-6 hours
- Governance tests: 4-6 hours
- Testing: 2-3 hours
- **Total: 10-15 hours**

---

## TASK SUMMARY

| Task | Priority | Effort | Risk Reduction | Convergence |
|------|----------|--------|----------------|-------------|
| Fix Identity Propagation | CRITICAL | 8-11 hours | HIGH | +10% |
| Implement Replay Harness | HIGH | 12-18 hours | HIGH | +8% |
| Add Authority Tests | HIGH | 10-15 hours | MEDIUM | +5% |
| **TOTAL** | — | **30-44 hours** | **HIGH** | **+23%** |

---

## PROJECTED CONVERGENCE AFTER TASKS

```
Current State:      72.3% — Partially Converged
After Task 1:       82.3% — Substantially Converged
After Task 2:       90.3% — Fully Converged
After Task 3:       95.3% — Fully Converged (with governance)
```

---

## IMPLEMENTATION ORDER

1. **Task 1** (CRITICAL): Fix identity propagation
   - Day 1: Align JWT contracts, forward Bearer token
   - Day 2: Backend enrichment, remove legacy auth
   - Day 3: End-to-end testing

2. **Task 2** (HIGH): Implement replay harness
   - Day 4-5: Replay endpoint and CLI tool
   - Day 6: Replay test suite
   - Day 7: Testing

3. **Task 3** (HIGH): Add authority tests
   - Day 8-9: Authority boundary tests
   - Day 10: Governance tests
   - Day 11: Testing

**Total Timeline: 11 working days**

---

## SUCCESS CRITERIA

After all 3 tasks are complete:

1. **Identity Propagation:** User identity flows from frontend to backend
2. **Replay Capability:** Any trace can be replayed end-to-end
3. **Authority Discipline:** All authority boundaries are tested
4. **Convergence:** System reaches 95%+ convergence score
5. **Sovereign Participation:** System is ready for sovereign ecosystem participation

---

## RISK MITIGATION

| Risk | Mitigation |
|------|------------|
| Task 1 breaks existing auth | Test in staging before production |
| Task 2 introduces new bugs | Add to CI/CD pipeline |
| Task 3 increases test time | Parallelize test execution |
| Timeline slips | Prioritize Task 1 (CRITICAL) |

---

## FINAL NOTE

These 3 tasks address the critical gaps identified in the audit. Completing them will:
- Fix the broken identity propagation
- Add replay capability for governance
- Prove authority boundaries with tests
- Achieve 95%+ convergence score
- Enable sovereign ecosystem participation

**Estimated Total Effort:** 30-44 hours (4-5 working days)
**Expected Outcome:** FULLY CONVERGED SYSTEM

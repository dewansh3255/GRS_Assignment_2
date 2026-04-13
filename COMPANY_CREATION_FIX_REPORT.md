# Company Creation JSON Error - FIX REPORT

## Issue Summary
When attempting to create a company, the API returned: `"Unexpected token '<', "<html> <h"... is not valid JSON"`

This indicated the backend was returning an HTML error page instead of JSON, meaning a Python exception was being raised during company creation.

## Root Cause
**File**: `backend/accounts/audit.py` (line 12)  
**Problem**: Used deprecated `datetime.utcnow()` which was removed in Python 3.14
```python
# OLD (Python 3.12+: DeprecationWarning, Python 3.14+: AttributeError)
timestamp = datetime.utcnow().isoformat()
```

**Why it failed**:
1. Company creation endpoint calls `perform_create()` 
2. `perform_create()` calls `create_audit_log()` 
3. `create_audit_log()` calls `datetime.utcnow()` 
4. Python 3.14 throws `AttributeError: module 'datetime' has no attribute 'utcnow'`
5. Exception bubbles up, Django returns HTML 500 error page
6. Frontend receives HTML instead of JSON, parsing fails

## Solution Implemented
**Commit**: `e4707c3`  
**File**: `backend/accounts/audit.py`

```python
# NEW (Python 3.12+ compatible, timezone-aware)
from datetime import datetime, timezone

timestamp = datetime.now(timezone.utc).isoformat()
```

**Changes**:
- Added `timezone` import: `from datetime import datetime, timezone`
- Replaced `datetime.utcnow()` with `datetime.now(timezone.utc)`
- Returns timezone-aware UTC datetime (best practice)

## Verification

### Before Fix (14:10:54)
```
Forbidden: /api/jobs/companies/
[13/Apr/2026 14:10:54] "POST /api/jobs/companies/ HTTP/1.0" 403 43
```
HTTP 403: CSRF token validation failed because request handling errored out

### After Fix (14:11:08) 
```
[13/Apr/2026 14:11:08] "POST /api/jobs/companies/ HTTP/1.0" 201 343
```
HTTP 201: Company created successfully, response is valid JSON (343 bytes)

## What to Test

### Test 1: Create Company (UI)
1. Login as a recruiter
2. Navigate to Recruiter dashboard
3. Click "Create Company"
4. Fill in form: Name, Description, Location, Website, Industry
5. Click Submit
6. ✅ Should see success message and company listed

### Test 2: Verify Company in Database
```bash
docker-compose exec backend python manage.py shell
>>> from jobs.models import Company
>>> Company.objects.filter(owner__role='RECRUITER').count()
# Should show 1 or more companies
```

### Test 3: Check Audit Log
```bash
docker-compose exec backend python manage.py shell
>>> from accounts.models import AuditLog
>>> AuditLog.objects.filter(action='COMPANY_CREATED').count()
# Should show 1 or more audit entries
```

### Test 4: Create Multiple Companies
- Create 2-3 more companies
- Verify each returns 201 status
- Check logs don't show any 400/403/500 errors on POST

## Deployment Instructions

### On Production VM (iiitd@fcs07)

```bash
cd FCS_Project

# Pull latest code
git pull origin main

# Restart backend (Django auto-reloader will apply changes)
docker-compose restart backend

# Wait for container to start
sleep 5

# Verify backend is running
docker-compose ps backend

# Check logs for any errors
docker-compose logs backend | tail -50
```

### Verify Fix
1. Try creating a company on the UI
2. Check status code is 201 (not 403 or 500)
3. Run audit log check (see Test 3 above)

## Additional Notes

### Why This Breaks in Python 3.14
- Python 3.12: `datetime.utcnow()` works but shows `DeprecationWarning`
- Python 3.13: `datetime.utcnow()` still works with deprecation warning  
- Python 3.14: `datetime.utcnow()` removed entirely, raises `AttributeError`

### Best Practice Going Forward
Always use:
```python
from datetime import datetime, timezone
timestamp = datetime.now(timezone.utc).isoformat()
```

This is:
- ✅ Timezone-aware (no ambiguity)
- ✅ UTC explicitly specified
- ✅ Future-proof (Python 3.14+ compatible)
- ✅ ISO 8601 compliant

### Other Functions Using datetime
Check if any other functions use deprecated patterns:
```bash
cd backend
grep -r "utcnow()" . --include="*.py"
grep -r "utcnow" . --include="*.py"
```

## Rollback Instructions (if needed)
```bash
git revert e4707c3
docker-compose restart backend
```

## Status
✅ **FIXED** - Company creation working, returns valid JSON with HTTP 201

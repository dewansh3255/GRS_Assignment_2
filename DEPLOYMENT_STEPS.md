# Error Handling Fix - Deployment Guide

## Summary of Changes

Fixed cryptic "Unexpected token '<'" errors by ensuring the backend always returns JSON responses instead of HTML error pages. Users now see clear, helpful error messages for all failure scenarios.

## Files Modified

### Backend
1. **backend/core/exception_handler.py** (NEW)
   - Custom DRF exception handler
   - Converts all exceptions to JSON
   - Handles RequestDataTooBig gracefully
   - Logs errors for debugging

2. **backend/core/settings.py** (UPDATED)
   - Added EXCEPTION_HANDLER configuration
   - Set FILE_UPLOAD_MAX_MEMORY_SIZE = 5MB
   - Set DATA_UPLOAD_MAX_MEMORY_SIZE = 5MB

### Frontend
1. **frontend/src/services/api.ts** (UPDATED)
   - Already has getErrorMessage() utility
   - Safely parses JSON or HTML responses
   - Never throws parsing errors

2. **frontend/src/pages/CompanyForm.tsx** (UPDATED)
   - Uses getErrorMessage() for clear errors
   
3. **frontend/src/pages/CompanyDetail.tsx** (UPDATED)
   - Uses getErrorMessage() for clear errors

## Deployment Steps

### Option 1: Docker Deployment (Recommended)

```bash
# 1. SSH into remote VM
ssh iiitd@192.168.2.239
# Enter password: apple123

# 2. Navigate to project
cd FCS_Project

# 3. Pull latest changes
git pull origin main

# 4. Restart containers
docker-compose restart backend frontend

# 5. Verify restart successful
sleep 5
docker-compose ps

# 6. Check backend logs for errors
docker-compose logs backend | tail -50
```

### Option 2: Local Testing

```bash
# 1. Pull latest changes
git pull origin main

# 2. Check file sizes (should be ~5MB)
grep FILE_UPLOAD_MAX_MEMORY_SIZE backend/core/settings.py

# 3. Verify exception handler registered
grep EXCEPTION_HANDLER backend/core/settings.py

# 4. Validate syntax
python3 -m py_compile backend/core/exception_handler.py
python3 -m py_compile backend/core/settings.py
```

## Testing After Deployment

### Test 1: Large File Upload (> 5MB)

**Steps**:
1. Navigate to Create Company page
2. Select logo image > 5MB (e.g., 10MB)
3. Click Submit

**Expected Result**:
- Error message: "File size exceeds 5MB limit."
- Status code: 413 Payload Too Large
- No "Unexpected token" errors

### Test 2: Valid File Upload (< 5MB)

**Steps**:
1. Navigate to Create Company page
2. Fill all required fields
3. Select logo image < 5MB
4. Click Submit

**Expected Result**:
- HTTP 201 Created
- Redirects to company detail page
- Company appears in list

### Test 3: Company Posting

**Steps**:
1. Navigate to existing company detail page
2. Write a comment/post
3. Click Post

**Expected Result**:
- Comment appears successfully
- No errors in browser console

### Test 4: Browser DevTools Verification

**Steps**:
1. Open DevTools (F12)
2. Go to Network tab
3. Try any file upload or POST request
4. Check Response tab

**Expected Result**:
- Response is JSON (not HTML)
- Response has Content-Type: application/json
- Error messages are readable JSON

**Bad Response** (if something's wrong):
```html
<!DOCTYPE html>
<html>
<head><title>413 Request Entity Too Large</title></head>
```

## Verification Checklist

- [ ] Code pulled: `git status` shows up to date
- [ ] Exception handler file exists: `ls backend/core/exception_handler.py`
- [ ] Settings updated: `grep EXCEPTION_HANDLER backend/core/settings.py`
- [ ] Containers restarted: `docker-compose ps` shows all running
- [ ] Backend logs clean: `docker-compose logs backend | grep -i error` (should be minimal)
- [ ] Test 1 passed: Large file shows clear error
- [ ] Test 2 passed: Valid file uploads work
- [ ] Test 3 passed: Company posting works
- [ ] Test 4 passed: Network responses are JSON

## Rollback (If Needed)

```bash
# 1. Revert to previous version
git revert HEAD

# 2. Restart containers
docker-compose restart backend frontend

# 3. Verify working
docker-compose ps
```

## Troubleshooting

### Issue: Still Seeing "Unexpected token" Errors

**Cause**: Browser cache or old code  
**Fix**:
```bash
# Hard refresh browser
Ctrl+Shift+R (Windows/Linux)
Cmd+Shift+R (Mac)

# Or clear cache
DevTools > Application > Storage > Clear site data
```

### Issue: Container Won't Start

**Cause**: Python syntax error in new files  
**Fix**:
```bash
# Check logs
docker-compose logs backend

# Validate syntax
python3 -m py_compile backend/core/exception_handler.py

# If error, check exception handler for typos
cat backend/core/exception_handler.py
```

### Issue: File Upload Still Returns HTML

**Cause**: Exception handler not registered  
**Fix**:
```bash
# Verify in settings
grep -A 10 "REST_FRAMEWORK = {" backend/core/settings.py

# Should show:
# 'EXCEPTION_HANDLER': 'core.exception_handler.custom_exception_handler',
```

## Performance Impact

- ✅ **No negative impact** - Exception handler only runs on errors
- ✅ **Slight improvement** - Less JSON parsing errors on frontend
- ✅ **Better debugging** - All errors logged consistently

## Security Impact

- ✅ **No exposure of sensitive data** - Stack traces not sent to frontend
- ✅ **DoS prevention** - File size limits prevent large uploads
- ✅ **Information consistency** - All errors return JSON format

## Support

If you encounter issues:

1. Check the ERROR_HANDLING_FIX_REPORT.md for detailed information
2. Review browser DevTools Network tab
3. Check Docker logs: `docker-compose logs backend`
4. Verify settings: `grep -i upload backend/core/settings.py`

## Next Steps (Optional Improvements)

1. Add file type validation on frontend before upload
2. Implement progress bar for large uploads
3. Add retry logic for transient errors
4. Localize error messages for different languages

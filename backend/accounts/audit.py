import hashlib
import json
from datetime import datetime
from django.db import transaction

def create_audit_log(action: str, user, details: dict = None):
    from .models import AuditLog
    with transaction.atomic():
        last = AuditLog.objects.select_for_update().order_by('-id').first()
        prev_hash = last.current_hash if last else "0" * 64
        
        timestamp = datetime.utcnow().isoformat()
        payload = json.dumps({
            "action": action,
            "user": str(user),
            "timestamp": timestamp,
            "details": details or {},
            "prev_hash": prev_hash,
        }, sort_keys=True)
        
        current_hash = hashlib.sha256(payload.encode()).hexdigest()
        
        AuditLog.objects.create(
            action=action,
            user=user,
            details=json.dumps(details or {}),
            timestamp=timestamp,
            prev_hash=prev_hash,
            current_hash=current_hash,
        )
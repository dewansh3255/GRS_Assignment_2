
import pyotp
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver


class User(AbstractUser):
    class Roles(models.TextChoices):
        ADMIN = 'ADMIN', 'Admin'
        RECRUITER = 'RECRUITER', 'Recruiter'
        CANDIDATE = 'CANDIDATE', 'Candidate'

    role = models.CharField(
        max_length=20, choices=Roles.choices, default=Roles.CANDIDATE)
    phone_number = models.CharField(
        max_length=15, unique=True, null=True, blank=True)
    is_verified = models.BooleanField(default=False)  # For OTP verification

    # --- ADDED FOR TOTP AUTHENTICATOR ---
    totp_secret = models.CharField(max_length=32, blank=True, null=True)
    
    # NEW: Safe addition for Email Verification (Member 3)
    is_email_verified = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        # Automatically generate a unique secret for every new user
        if not self.totp_secret:
            self.totp_secret = pyotp.random_base32()
        super().save(*args, **kwargs)
    # ------------------------------------

    def __str__(self):
        return self.username


class UserKeys(models.Model):
    """
    MEMBER B: UserKeys Model
    Stores the user's RSA Public Key and Encrypted Private Key.
    """
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='keys')
    public_key = models.TextField(help_text="RSA Public Key (SPKI format)")
    encrypted_private_key = models.TextField(
        help_text="AES Encrypted Private Key")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Keys for {self.user.username}"


class Profile(models.Model):
    """
    MEMBER A: User Profile with Field-Level Privacy
    """
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='profile')
    
    # Standard Profile Data
    headline = models.CharField(max_length=150, blank=True)
    bio = models.TextField(blank=True)
    location = models.CharField(max_length=100, blank=True)
    skills = models.TextField(blank=True, help_text="Comma separated skills")
    
    # NEW: Safe additions for Member 1 (Social)
    education = models.TextField(blank=True)
    experience = models.TextField(blank=True)
    profile_picture = models.ImageField(upload_to='profiles/', blank=True, null=True)
    
    # Privacy Flags (True = Public, False = Connections Only / Private)
    is_headline_public = models.BooleanField(default=True)
    is_bio_public = models.BooleanField(default=True)
    is_location_public = models.BooleanField(default=True)
    is_skills_public = models.BooleanField(default=True)
    
    
    # NEW: Safe privacy flags for Member 1 (Social)
    is_education_public = models.BooleanField(default=True)
    is_experience_public = models.BooleanField(default=True)
    is_view_history_public = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.user.username}'s Profile"
    
class Message(models.Model):
    """
    MEMBER B: End-to-End Encrypted Message Model
    """
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.CASCADE, 
        related_name='sent_messages'
    )
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.CASCADE, 
        related_name='received_messages'
    )
    
    encrypted_content = models.TextField(help_text="Message encrypted with AES-GCM")
    encrypted_key = models.TextField(help_text="AES key encrypted with Recipient's RSA Public Key")
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Secure message from {self.sender.username} to {self.recipient.username} at {self.timestamp}"
    
class AuditLog(models.Model):
    action = models.CharField(max_length=100)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True
    )
    details = models.TextField(blank=True)
    timestamp = models.CharField(max_length=50)
    prev_hash = models.CharField(max_length=64)
    current_hash = models.CharField(max_length=64)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f"[{self.timestamp}] {self.action} by {self.user}"
    
class ChatGroup(models.Model):
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

class GroupMember(models.Model):
    ROLE_CHOICES = (
        ('owner', 'Owner'),
        ('admin', 'Admin'),
        ('member', 'Member'),
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.CASCADE, 
        related_name='group_memberships'
    )
    group = models.ForeignKey(
        ChatGroup, 
        on_delete=models.CASCADE, 
        related_name='members'
    )
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='member')
    encrypted_group_key = models.TextField(help_text="AES key encrypted with User's RSA Public Key")
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'group')

    def __str__(self):
        return f"{self.user.username} - {self.group.name} ({self.role})"

class GroupMessage(models.Model):
    group = models.ForeignKey(
        ChatGroup, 
        on_delete=models.CASCADE, 
        related_name='messages'
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.CASCADE, 
        related_name='sent_group_messages'
    )
    encrypted_content = models.TextField(help_text="Message encrypted with Shared Group AES Key")
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Group message in {self.group.name} from {self.sender.username}"


# =========================================================
# --- NEW MODELS FOR REMAINING FEATURES ---
# =========================================================

# --- MEMBER 1: SOCIAL MODELS ---
class Connection(models.Model):
    STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('ACCEPTED', 'Accepted'),
        ('REJECTED', 'Rejected'),
    )
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='sent_connections', on_delete=models.CASCADE)
    receiver = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='received_connections', on_delete=models.CASCADE)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='PENDING')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('sender', 'receiver')

class Post(models.Model):
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='feed_posts')
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

class ProfileView(models.Model):
    viewer = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='profile_views_made', on_delete=models.CASCADE)
    viewed_user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='profile_views_received', on_delete=models.CASCADE)
    timestamp = models.DateTimeField(auto_now_add=True)


class Notification(models.Model):
    """
    MEMBER 1: In-app notifications for social activity.
    """
    TYPE_CHOICES = [
        ('CONNECTION_REQUEST', 'Connection Request'),
        ('CONNECTION_ACCEPTED', 'Connection Accepted'),
        ('NEW_POST', 'New Post from Connection'),
    ]
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications')
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='sent_notifications')
    notif_type = models.CharField(max_length=30, choices=TYPE_CHOICES)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    # For CONNECTION_REQUEST: the Connection.id so the recipient can accept/reject inline
    related_connection_id = models.IntegerField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Notif({self.notif_type}) → {self.recipient.username}"


# --- MEMBER 3: SECURITY MODELS ---
class BackupCode(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='backup_codes')
    code_hash = models.CharField(max_length=128) 
    is_used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)


# --- MEMBER 4: ADMIN MODELS ---
class Report(models.Model):
    reporter = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='reports_submitted', on_delete=models.CASCADE)
    reported_user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='reports_targeted_at', on_delete=models.CASCADE, null=True, blank=True)
    reported_post = models.ForeignKey(Post, on_delete=models.CASCADE, null=True, blank=True)
    reason = models.TextField()
    is_resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)


# --- SIGNALS ---
@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        Profile.objects.create(user=instance)

@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def save_user_profile(sender, instance, **kwargs):
    Profile.objects.get_or_create(user=instance)
    instance.profile.save()
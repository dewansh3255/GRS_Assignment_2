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
    # Use settings.AUTH_USER_MODEL to correctly reference your custom User
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='keys')
    public_key = models.TextField(help_text="RSA Public Key (SPKI format)")
    encrypted_private_key = models.TextField(
        help_text="AES Encrypted Private Key")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Keys for {self.user.username}"

# accounts/models.py


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
    
    # Privacy Flags (True = Public, False = Connections Only / Private)
    is_headline_public = models.BooleanField(default=True)
    is_bio_public = models.BooleanField(default=True)
    is_location_public = models.BooleanField(default=True)
    is_skills_public = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.user.username}'s Profile"
    
class Message(models.Model):
    """
    MEMBER B: End-to-End Encrypted Message Model
    The server stores the encrypted content and the encrypted AES key, 
    but can NEVER read the actual plaintext.
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
    
    # The actual message text, encrypted symmetrically with an AES-GCM key
    encrypted_content = models.TextField(help_text="Message encrypted with AES-GCM")
    
    # The AES-GCM key itself, encrypted asymmetrically with the RECIPIENT'S RSA Public Key
    encrypted_key = models.TextField(help_text="AES key encrypted with Recipient's RSA Public Key")
    
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Secure message from {self.sender.username} to {self.recipient.username} at {self.timestamp}"
    

@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        Profile.objects.create(user=instance)

@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def save_user_profile(sender, instance, **kwargs):
    # Safely get or create the profile before saving to prevent crashes
    Profile.objects.get_or_create(user=instance)
    instance.profile.save()
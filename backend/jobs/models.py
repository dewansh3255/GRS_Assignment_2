# import os

# from django.db import models
# from django.conf import settings
# from django.core.files.base import ContentFile

# from cryptography.fernet import Fernet


# class Resume(models.Model):
#     user = models.ForeignKey(
#         settings.AUTH_USER_MODEL,
#         on_delete=models.CASCADE,
#         related_name='resumes'
#     )
#     # recruiters who are allowed to download this resume
#     authorized_recruiters = models.ManyToManyField(
#         settings.AUTH_USER_MODEL,
#         related_name='authorized_resumes',
#         blank=True,
#     )
#     file = models.FileField(upload_to='resumes/')
#     is_encrypted = models.BooleanField(default=False)
#     uploaded_at = models.DateTimeField(auto_now_add=True)
    
#     digital_signature = models.TextField(
#         blank=True, 
#         null=True, 
#         help_text="RSA-PSS signature of the file's SHA-256 hash"
#     )

#     def save(self, *args, **kwargs):
#         # if instance is new, persist it first so we have a PK for related models
#         is_new = self.pk is None
#         if is_new:
#             super().save(*args, **kwargs)

#         # encrypt uploaded file on first save (or first post-new-save)
#         if self.file and not self.is_encrypted:
#             # ensure file pointer at beginning
#             try:
#                 self.file.open('rb')
#             except Exception:
#                 pass
#             self.file.seek(0)
#             raw_data = self.file.read()

#             # generate a new Fernet key and encrypt
#             key = Fernet.generate_key()
#             f = Fernet(key)
#             encrypted_data = f.encrypt(raw_data)

#             old_file_path = self.file.path

#             # replace file content with encrypted version
#             filename = os.path.basename(self.file.name)
#             enc_name = f"{filename}.enc"
#             self.file.save(enc_name, ContentFile(encrypted_data), save=False)
#             self.is_encrypted = True

#             if os.path.exists(old_file_path):
#                 os.remove(old_file_path)

#             # record the key in associated ResumeKey
#             # at this point self.pk is guaranteed to exist
#             ResumeKey.objects.update_or_create(
#                 resume=self,
#                 defaults={"key": key.decode()}
#             )

#             # clear force_insert to avoid duplicate PK on second save
#             kwargs.pop('force_insert', None)
#             super().save(*args, **kwargs)
#         elif not is_new:
#             # regular save when nothing special changes
#             kwargs.pop('force_insert', None)
#             super().save(*args, **kwargs)


# class ResumeKey(models.Model):
#     resume = models.OneToOneField(
#         Resume,
#         on_delete=models.CASCADE,
#         related_name='resume_key'
#     )
#     key = models.CharField(
#         max_length=200,
#         help_text="Fernet symmetric key — in production this should be wrapped with an admin public key"
#     )
#     created_at = models.DateTimeField(auto_now_add=True)

#     def __str__(self):
#         return f"Key for resume {self.resume.pk}"

# class Company(models.Model):
#     owner = models.ForeignKey(
#         settings.AUTH_USER_MODEL,
#         on_delete=models.CASCADE,
#         related_name='companies'
#     )
#     name = models.CharField(max_length=200)
#     description = models.TextField(blank=True)
#     location = models.CharField(max_length=200, blank=True)
#     website = models.URLField(blank=True)
#     created_at = models.DateTimeField(auto_now_add=True)

#     def __str__(self):
#         return self.name


# class Job(models.Model):
#     class JobType(models.TextChoices):
#         FULL_TIME = 'FULL_TIME', 'Full Time'
#         INTERNSHIP = 'INTERNSHIP', 'Internship'
#         REMOTE = 'REMOTE', 'Remote'

#     company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='jobs')
#     title = models.CharField(max_length=200)
#     description = models.TextField()
#     required_skills = models.TextField(blank=True, help_text="Comma separated")
#     location = models.CharField(max_length=200, blank=True)
#     job_type = models.CharField(max_length=20, choices=JobType.choices, default=JobType.FULL_TIME)
#     salary_min = models.IntegerField(null=True, blank=True)
#     salary_max = models.IntegerField(null=True, blank=True)
#     deadline = models.DateField(null=True, blank=True)
#     created_at = models.DateTimeField(auto_now_add=True)
#     is_active = models.BooleanField(default=True)

#     def __str__(self):
#         return f"{self.title} at {self.company.name}"


# class Application(models.Model):
#     class Status(models.TextChoices):
#         APPLIED = 'APPLIED', 'Applied'
#         REVIEWED = 'REVIEWED', 'Reviewed'
#         INTERVIEWED = 'INTERVIEWED', 'Interviewed'
#         REJECTED = 'REJECTED', 'Rejected'
#         OFFER = 'OFFER', 'Offer'

#     applicant = models.ForeignKey(
#         settings.AUTH_USER_MODEL,
#         on_delete=models.CASCADE,
#         related_name='applications'
#     )
#     job = models.ForeignKey(Job, on_delete=models.CASCADE, related_name='applications')
#     resume = models.ForeignKey(Resume, on_delete=models.SET_NULL, null=True, blank=True)
#     cover_note = models.TextField(blank=True)
#     status = models.CharField(max_length=20, choices=Status.choices, default=Status.APPLIED)
#     recruiter_notes = models.TextField(blank=True)
#     applied_at = models.DateTimeField(auto_now_add=True)
#     updated_at = models.DateTimeField(auto_now=True)

#     class Meta:
#         unique_together = ('applicant', 'job')

#     def __str__(self):
#         return f"{self.applicant.username} → {self.job.title}"

import os
import base64
import hashlib
from django.db import models
from django.conf import settings
from django.core.files.base import ContentFile
from cryptography.fernet import Fernet

def get_master_fernet():
    """Derives a deterministic Master Fernet key from the site's SECRET_KEY"""
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
    return Fernet(key)

class Resume(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='resumes'
    )
    authorized_recruiters = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name='authorized_resumes',
        blank=True,
    )
    file = models.FileField(upload_to='resumes/')
    is_encrypted = models.BooleanField(default=False)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    
    digital_signature = models.TextField(
        blank=True, 
        null=True, 
        help_text="RSA-PSS signature of the file's SHA-256 hash"
    )

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        if is_new:
            super().save(*args, **kwargs)

        if self.file and not self.is_encrypted:
            try:
                self.file.open('rb')
            except Exception:
                pass
            self.file.seek(0)
            raw_data = self.file.read()

            key = Fernet.generate_key()
            f = Fernet(key)
            encrypted_data = f.encrypt(raw_data)

            old_file_path = self.file.path
            filename = os.path.basename(self.file.name)
            enc_name = f"{filename}.enc"
            self.file.save(enc_name, ContentFile(encrypted_data), save=False)
            self.is_encrypted = True

            if os.path.exists(old_file_path):
                os.remove(old_file_path)

            encrypted_key = get_master_fernet().encrypt(key).decode()

            ResumeKey.objects.update_or_create(
                resume=self,
                defaults={"key": encrypted_key}
            )

            kwargs.pop('force_insert', None)
            super().save(*args, **kwargs)
        elif not is_new:
            kwargs.pop('force_insert', None)
            super().save(*args, **kwargs)


class ResumeKey(models.Model):
    resume = models.OneToOneField(
        Resume,
        on_delete=models.CASCADE,
        related_name='resume_key'
    )
    key = models.CharField(
        max_length=200,
        help_text="Fernet symmetric key"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Key for resume {self.resume.pk}"


class Company(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='companies'
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    location = models.CharField(max_length=200, blank=True)
    website = models.URLField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    # NEW: Safe addition for Member 2 (Corporate)
    employees = models.ManyToManyField(
        settings.AUTH_USER_MODEL, 
        related_name='companies_employed_at', 
        blank=True
    )

    def __str__(self):
        return self.name


class Job(models.Model):
    class JobType(models.TextChoices):
        FULL_TIME = 'FULL_TIME', 'Full Time'
        INTERNSHIP = 'INTERNSHIP', 'Internship'
        REMOTE = 'REMOTE', 'Remote'

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='jobs')
    title = models.CharField(max_length=200)
    description = models.TextField()
    required_skills = models.TextField(blank=True, help_text="Comma separated")
    location = models.CharField(max_length=200, blank=True)
    job_type = models.CharField(max_length=20, choices=JobType.choices, default=JobType.FULL_TIME)
    salary_min = models.IntegerField(null=True, blank=True)
    salary_max = models.IntegerField(null=True, blank=True)
    deadline = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.title} at {self.company.name}"


class Application(models.Model):
    class Status(models.TextChoices):
        APPLIED = 'APPLIED', 'Applied'
        REVIEWED = 'REVIEWED', 'Reviewed'
        INTERVIEWED = 'INTERVIEWED', 'Interviewed'
        REJECTED = 'REJECTED', 'Rejected'
        OFFER = 'OFFER', 'Offer'

    applicant = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='applications'
    )
    job = models.ForeignKey(Job, on_delete=models.CASCADE, related_name='applications')
    resume = models.ForeignKey(Resume, on_delete=models.SET_NULL, null=True, blank=True)
    cover_note = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.APPLIED)
    recruiter_notes = models.TextField(blank=True)
    applied_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('applicant', 'job')

    def __str__(self):
        return f"{self.applicant.username} → {self.job.title}"


# =========================================================
# --- NEW MODELS FOR REMAINING FEATURES ---
# =========================================================

# --- NEW MODEL FOR MEMBER 2 (CORPORATE) ---
class SystemAnnouncement(models.Model):
    encrypted_content = models.TextField() # Text is encrypted using Fernet
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
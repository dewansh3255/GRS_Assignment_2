import os

from django.db import models
from django.conf import settings
from django.core.files.base import ContentFile

from cryptography.fernet import Fernet


class Resume(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='resumes'
    )
    # recruiters who are allowed to download this resume
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
        # if instance is new, persist it first so we have a PK for related models
        is_new = self.pk is None
        if is_new:
            super().save(*args, **kwargs)

        # encrypt uploaded file on first save (or first post-new-save)
        if self.file and not self.is_encrypted:
            # ensure file pointer at beginning
            try:
                self.file.open('rb')
            except Exception:
                pass
            self.file.seek(0)
            raw_data = self.file.read()

            # generate a new Fernet key and encrypt
            key = Fernet.generate_key()
            f = Fernet(key)
            encrypted_data = f.encrypt(raw_data)

            old_file_path = self.file.path

            # replace file content with encrypted version
            filename = os.path.basename(self.file.name)
            enc_name = f"{filename}.enc"
            self.file.save(enc_name, ContentFile(encrypted_data), save=False)
            self.is_encrypted = True

            if os.path.exists(old_file_path):
                os.remove(old_file_path)

            # record the key in associated ResumeKey
            # at this point self.pk is guaranteed to exist
            ResumeKey.objects.update_or_create(
                resume=self,
                defaults={"key": key.decode()}
            )

            # clear force_insert to avoid duplicate PK on second save
            kwargs.pop('force_insert', None)
            super().save(*args, **kwargs)
        elif not is_new:
            # regular save when nothing special changes
            kwargs.pop('force_insert', None)
            super().save(*args, **kwargs)


class ResumeKey(models.Model):
    resume = models.OneToOneField(
        Resume,
        on_delete=models.CASCADE,
        related_name='resume_key'
    )
    key = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Key for resume {self.resume.pk}"
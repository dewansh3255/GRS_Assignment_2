from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DefaultUserAdmin
from .models import User, UserKeys, Profile, Message

@admin.register(User)
class UserAdmin(DefaultUserAdmin):
    # What columns to show on the main list view
    list_display = ('username', 'email', 'first_name', 'last_name', 'role', 'is_verified', 'is_staff')
    
    # Adding filters to the right sidebar
    list_filter = DefaultUserAdmin.list_filter + ('role', 'is_verified')

    # Adding your custom fields to the user editing screen
    fieldsets = DefaultUserAdmin.fieldsets + (
        ('Custom Info', {'fields': ('role', 'phone_number', 'is_verified', 'totp_secret')}),
    )

@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    # What columns to show for Profiles
    list_display = ('user', 'headline', 'location', 'is_headline_public')
    search_fields = ('user__username', 'headline', 'location')
    list_filter = ('is_headline_public', 'is_bio_public', 'is_location_public', 'is_skills_public')

@admin.register(UserKeys)
class UserKeysAdmin(admin.ModelAdmin):
    # What columns to show for User Keys
    list_display = ('user', 'created_at')
    search_fields = ('user__username',)


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ('sender', 'recipient', 'timestamp')
    search_fields = ('sender__username', 'recipient__username')
    # Make the fields read-only in admin so even the superuser can't tamper with the ciphertext
    readonly_fields = ('sender', 'recipient', 'encrypted_content', 'encrypted_key', 'timestamp')
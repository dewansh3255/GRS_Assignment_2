from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

# Import all our custom views
from .views import (
    RegisterView, 
    CustomLoginView, 
    UploadKeysView, 
    GenerateTOTPURIView, 
    VerifyTOTPView,
    ProfileRetrieveUpdateView,
    AuthCheckView,
    GetPublicKeyView,
    MessageListCreateView,
    UserListView,
    GetMyKeysView,
    ChangeUserRoleView,
    AuditLogListView,
    GroupListCreateView,
    GroupDetailView, 
    GroupMemberManageView, 
    GroupMessageListCreateView
)

urlpatterns = [
    # Core Auth
    path('register/', RegisterView.as_view(), name='register'),
    path('login/', CustomLoginView.as_view(), name='login'), # Replaced the default JWT login
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    
    # TOTP & 2FA
    path('totp/generate/<int:user_id>/', GenerateTOTPURIView.as_view(), name='generate_totp'),
    path('totp/verify/', VerifyTOTPView.as_view(), name='verify_totp'),
    
    # E2EE Crypto
    path('keys/upload/', UploadKeysView.as_view(), name='upload_keys'),
    
    # Profiles
    path('profile/me/', ProfileRetrieveUpdateView.as_view(), name='my_profile'),
    path('profile/<str:username>/', ProfileRetrieveUpdateView.as_view(), name='user_profile'),
    # simple check endpoint for frontend auth guard
    path('auth-check/', AuthCheckView.as_view(), name='auth_check'),

    path('keys/upload/', UploadKeysView.as_view(), name='upload_keys'),
    path('keys/me/', GetMyKeysView.as_view(), name='my_keys'),
    path('keys/<str:username>/', GetPublicKeyView.as_view(), name='get_public_key'),
    path('messages/', MessageListCreateView.as_view(), name='messages'),
    path('users/', UserListView.as_view(), name='user_list'),
    
    path('role/change/', ChangeUserRoleView.as_view(), name='change_role'),

    path('audit-logs/', AuditLogListView.as_view(), name='audit_logs'),
    path('groups/', GroupListCreateView.as_view(), name='group-list-create'),
    path('groups/<int:group_id>/', GroupDetailView.as_view(), name='group-detail'),
    path('groups/<int:group_id>/members/', GroupMemberManageView.as_view(), name='group-add-member'),
    path('groups/<int:group_id>/members/<int:user_id>/', GroupMemberManageView.as_view(), name='group-manage-member'),
    
    # Phase 3: Group Messaging
    path('groups/<int:group_id>/messages/', GroupMessageListCreateView.as_view(), name='group-messages'),
    
]
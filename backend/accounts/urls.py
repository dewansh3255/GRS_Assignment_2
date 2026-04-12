from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    RegisterView,
    CustomLoginView,
    LogoutView,
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
    GroupMessageListCreateView,
    GroupKeyRotateView,
    # Member 1: Social
    UserSearchView,
    PublicProfileView,
    ConnectionListView,
    SendConnectionRequestView,
    ConnectionDetailView,
    FeedView,
    ProfileViewersView,
    # Member 1: Additional
    NotificationListView,
    MarkNotificationReadView,
    ConnectionSuggestionsView,
    ProfilePictureUploadView,
    NetworkGraphView,
    # Member 2: Account Security
    PasswordChangeView,
    AccountDeleteView,
    # Member 3: Backup Codes
    GenerateBackupCodesView,
    ListBackupCodesView,
    VerifyBackupCodeView,
    # Member 4: Admin Dashboard
    AdminUserListView,
    AdminUserSuspendView,
    AdminUserDeleteView,
    AdminPostListView,
    AdminPostDeleteView,
    CreateReportView,
    AdminReportListView,
    AdminReportResolveView,
    SendEmailOTPView,
    VerifyEmailOTPView
)

urlpatterns = [
    # Core Auth
    path('register/', RegisterView.as_view(), name='register'),
    path('login/', CustomLoginView.as_view(), name='login'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # TOTP & 2FA
    path('totp/generate/<int:user_id>/', GenerateTOTPURIView.as_view(), name='generate_totp'),
    path('totp/verify/', VerifyTOTPView.as_view(), name='verify_totp'),

    # E2EE Crypto Keys
    path('keys/upload/', UploadKeysView.as_view(), name='upload_keys'),
    path('keys/me/', GetMyKeysView.as_view(), name='my_keys'),
    path('keys/<str:username>/', GetPublicKeyView.as_view(), name='get_public_key'),

    # Profiles — specific paths BEFORE generic <username> catch-all
    path('profile/me/', ProfileRetrieveUpdateView.as_view(), name='my_profile'),
    path('profile/me/viewers/', ProfileViewersView.as_view(), name='profile_viewers'),
    path('profile/me/picture/', ProfilePictureUploadView.as_view(), name='profile_picture'),
    path('profile/<str:username>/public/', PublicProfileView.as_view(), name='public_profile'),
    path('profile/<str:username>/', ProfileRetrieveUpdateView.as_view(), name='user_profile'),

    # Auth check
    path('auth-check/', AuthCheckView.as_view(), name='auth_check'),

    # Messaging
    path('messages/', MessageListCreateView.as_view(), name='messages'),

    # Users list + search
    path('users/', UserListView.as_view(), name='user_list'),
    path('users/search/', UserSearchView.as_view(), name='user_search'),

    # Roles & Audit
    path('role/change/', ChangeUserRoleView.as_view(), name='change_role'),
    path('audit-logs/', AuditLogListView.as_view(), name='audit_logs'),

    # Group Chat
    path('groups/', GroupListCreateView.as_view(), name='group-list-create'),
    path('groups/<int:group_id>/', GroupDetailView.as_view(), name='group-detail'),
    path('groups/<int:group_id>/members/', GroupMemberManageView.as_view(), name='group-add-member'),
    path('groups/<int:group_id>/members/<int:user_id>/', GroupMemberManageView.as_view(), name='group-manage-member'),
    path('groups/<int:group_id>/rotate/', GroupKeyRotateView.as_view(), name='group-rotate-keys'),
    path('groups/<int:group_id>/messages/', GroupMessageListCreateView.as_view(), name='group-messages'),

    # Member 1: Social Feed — specific post DELETE before generic feed
    path('feed/<int:post_id>/', FeedView.as_view(), name='feed-post-delete'),
    path('feed/', FeedView.as_view(), name='feed'),

    # Member 1: Connections — specific before generic
    path('connections/suggestions/', ConnectionSuggestionsView.as_view(), name='connection_suggestions'),
    path('connections/graph/', NetworkGraphView.as_view(), name='connection_graph'),
    path('connections/send/<str:username>/', SendConnectionRequestView.as_view(), name='send_connection'),
    path('connections/<int:pk>/', ConnectionDetailView.as_view(), name='connection_detail'),
    path('connections/', ConnectionListView.as_view(), name='connections'),

    # Member 1: Notifications
    path('notifications/', NotificationListView.as_view(), name='notifications'),
    path('notifications/read-all/', MarkNotificationReadView.as_view(), name='notifications_read_all'),
    path('notifications/<int:pk>/read/', MarkNotificationReadView.as_view(), name='notification_read'),

    # Member 2: Account Security (High-Risk Actions with TOTP)
    path('account/password-change/', PasswordChangeView.as_view(), name='password_change'),
    path('account/delete/', AccountDeleteView.as_view(), name='account_delete'),

    # Member 3: Backup Codes (2FA Recovery)
    path('backup-codes/', ListBackupCodesView.as_view(), name='backup_codes_list'),
    path('backup-codes/generate/', GenerateBackupCodesView.as_view(), name='backup_codes_generate'),
    path('backup-codes/verify/', VerifyBackupCodeView.as_view(), name='backup_codes_verify'),

    # Member 4: Admin Dashboard
    path('admin/users/', AdminUserListView.as_view(), name='admin_users'),
    path('admin/users/<int:user_id>/suspend/', AdminUserSuspendView.as_view(), name='admin_user_suspend'),
    path('admin/users/<int:user_id>/delete/', AdminUserDeleteView.as_view(), name='admin_user_delete'),
    path('admin/posts/', AdminPostListView.as_view(), name='admin_posts'),
    path('admin/posts/<int:post_id>/', AdminPostDeleteView.as_view(), name='admin_post_delete'),
    path('reports/', CreateReportView.as_view(), name='create_report'),
    path('admin/reports/', AdminReportListView.as_view(), name='admin_reports'),
    path('admin/reports/<int:report_id>/', AdminReportResolveView.as_view(), name='admin_report_resolve'),

    path('email/send-otp/', SendEmailOTPView.as_view(), name='send-email-otp'),
    path('email/verify-otp/', VerifyEmailOTPView.as_view(), name='verify-email-otp'),
]
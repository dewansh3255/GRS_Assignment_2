// src/services/api.ts

export const API_BASE_URL = ""; // Base URL for Django API

export const uploadKeys = async (publicKey: string, encryptedPrivateKey: string) => {
  try {
    // FIXED URL: Matches your Django structure 'api/auth/keys/upload/'
    const response = await fetch(`${API_BASE_URL}/api/auth/keys/upload/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        public_key: publicKey,
        encrypted_private_key: encryptedPrivateKey,
      }),
    });

    if (!response.ok) {
      // Helper to debug HTML (404/500) errors
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("text/html")) {
        const text = await response.text();
        console.error("Server Error HTML:", text); // Check console if this happens
        throw new Error("Server returned HTML (404 Not Found or 500 Error). Check URL path.");
      }

      const errorData = await response.json();
      throw new Error(errorData.detail || "Failed to upload keys");
    }

    return await response.json();
  } catch (error) {
    console.error("API Error:", error);
    throw error;
  }
};

export const registerUser = async (userData: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/register/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(userData),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.username?.[0] || errorData.email?.[0] || "Registration failed");
    }
    return await response.json();
  } catch (error) {
    console.error("Register Error:", error);
    throw error;
  }
};

export const loginUser = async (credentials: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(credentials),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Login failed");
    }
    return await response.json();
  } catch (error) {
    console.error("Login Error:", error);
    throw error;
  }
};

// Also update getTOTPSetupURI to accept a userId:
export const getTOTPSetupURI = async (userId: number) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/totp/generate/${userId}/`, {
      method: "GET",
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to fetch TOTP URI");
    return await response.json();
  } catch (error) {
    console.error("API Error:", error);
    throw error;
  }
};

// Update verifyTOTPCode to accept userId and code:
export const verifyTOTPCode = async (userId: number, code: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/totp/verify/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ user_id: userId, code }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Verification failed");
    }
    return await response.json();
  } catch (error) {
    console.error("API Error:", error);
    throw error;
  }
};

// -------- Resume helpers --------
// export const uploadResume = async (file: File) => {
//   const form = new FormData();
//   form.append('file', file);
//   const response = await fetch(`${API_BASE_URL}/api/jobs/resume/upload/`, {
//     method: 'POST',
//     credentials: 'include',
//     body: form,
//   });
//   if (!response.ok) {
//     const err = await response.json();
//     throw new Error(err.detail || 'Upload failed');
//   }
//   return await response.json();
// };

// export const listResumes = async () => {
//   const response = await fetch(`${API_BASE_URL}/api/jobs/resume/`, {
//     method: 'GET',
//     credentials: 'include',
//   });
//   if (!response.ok) {
//     throw new Error('Failed to retrieve resumes');
//   }
//   return await response.json();
// };

// export const downloadResumeUrl = (id: number) =>
//   `${API_BASE_URL}/api/jobs/resume/${id}/download/`;

// export const deleteResume = async (id: number) => {
//   const response = await fetch(`${API_BASE_URL}/api/jobs/resume/${id}/`, {
//     method: 'DELETE',
//     credentials: 'include',
//   });
//   if (!response.ok) {
//     const err = await response.text();
//     throw new Error(err || 'Delete failed');
//   }
//   return true;
// };

// --- PROFILE API ---
// export const updateMyProfile = async (profileData: any) => {
//   const response = await fetch(`${API_BASE_URL}/api/auth/profile/me/`, {
//     method: "PATCH", // PATCH allows partial updates
//     headers: { "Content-Type": "application/json" },
//     credentials: "include",
//     body: JSON.stringify(profileData),
//   });
//   if (!response.ok) throw new Error("Failed to update profile");
//   return await response.json();
// };

// --- RESUME APIs ---
// Assuming your jobs urls are mounted at /api/jobs/ in backend/core/urls.py
export const getMyResumes = async () => {
  const response = await fetch(`${API_BASE_URL}/api/jobs/resume/`, {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to fetch resumes");
  return await response.json();
};

// Replace your existing uploadResume function with this:
export const uploadResume = async (file: File, digitalSignature: string) => {
  const formData = new FormData();
  formData.append('file', file);
  // send sigrnature as part of form data to backend for verification
  formData.append('digital_signature', digitalSignature);

  const response = await fetch(`${API_BASE_URL}/api/jobs/resume/upload/`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });
  
  // If the backend returns a 400 error, try to extract the message
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.detail || errorData?.error || 'Upload failed');
  }
  return response.json();
};

export const deleteResume = async (id: number) => {
  const response = await fetch(`${API_BASE_URL}/api/jobs/resume/${id}/`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to delete resume");
};

// Helper to trigger browser download
// --- Helper to trigger browser download ---
export const downloadResumeUrl = (id: number) => {
  return `${API_BASE_URL}/api/jobs/resume/${id}/download/`;
};

// --- PROFILE APIs (Missing from your file) ---

export const getMyProfile = async () => {
  const response = await fetch(`${API_BASE_URL}/api/auth/profile/me/`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error("Unauthorized");
    throw new Error("Failed to fetch profile");
  }
  return await response.json();
};

export const updateMyProfile = async (profileData: any) => {
  const response = await fetch(`${API_BASE_URL}/api/auth/profile/me/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(profileData),
  });

  if (!response.ok) throw new Error("Failed to update profile");
  return await response.json();
};

// --- E2EE CHAT API CALLS ---

// 1. Get the list of available users to chat with
export const getUsersList = async () => {
  const response = await fetch(`${API_BASE_URL}/api/auth/users/`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch users');
  return response.json();
};

// 2. Fetch a specific user's RSA Public Key
export const getPublicKey = async (username: string) => {
  const response = await fetch(`${API_BASE_URL}/api/auth/keys/${username}/`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch public key');
  return response.json();
};

// 3. Send an encrypted message
export const sendEncryptedMessage = async (recipientId: number, encryptedContent: string, encryptedKey: string) => {
  const response = await fetch(`${API_BASE_URL}/api/auth/messages/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      recipient: recipientId,
      encrypted_content: encryptedContent,
      encrypted_key: encryptedKey,
    }),
  });
  if (!response.ok) throw new Error('Failed to send message');
  return response.json();
};

// 4. Fetch your encrypted inbox
export const getMessages = async () => {
  const response = await fetch(`${API_BASE_URL}/api/auth/messages/`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch messages');
  return response.json();
};

export const getMyKeys = async () => {
  const response = await fetch(`${API_BASE_URL}/api/auth/keys/me/`, { credentials: 'include' });
  if (!response.ok) throw new Error('Failed to fetch your keys');
  return response.json();
};

// --- JOBS API ---
export const getJobs = async (params?: { q?: string; job_type?: string; location?: string }) => {
  const query = new URLSearchParams();
  if (params?.q) query.append('q', params.q);
  if (params?.job_type) query.append('job_type', params.job_type);
  if (params?.location) query.append('location', params.location);
  const response = await fetch(`${API_BASE_URL}/api/jobs/jobs/?${query.toString()}`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch jobs');
  return response.json();
};

export const getJob = async (id: number) => {
  const response = await fetch(`${API_BASE_URL}/api/jobs/jobs/${id}/`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch job');
  return response.json();
};

export const createJob = async (data: any) => {
  const response = await fetch(`${API_BASE_URL}/api/jobs/jobs/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create job');
  return response.json();
};

export const updateJob = async (id: number, data: any) => {
  const response = await fetch(`${API_BASE_URL}/api/jobs/jobs/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to update job');
  return response.json();
};

export const deleteJob = async (id: number) => {
  const response = await fetch(`${API_BASE_URL}/api/jobs/jobs/${id}/`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to delete job');
};

// --- COMPANIES API ---
export const getCompanies = async () => {
  const response = await fetch(`${API_BASE_URL}/api/jobs/companies/`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch companies');
  return response.json();
};

export const createCompany = async (data: any) => {
  const response = await fetch(`${API_BASE_URL}/api/jobs/companies/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create company');
  return response.json();
};

export const updateCompany = async (id: number, data: any) => {
  const response = await fetch(`${API_BASE_URL}/api/jobs/companies/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to update company');
  return response.json();
};

// --- APPLICATIONS API ---
export const getApplications = async () => {
  const response = await fetch(`${API_BASE_URL}/api/jobs/applications/`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch applications');
  return response.json();
};

export const applyToJob = async (jobId: number, resumeId: number | null, coverNote: string) => {
  const response = await fetch(`${API_BASE_URL}/api/jobs/applications/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ job: jobId, resume: resumeId, cover_note: coverNote }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error(err?.non_field_errors?.[0] || err?.detail || 'Failed to apply');
  }
  return response.json();
};

export const updateApplicationStatus = async (id: number, status: string, recruiterNotes?: string) => {
  const response = await fetch(`${API_BASE_URL}/api/jobs/applications/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ status, recruiter_notes: recruiterNotes }),
  });
  if (!response.ok) throw new Error('Failed to update application');
  return response.json();
};

export const downloadApplicationResume = (applicationId: number) => 
  `${API_BASE_URL}/api/jobs/applications/${applicationId}/resume/`;

export const getJobApplicationResume = async (applicationId: number) => {
  const response = await fetch(`${API_BASE_URL}/api/jobs/applications/${applicationId}/resume/`, {
    credentials: 'include',
  });
  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error(err?.detail || 'Failed to fetch resume');
  }
  return response.blob();
};

// --- AUDIT LOG API ---
export const getAuditLogs = async () => {
  const response = await fetch(`${API_BASE_URL}/api/auth/audit-logs/`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch audit logs');
  return response.json();
};

// --- USER ROLE API ---
export const changeUserRole = async (newRole: 'CANDIDATE' | 'RECRUITER') => {
  const response = await fetch(`${API_BASE_URL}/api/auth/role/change/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ role: newRole }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error(err?.error || err?.message || 'Failed to change role');
  }
  return response.json();
};

// --- GROUP CHAT APIs ---

export const getMyGroups = async () => {
  const response = await fetch(`${API_BASE_URL}/api/auth/groups/`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch groups');
  return response.json();
};

export const createGroup = async (name: string, members: {user_id: number, encrypted_key: string}[]) => {
  const response = await fetch(`${API_BASE_URL}/api/auth/groups/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ name, members }),
  });
  if (!response.ok) throw new Error('Failed to create group');
  return response.json();
};

export const fetchGroupMessages = async (groupId: number) => {
  const response = await fetch(`${API_BASE_URL}/api/auth/groups/${groupId}/messages/`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch group messages');
  return response.json();
};

export const sendGroupMessage = async (groupId: number, encryptedContent: string) => {
  const response = await fetch(`${API_BASE_URL}/api/auth/groups/${groupId}/messages/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ encrypted_content: encryptedContent }),
  });
  if (!response.ok) throw new Error('Failed to send group message');
  return response.json();
};

// --- GROUP MANAGEMENT APIs ---

export const addGroupMember = async (groupId: number, userId: number, encryptedKey: string) => {
  const response = await fetch(`${API_BASE_URL}/api/auth/groups/${groupId}/members/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ user_id: userId, encrypted_key: encryptedKey }),
  });
  if (!response.ok) throw new Error('Failed to add member');
  return response.json();
};

export const removeGroupMember = async (groupId: number, userId: number) => {
  const response = await fetch(`${API_BASE_URL}/api/auth/groups/${groupId}/members/${userId}/`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to remove member');
  return true;
};

export const promoteGroupMember = async (groupId: number, userId: number) => {
  const response = await fetch(`${API_BASE_URL}/api/auth/groups/${groupId}/members/${userId}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to promote member');
  return response.json();
};

export const deleteGroup = async (groupId: number) => {
  const response = await fetch(`${API_BASE_URL}/api/auth/groups/${groupId}/`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to delete group');
  return true;
};


// =====================================================
// MEMBER 1: SOCIAL NETWORK APIs
// =====================================================

/** Search users by username or headline (min 2 chars) */
export const searchUsers = async (q: string) => {
  const response = await fetch(`${API_BASE_URL}/api/auth/users/search/?q=${encodeURIComponent(q)}`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to search users');
  return response.json();
};

/** Fetch any user's public profile (privacy-filtered by backend) */
export const getPublicProfile = async (username: string) => {
  const response = await fetch(`${API_BASE_URL}/api/auth/profile/${username}/public/`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Profile not found');
  return response.json();
};

/** Get my connections + pending requests */
export const getMyConnections = async () => {
  const response = await fetch(`${API_BASE_URL}/api/auth/connections/`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch connections');
  return response.json();
};

/** Send a connection request to a user */
export const sendConnectionRequest = async (username: string) => {
  const response = await fetch(`${API_BASE_URL}/api/auth/connections/send/${username}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error(err?.error || 'Failed to send request');
  }
  return response.json();
};

/** Accept or reject a pending connection request */
export const respondToConnection = async (connectionId: number, action: 'ACCEPT' | 'REJECT') => {
  const response = await fetch(`${API_BASE_URL}/api/auth/connections/${connectionId}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ action }),
  });
  if (!response.ok) throw new Error('Failed to respond to connection');
  return response.json();
};

/** Remove an accepted connection */
export const removeConnection = async (connectionId: number) => {
  const response = await fetch(`${API_BASE_URL}/api/auth/connections/${connectionId}/`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to remove connection');
  return true;
};

/** Get the social feed (posts from connections + own) */
export const getFeed = async () => {
  const response = await fetch(`${API_BASE_URL}/api/auth/feed/`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch feed');
  return response.json();
};

/** Create a new post */
export const createPost = async (content: string) => {
  const response = await fetch(`${API_BASE_URL}/api/auth/feed/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ content }),
  });
  if (!response.ok) throw new Error('Failed to create post');
  return response.json();
};

/** Get who recently viewed my profile */
export const getMyProfileViewers = async () => {
  const response = await fetch(`${API_BASE_URL}/api/auth/profile/me/viewers/`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch viewers');
  return response.json();
};

/** Get notifications + unread count (polls every 15s in Navbar) */
export const getNotifications = async () => {
  const response = await fetch(`${API_BASE_URL}/api/auth/notifications/`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch notifications');
  return response.json();
};

/** Mark a single notification as read */
export const markNotificationRead = async (id: number) => {
  await fetch(`${API_BASE_URL}/api/auth/notifications/${id}/read/`, {
    method: 'POST',
    credentials: 'include',
  });
};

/** Mark all notifications as read */
export const markAllNotificationsRead = async () => {
  await fetch(`${API_BASE_URL}/api/auth/notifications/read-all/`, {
    method: 'POST',
    credentials: 'include',
  });
};

/** Get 2nd-degree connection suggestions (BFS, sorted by mutual count) */
export const getConnectionSuggestions = async () => {
  const response = await fetch(`${API_BASE_URL}/api/auth/connections/suggestions/`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch suggestions');
  return response.json();
};

/** Get raw graph data: nodes + edges for the network visualisation */
export const getNetworkGraph = async () => {
  const response = await fetch(`${API_BASE_URL}/api/auth/connections/graph/`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch graph');
  return response.json();
};

/** Upload or replace profile picture (multipart) */
export const uploadProfilePicture = async (file: File) => {
  const form = new FormData();
  form.append('picture', file);
  const response = await fetch(`${API_BASE_URL}/api/auth/profile/me/picture/`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error(err?.error || 'Failed to upload picture');
  }
  return response.json();
};
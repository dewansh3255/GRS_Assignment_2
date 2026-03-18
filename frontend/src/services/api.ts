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
  formData.append('digital_signature', digitalSignature); // <-- Send signature to backend

  const response = await fetch(`${API_BASE_URL}api/jobs/resume/upload/`, {
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

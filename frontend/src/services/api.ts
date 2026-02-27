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
export const uploadResume = async (file: File) => {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(`${API_BASE_URL}/api/jobs/resume/upload/`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.detail || 'Upload failed');
  }
  return await response.json();
};

export const listResumes = async () => {
  const response = await fetch(`${API_BASE_URL}/api/jobs/resume/`, {
    method: 'GET',
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to retrieve resumes');
  }
  return await response.json();
};

export const downloadResumeUrl = (id: number) =>
  `${API_BASE_URL}/api/jobs/resume/${id}/download/`;

export const deleteResume = async (id: number) => {
  const response = await fetch(`${API_BASE_URL}/api/jobs/resume/${id}/`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(err || 'Delete failed');
  }
  return true;
};

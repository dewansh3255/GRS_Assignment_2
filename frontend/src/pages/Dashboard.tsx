import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  getMyProfile, updateMyProfile, 
  uploadResume, getMyResumes, downloadResumeUrl, deleteResume, getMyKeys
} from '../services/api';
import { unwrapSigningKey, signFileDocument } from '../utils/crypto';
import ChatWidget from '../components/ChatWidget';

interface Resume {
  id: number;
  file: string;
  is_encrypted: boolean;
  uploaded_at: string;
  digital_signature?: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  
  // States
  const [profile, setProfile] = useState<any>(null);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  
  // --- NEW CRYPTO STATES ---
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const [formData, setFormData] = useState({
    headline: '', bio: '', location: '', skills: ''
  });

  const loadAllData = async () => {
    try {
      // Load Profile
      const profileData = await getMyProfile();
      setProfile(profileData);
      setFormData({
        headline: profileData.headline || '',
        bio: profileData.bio || '',
        location: profileData.location || '',
        skills: profileData.skills || ''
      });

      // Load Resumes
      const resumeData = await getMyResumes();
      setResumes(resumeData);
    } catch (err: any) {
      if (err.message === 'Unauthorized') navigate('/login');
      setError(err.message || 'Failed to load dashboard data.');
    }
  };

  useEffect(() => {
    loadAllData();
  }, [navigate]);

  // --- Handlers ---
  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateMyProfile(formData);
      setIsEditing(false);
      setMessage("Profile updated successfully!");
      loadAllData();
    } catch (err) {
      setError("Failed to save profile.");
    }
  };

  // STEP 1: Select the file and prompt for password
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setSelectedFile(e.target.files[0]);
    setPassword('');
    setError('');
  };

  // STEP 2: Sign and Upload
  const handleSecureUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    if (!password) {
      setError('Password is required to digitally sign your resume.');
      return;
    }

    setError('');
    setMessage('');
    setIsUploading(true);

    try {
      // 1. Fetch encrypted keys from backend
      const myKeys = await getMyKeys();
      
      // 2. Unlock the RSA-PSS signing key using the password
      const signingKey = await unwrapSigningKey(myKeys.encrypted_private_key, password);
      
      // 3. Hash the PDF and Sign it mathematically
      const signatureBase64 = await signFileDocument(selectedFile, signingKey);
      
      // 4. Upload BOTH the file and the signature
      await uploadResume(selectedFile, signatureBase64);
      
      setMessage('Resume securely uploaded and digitally signed!');
      setSelectedFile(null);
      setPassword('');
      loadAllData(); 
    } catch (err: any) {
      setError(err.message || "Failed to sign and upload. Did you enter the correct password?");
    } finally {
      setIsUploading(false);
    }
  };

  if (!profile) return <div className="p-10 text-center text-xl font-bold">Loading secure dashboard...</div>;

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">Welcome, {profile.username}</h1>
        
        {message && <p className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">{message}</p>}
        {error && <p className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</p>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* PROFILE SECTION */}
          <div className="bg-white p-6 rounded-lg shadow h-fit">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800">Your Profile</h2>
              <button onClick={() => setIsEditing(!isEditing)} className="text-blue-600 text-sm font-semibold hover:underline">
                {isEditing ? 'Cancel' : 'Edit Profile'}
              </button>
            </div>

            {isEditing ? (
              <form onSubmit={handleProfileUpdate} className="flex flex-col gap-3">
                <input type="text" placeholder="Headline" value={formData.headline} onChange={e => setFormData({...formData, headline: e.target.value})} className="border p-2 rounded focus:ring-2 focus:ring-blue-400" />
                <textarea placeholder="Bio" value={formData.bio} onChange={e => setFormData({...formData, bio: e.target.value})} className="border p-2 rounded h-24 focus:ring-2 focus:ring-blue-400" />
                <input type="text" placeholder="Location" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} className="border p-2 rounded focus:ring-2 focus:ring-blue-400" />
                <input type="text" placeholder="Skills (comma separated)" value={formData.skills} onChange={e => setFormData({...formData, skills: e.target.value})} className="border p-2 rounded focus:ring-2 focus:ring-blue-400" />
                <button type="submit" className="bg-blue-600 text-white font-bold py-2 rounded hover:bg-blue-700 transition">Save Changes</button>
              </form>
            ) : (
              <div className="flex flex-col gap-4 text-gray-700">
                <div><p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Headline</p><p className="font-medium">{profile.headline || '—'}</p></div>
                <div><p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Bio</p><p>{profile.bio || '—'}</p></div>
                <div><p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Location</p><p>{profile.location || '—'}</p></div>
                <div><p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Skills</p><p>{profile.skills || '—'}</p></div>
              </div>
            )}
          </div>

          {/* RESUME SECTION */}
          <div className="bg-white p-6 rounded-lg shadow h-fit">
            <h2 className="text-xl font-bold mb-4 text-gray-800">Secure Resumes</h2>
            
            {!selectedFile ? (
              <label className="block w-full border-2 border-dashed border-blue-300 bg-blue-50 text-center py-6 rounded cursor-pointer hover:bg-blue-100 transition mb-6">
                <span className="text-blue-600 font-bold">+ Select PDF Resume to Upload</span>
                <input type="file" accept=".pdf" className="hidden" onChange={handleFileSelect} />
              </label>
            ) : (
              <form onSubmit={handleSecureUpload} className="bg-blue-50 p-4 border border-blue-200 rounded mb-6">
                <p className="font-bold text-blue-800 mb-1 truncate">File: {selectedFile.name}</p>
                <p className="text-xs text-blue-600 mb-3">Enter password to digitally sign this document.</p>
                <input
                  type="password"
                  placeholder="Account password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border p-2 rounded mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <div className="flex gap-2">
                  <button type="submit" disabled={isUploading} className="flex-1 bg-blue-600 text-white font-bold py-2 rounded hover:bg-blue-700 disabled:bg-gray-400 transition">
                    {isUploading ? 'Signing...' : 'Sign & Upload'}
                  </button>
                  <button type="button" onClick={() => setSelectedFile(null)} disabled={isUploading} className="bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded hover:bg-gray-400">
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <ul className="flex flex-col gap-3">
              {resumes.length === 0 ? (
                <li className="text-gray-500 text-center text-sm py-4">No resumes uploaded yet.</li>
              ) : (
                resumes.map(r => (
                  <li key={r.id} className="flex justify-between items-center bg-gray-50 p-3 border rounded">
                    <div className="truncate w-1/2">
                      <a href={downloadResumeUrl(r.id)} target="_blank" rel="noopener noreferrer" className="text-blue-600 font-medium hover:underline truncate block">
                        {r.file.split('/').pop()}
                      </a>
                      {r.digital_signature && (
                        <span className="inline-block mt-1 text-[10px] bg-green-200 text-green-800 px-2 py-0.5 rounded-full font-bold border border-green-300">
                          ✓ Signed
                        </span>
                      )}
                    </div>
                    <button
                      onClick={async () => {
                        if (!confirm('Delete this resume permanently?')) return;
                        try {
                          await deleteResume(r.id);
                          setMessage('Resume deleted');
                          loadAllData();
                        } catch (err: any) {
                          setError('Delete failed');
                        }
                      }}
                      className="text-red-500 hover:text-red-700 text-sm font-bold bg-red-100 hover:bg-red-200 px-3 py-1 rounded transition"
                    >
                      Delete
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

        </div>
      </div>
      <ChatWidget />
    </div>
  );
}
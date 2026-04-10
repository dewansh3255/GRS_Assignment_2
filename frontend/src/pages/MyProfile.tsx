import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import {
  getMyProfile, updateMyProfile,
  uploadResume, getMyResumes, downloadResumeUrl, deleteResume,
  getMyProfileViewers, uploadProfilePicture,
} from '../services/api';
import { signFileDocument } from '../utils/crypto';
import { useCrypto } from '../contexts/CryptoContext';

interface Resume {
  id: number; file: string; is_encrypted: boolean; uploaded_at: string; digital_signature?: string;
}

type TabType = 'profile' | 'privacy' | 'resumes' | 'viewers';

const GRAD = (name: string) => {
  const g = ['from-blue-500 to-cyan-500','from-purple-500 to-pink-500','from-emerald-500 to-teal-500','from-orange-500 to-red-500','from-indigo-500 to-blue-500'];
  return g[(name || 'U').charCodeAt(0) % g.length];
};

const PRIVACY_FIELDS = [
  { key: 'is_headline_public',     label: 'Headline',           desc: 'Your professional headline' },
  { key: 'is_bio_public',          label: 'About / Bio',        desc: 'Your about section' },
  { key: 'is_location_public',     label: 'Location',           desc: 'Your city or region' },
  { key: 'is_skills_public',       label: 'Skills',             desc: 'Your listed skill tags' },
  { key: 'is_education_public',    label: 'Education',          desc: 'Your education history' },
  { key: 'is_experience_public',   label: 'Experience',         desc: 'Your work experience' },
  { key: 'is_view_history_public', label: 'Profile View History', desc: 'Who can see who viewed your profile' },
];

function PrivacyToggle({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-gray-100 last:border-0">
      <div>
        <p className="font-medium text-gray-900 text-sm">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
      </div>
      <div className="flex items-center gap-3 ml-4 shrink-0">
        <span className={`text-xs font-medium ${value ? 'text-blue-600' : 'text-gray-400'}`}>
          {value ? 'Public' : 'Private'}
        </span>
        <button
          type="button"
          onClick={onChange}
          className={`relative inline-flex w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${value ? 'bg-blue-600' : 'bg-gray-200'}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-200 ${value ? 'left-5' : 'left-0.5'}`} />
        </button>
      </div>
    </div>
  );
}

export default function MyProfile() {
  const navigate = useNavigate();
  const { signingKey, isUnlocked, unlockKey } = useCrypto();

  const [profile, setProfile] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<TabType>('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [uploadingPicture, setUploadingPicture] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPrivacy, setSavingPrivacy] = useState(false);

  const [formData, setFormData] = useState({
    headline: '', bio: '', location: '', skills: '', education: '', experience: '',
  });

  const [privacyData, setPrivacyData] = useState<Record<string, boolean>>({
    is_headline_public: true, is_bio_public: true, is_location_public: true,
    is_skills_public: true, is_education_public: true, is_experience_public: true,
    is_view_history_public: true,
  });

  const [resumes, setResumes] = useState<Resume[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const [viewers, setViewers] = useState<{ viewers: any[]; view_count: number; hidden: boolean }>({
    viewers: [], view_count: 0, hidden: false,
  });

  useEffect(() => {
    loadAll();
  }, [navigate]);

  const loadAll = async () => {
    try {
      const [p, r, v] = await Promise.all([getMyProfile(), getMyResumes(), getMyProfileViewers()]);
      setProfile(p);
      setFormData({
        headline: p.headline || '', bio: p.bio || '', location: p.location || '',
        skills: p.skills || '', education: p.education || '', experience: p.experience || '',
      });
      setPrivacyData({
        is_headline_public: p.is_headline_public, is_bio_public: p.is_bio_public,
        is_location_public: p.is_location_public, is_skills_public: p.is_skills_public,
        is_education_public: p.is_education_public, is_experience_public: p.is_experience_public,
        is_view_history_public: p.is_view_history_public,
      });
      setResumes(r);
      setViewers(v);
    } catch (err: any) {
      if (err.message === 'Unauthorized') navigate('/login');
      setError(err.message || 'Failed to load profile');
    }
  };

  const notify = (msg: string) => { setMessage(msg); setTimeout(() => setMessage(''), 3000); };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await updateMyProfile(formData);
      setIsEditing(false);
      notify('Profile updated!');
      loadAll();
    } catch { setError('Failed to save profile.'); }
    finally { setSavingProfile(false); }
  };

  const handlePrivacySave = async () => {
    setSavingPrivacy(true);
    try {
      await updateMyProfile(privacyData);
      notify('Privacy settings saved!');
    } catch { setError('Failed to save privacy settings.'); }
    finally { setSavingPrivacy(false); }
  };

  const handlePictureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPicture(true);
    try {
      await uploadProfilePicture(file);
      notify('Profile picture updated!');
      loadAll();
    } catch (err: any) { setError(err.message || 'Failed to upload picture'); }
    finally { setUploadingPicture(false); }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setSelectedFile(e.target.files[0]);
    setUnlockPassword('');
    setError('');
  };

  const handleSecureUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    setError('');
    setIsUploading(true);
    try {
      let activeKey = signingKey;
      if (!activeKey) {
        if (!unlockPassword) { setError('Password required to sign resume.'); setIsUploading(false); return; }
        const keys = await unlockKey(unlockPassword);
        activeKey = keys.signingKey;
        setUnlockPassword('');
      }
      const sig = await signFileDocument(selectedFile, activeKey);
      await uploadResume(selectedFile, sig);
      notify('Resume signed and uploaded!');
      setSelectedFile(null);
      loadAll();
    } catch (err: any) { setError(err.message || 'Upload failed'); }
    finally { setIsUploading(false); }
  };

  const timeAgo = (iso: string) => {
    const d = new Date(iso), diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString();
  };

  if (!profile) return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <div className="flex items-center justify-center h-96">
        <div className="text-center text-gray-400">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
          <p>Loading profile…</p>
        </div>
      </div>
    </div>
  );

  const tabs: { key: TabType; label: string }[] = [
    { key: 'profile',  label: 'Edit Profile' },
    { key: 'privacy',  label: 'Privacy' },
    { key: 'resumes',  label: 'Resumes' },
    { key: 'viewers',  label: `Viewers${viewers.view_count > 0 ? ` (${viewers.view_count})` : ''}` },
  ];

  const roleBg = profile.role === 'RECRUITER'
    ? 'bg-purple-100 text-purple-700 border-purple-200'
    : profile.role === 'ADMIN'
    ? 'bg-red-100 text-red-700 border-red-200'
    : 'bg-blue-100 text-blue-700 border-blue-200';

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar role={profile.role} username={profile.username} />

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Toast messages */}
        {message && (
          <div className="mb-4 px-4 py-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm font-medium">
            ✓ {message}
          </div>
        )}
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
            {error}
            <button onClick={() => setError('')} className="float-right font-bold">✕</button>
          </div>
        )}

        {/* ── Hero card ──────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
          <div className="h-28" style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #3b82f6 60%, #06b6d4 100%)' }} />
          <div className="px-6 pb-6">
            <div className="flex items-end gap-4 -mt-10 mb-3">
              {/* Avatar / picture */}
              <div className="relative shrink-0">
                <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${GRAD(profile.username)} flex items-center justify-center text-white font-bold text-3xl border-4 border-white shadow-md overflow-hidden`}>
                  {profile.profile_picture_url
                    ? <img src={profile.profile_picture_url} className="w-full h-full object-cover" alt="avatar" />
                    : profile.username[0].toUpperCase()}
                </div>
                <label
                  className={`absolute -bottom-1 -right-1 w-7 h-7 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center cursor-pointer shadow border-2 border-white transition ${uploadingPicture ? 'opacity-50 cursor-wait' : ''}`}
                  title="Change profile picture"
                >
                  <span className="text-white text-xs">&#128247;</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handlePictureUpload} disabled={uploadingPicture} />
                </label>
              </div>

              <div className="pb-1">
                <h1 className="text-2xl font-bold text-gray-900">{profile.username}</h1>
                {profile.headline && <p className="text-gray-500 text-sm mt-0.5">{profile.headline}</p>}
                <span className={`inline-flex items-center px-2 py-0.5 mt-1 rounded-full text-xs font-semibold border ${roleBg}`}>
                  {profile.role}
                </span>
              </div>

              <div className="ml-auto pb-1">
                <button
                  onClick={() => navigate(`/profile/${profile.username}`)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium border border-blue-200 hover:border-blue-300 px-4 py-1.5 rounded-full transition"
                >
                  View public profile →
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Tabs ──────────────────────────────────────────────── */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Tab: Edit Profile ─────────────────────────────────── */}
        {activeTab === 'profile' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-gray-900">Profile Information</h2>
              <button onClick={() => setIsEditing(!isEditing)} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                {isEditing ? 'Cancel' : 'Edit'}
              </button>
            </div>

            {isEditing ? (
              <form onSubmit={handleProfileSave} className="space-y-4">
                {[
                  { key: 'headline',   label: 'Headline',   placeholder: 'e.g. Software Engineer at Google', type: 'input' },
                  { key: 'location',   label: 'Location',   placeholder: 'e.g. San Francisco, CA',          type: 'input' },
                  { key: 'skills',     label: 'Skills',     placeholder: 'e.g. Python, React, AWS (comma-separated)', type: 'input' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{f.label}</label>
                    <input
                      type="text"
                      value={formData[f.key as keyof typeof formData]}
                      onChange={e => setFormData({ ...formData, [f.key]: e.target.value })}
                      placeholder={f.placeholder}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                ))}
                {[
                  { key: 'bio',        label: 'About / Bio',  placeholder: 'Tell the world about yourself…',           rows: 3 },
                  { key: 'education',  label: 'Education',    placeholder: 'B.Sc Computer Science, MIT (2019-2023)\n…', rows: 4 },
                  { key: 'experience', label: 'Experience',   placeholder: 'Software Engineer @ Acme Corp (2023–present)\n• Built X…', rows: 4 },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{f.label}</label>
                    <textarea
                      rows={f.rows}
                      value={formData[f.key as keyof typeof formData]}
                      onChange={e => setFormData({ ...formData, [f.key]: e.target.value })}
                      placeholder={f.placeholder}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                ))}
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {savingProfile ? 'Saving…' : 'Save Profile'}
                </button>
              </form>
            ) : (
              <div className="space-y-5">
                {[
                  { label: 'Headline',   val: profile.headline },
                  { label: 'Location',   val: profile.location },
                  { label: 'Bio',        val: profile.bio },
                  { label: 'Skills',     val: profile.skills },
                  { label: 'Education',  val: profile.education },
                  { label: 'Experience', val: profile.experience },
                ].map(f => (
                  f.val ? (
                    <div key={f.label}>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">{f.label}</p>
                      <p className="text-gray-700 text-sm whitespace-pre-wrap">{f.val}</p>
                    </div>
                  ) : null
                ))}
                {!profile.headline && !profile.bio && !profile.location && (
                  <p className="text-gray-400 text-sm text-center py-8">
                    Your profile is empty — click <strong>Edit</strong> to add your info!
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Privacy ──────────────────────────────────────── */}
        {activeTab === 'privacy' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Privacy Controls</h2>
            <p className="text-sm text-gray-400 mb-6">Toggle what non-connected users can see on your profile</p>

            <div className="space-y-0">
              {PRIVACY_FIELDS.map(f => (
                <PrivacyToggle
                  key={f.key}
                  label={f.label}
                  desc={f.desc}
                  value={privacyData[f.key]}
                  onChange={() => setPrivacyData(prev => ({ ...prev, [f.key]: !prev[f.key] }))}
                />
              ))}
            </div>

            <button
              onClick={handlePrivacySave}
              disabled={savingPrivacy}
              className="mt-6 w-full py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition disabled:opacity-50"
            >
              {savingPrivacy ? 'Saving…' : 'Save Privacy Settings'}
            </button>
          </div>
        )}

        {/* ── Tab: Resumes ──────────────────────────────────────── */}
        {activeTab === 'resumes' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-5">Secure Resumes</h2>

            {!selectedFile ? (
              <label className="flex flex-col items-center justify-center w-full border-2 border-dashed border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-2xl py-10 cursor-pointer transition mb-6">
                <span className="text-3xl mb-2">&#128196;</span>
                <span className="text-blue-600 font-semibold text-sm">Click to select a PDF resume</span>
                <span className="text-blue-400 text-xs mt-1">It will be digitally signed with your key</span>
                <input type="file" accept=".pdf" className="hidden" onChange={handleFileSelect} />
              </label>
            ) : (
              <form onSubmit={handleSecureUpload} className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                <p className="font-semibold text-blue-900 text-sm mb-3 truncate">&#128196; {selectedFile.name}</p>

                {isUnlocked ? (
                  <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3">
                    &#128275; Keys unlocked — ready to sign
                  </p>
                ) : (
                  <div className="mb-3">
                    <p className="text-xs text-blue-600 mb-1">Enter your password to sign (cached for the session)</p>
                    <input
                      type="password"
                      placeholder="Account password"
                      value={unlockPassword}
                      onChange={e => setUnlockPassword(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                )}

                <div className="flex gap-2">
                  <button type="submit" disabled={isUploading}
                    className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition">
                    {isUploading ? 'Signing…' : 'Sign & Upload'}
                  </button>
                  <button type="button" onClick={() => setSelectedFile(null)} disabled={isUploading}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium text-sm hover:bg-gray-200 transition">
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {resumes.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No resumes uploaded yet.</p>
            ) : (
              <ul className="space-y-3">
                {resumes.map(r => (
                  <li key={r.id} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-xl p-3">
                    <div className="min-w-0">
                      <a href={downloadResumeUrl(r.id)} target="_blank" rel="noopener noreferrer"
                        className="text-blue-600 font-medium text-sm hover:underline block truncate">
                        {r.file.split('/').pop()}
                      </a>
                      {r.digital_signature && (
                        <span className="inline-block mt-1 text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold border border-emerald-200">
                          &#10003; Digitally Signed
                        </span>
                      )}
                    </div>
                    <button
                      onClick={async () => {
                        if (!confirm('Delete this resume?')) return;
                        try { await deleteResume(r.id); notify('Resume deleted'); loadAll(); }
                        catch { setError('Delete failed'); }
                      }}
                      className="ml-3 text-red-500 hover:text-red-700 text-xs font-bold bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition shrink-0"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ── Tab: Viewers ──────────────────────────────────────── */}
        {activeTab === 'viewers' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Profile Viewers</h2>
            <p className="text-sm text-gray-400 mb-5">People who viewed your profile in the last 30 days</p>

            {viewers.hidden ? (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-3">&#128274;</div>
                <p className="font-medium">View history is hidden</p>
                <p className="text-sm mt-1">Toggle <strong>Profile View History</strong> to Public in the Privacy tab to see who viewed your profile.</p>
                <button onClick={() => setActiveTab('privacy')} className="mt-4 text-blue-600 hover:underline text-sm">
                  Go to Privacy Settings
                </button>
              </div>
            ) : viewers.viewers.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-3">&#128065;</div>
                <p>No profile views yet. Share your profile to get noticed!</p>
              </div>
            ) : (
              <div>
                <div className="mb-5 bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center gap-3">
                  <div className="text-3xl font-bold text-blue-700">{viewers.view_count}</div>
                  <div>
                    <p className="font-semibold text-blue-900">total profile views</p>
                    <p className="text-xs text-blue-500">all time</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {viewers.viewers.map((v, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${GRAD(v.username)} flex items-center justify-center text-white font-bold shrink-0`}>
                          {v.username[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{v.username}</p>
                          <p className="text-xs text-gray-400">{v.role} · {timeAgo(v.viewed_at)}</p>
                        </div>
                      </div>
                      <button onClick={() => navigate(`/profile/${v.username}`)}
                        className="text-xs text-blue-600 hover:underline font-medium">
                        View profile
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

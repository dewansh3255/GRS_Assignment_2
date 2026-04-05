import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import {
  getCompanies, createCompany, createJob,
  getApplications, updateApplicationStatus, getMyProfile, getJobs, downloadApplicationResume, getPublicKey
} from '../services/api';

import { verifyFileSignature } from '../utils/crypto';

const STATUS_OPTIONS = ['APPLIED', 'REVIEWED', 'INTERVIEWED', 'REJECTED', 'OFFER'];
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  APPLIED:     { bg: '#dbeafe', text: '#1e40af' },
  REVIEWED:    { bg: '#fef9c3', text: '#854d0e' },
  INTERVIEWED: { bg: '#ede9fe', text: '#5b21b6' },
  REJECTED:    { bg: '#fee2e2', text: '#991b1b' },
  OFFER:       { bg: '#dcfce7', text: '#166534' },
};

export default function Recruiter() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [tab, setTab] = useState<'company' | 'jobs' | 'applicants'>('company');

  const [companies, setCompanies] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);

  const [companyForm, setCompanyForm] = useState({ name: '', description: '', location: '', website: '' });
  const [jobForm, setJobForm] = useState({
    company: '', title: '', description: '',
    required_skills: '', location: '', job_type: 'FULL_TIME',
    salary_min: '', salary_max: '', deadline: '',
  });

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [noteInputs, setNoteInputs] = useState<Record<number, string>>({});
  const [downloadingResume, setDownloadingResume] = useState<number | null>(null);

  const loadAll = async () => {
    try {
      const [c, j, a, p] = await Promise.all([
        getCompanies(), getJobs(), getApplications(), getMyProfile(),
      ]);
      setCompanies(c);
      setJobs(j);
      setApplications(a);
      setProfile(p);
    } catch {
      navigate('/login');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setMessage('');
    try {
      await createCompany(companyForm);
      setMessage('Company created successfully!');
      setCompanyForm({ name: '', description: '', location: '', website: '' });
      loadAll();
    } catch { setError('Failed to create company.'); }
  };

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setMessage('');
    try {
      await createJob({
        ...jobForm,
        salary_min: jobForm.salary_min ? Number(jobForm.salary_min) : null,
        salary_max: jobForm.salary_max ? Number(jobForm.salary_max) : null,
        deadline: jobForm.deadline || null,
      });
      setMessage('Job posted successfully!');
      setJobForm({ company: '', title: '', description: '', required_skills: '', location: '', job_type: 'FULL_TIME', salary_min: '', salary_max: '', deadline: '' });
      loadAll();
    } catch { setError('Failed to post job.'); }
  };

  const handleStatusChange = async (appId: number, status: string) => {
    try {
      await updateApplicationStatus(appId, status, noteInputs[appId]);
      setMessage('Application updated!');
      loadAll();
    } catch { setError('Failed to update status.'); }
  };

  // const handleDownloadResume = (applicationId: number, applicantName: string) => {
  //   setDownloadingResume(applicationId);
  //   try {
  //     const url = downloadApplicationResume(applicationId);
  //     const link = document.createElement('a');
  //     link.href = url;
  //     link.download = `${applicantName}_resume.pdf`;
  //     document.body.appendChild(link);
  //     link.click();
  //     document.body.removeChild(link);
  //     setMessage(`Resume downloaded successfully!`);
  //   } catch (err) {
  //     setError('Failed to download resume.');
  //   } finally {
  //     setDownloadingResume(null);
  //   }
  // };

  const handleDownloadResume = async (app: any) => {
    setDownloadingResume(app.id);
    try {
      // 1. Get the download URL and fetch the raw bytes from the backend
      const url = downloadApplicationResume(app.id);
      
      // We use fetch here to get the file buffer in memory before saving it to disk
      const fileResponse = await fetch(url, { credentials: 'include' });
      if (!fileResponse.ok) throw new Error("Failed to fetch file from server");
      const fileBuffer = await fileResponse.arrayBuffer();

      // 2. Fetch the Candidate's Public Key
      const candidateKeys = await getPublicKey(app.applicant_username);

      // 3. Cryptographic Verification
      if (!app.digital_signature) {
        alert("⚠️ Warning: No digital signature found for this resume.");
      } else {
        const isValid = await verifyFileSignature(
          fileBuffer, 
          app.digital_signature, 
          candidateKeys.public_key
        );

        if (!isValid) {
          alert("🚨 SECURITY ALERT: This resume has been tampered with! The digital signature does not match the file contents.");
          setDownloadingResume(null);
          return; // BLOCK THE DOWNLOAD
        }
        alert("✅ Signature Verified. File is authentic and untampered.");
      }

      // 4. Trigger the safe browser download
      const blob = new Blob([fileBuffer], { type: 'application/pdf' });
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${app.applicant_username}_resume.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setMessage(`Resume downloaded successfully!`);
    } catch (err) {
      console.error(err);
      setError('Failed to download or verify resume. Ensure keys are set up.');
    } finally {
      setDownloadingResume(null);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 8,
    border: '1.5px solid #e2e8f0', fontSize: 14, outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: '#64748b',
    display: 'block', marginBottom: 6, textTransform: 'uppercase' as const,
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Navbar />
      <div style={{ textAlign: 'center', padding: 80, color: '#94a3b8' }}>Loading...</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Navbar role={profile?.role} username={profile?.username || localStorage.getItem('username') || ''} />

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', margin: 0 }}>Recruiter Portal</h1>
          <p style={{ color: '#64748b', marginTop: 6 }}>Manage your company, jobs, and applicants</p>
        </div>

        {message && (
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', padding: '12px 16px', borderRadius: 10, marginBottom: 20 }}>
            {message}
          </div>
        )}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', padding: '12px 16px', borderRadius: 10, marginBottom: 20 }}>
            {error}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: '#e2e8f0', borderRadius: 12, padding: 4 }}>
          {([
            { key: 'company', label: '🏢 Company' },
            { key: 'jobs', label: '💼 Post Jobs' },
            { key: 'applicants', label: `👥 Applicants (${applications.length})` },
          ] as const).map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setMessage(''); setError(''); }}
              style={{
                flex: 1, padding: '10px', borderRadius: 8, border: 'none',
                cursor: 'pointer', fontSize: 14, fontWeight: 600, transition: 'all 0.15s',
                background: tab === t.key ? '#fff' : 'transparent',
                color: tab === t.key ? '#1e40af' : '#64748b',
                boxShadow: tab === t.key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
              }}
            >{t.label}</button>
          ))}
        </div>

        {/* Company Tab */}
        {tab === 'company' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
              <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Create Company</h2>
              <form onSubmit={handleCreateCompany} style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
                <div><label style={labelStyle}>Company Name *</label>
                  <input required style={inputStyle} value={companyForm.name} onChange={e => setCompanyForm({ ...companyForm, name: e.target.value })} /></div>
                <div><label style={labelStyle}>Description</label>
                  <textarea rows={3} style={{ ...inputStyle, resize: 'vertical' as const }} value={companyForm.description} onChange={e => setCompanyForm({ ...companyForm, description: e.target.value })} /></div>
                <div><label style={labelStyle}>Location</label>
                  <input style={inputStyle} value={companyForm.location} onChange={e => setCompanyForm({ ...companyForm, location: e.target.value })} /></div>
                <div><label style={labelStyle}>Website</label>
                  <input type="url" style={inputStyle} placeholder="https://" value={companyForm.website} onChange={e => setCompanyForm({ ...companyForm, website: e.target.value })} /></div>
                <button type="submit" style={{
                  background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff',
                  border: 'none', borderRadius: 8, padding: '12px', fontSize: 14,
                  fontWeight: 600, cursor: 'pointer',
                }}>Create Company</button>
              </form>
            </div>

            <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
              <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Your Companies</h2>
              {companies.length === 0 ? (
                <p style={{ color: '#94a3b8', textAlign: 'center', padding: '30px 0' }}>No companies yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                  {companies.map(c => (
                    <div key={c.id} style={{ background: '#f8fafc', borderRadius: 10, padding: 14, border: '1px solid #e2e8f0' }}>
                      <p style={{ margin: '0 0 4px', fontWeight: 700, color: '#0f172a' }}>{c.name}</p>
                      {c.location && <p style={{ margin: '0 0 2px', fontSize: 13, color: '#64748b' }}>📍 {c.location}</p>}
                      {c.website && <a href={c.website} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#3b82f6' }}>{c.website}</a>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Jobs Tab */}
        {tab === 'jobs' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
              <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>Post a Job</h2>
              <form onSubmit={handleCreateJob} style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
                <div><label style={labelStyle}>Company *</label>
                  <select required style={inputStyle} value={jobForm.company} onChange={e => setJobForm({ ...jobForm, company: e.target.value })}>
                    <option value="">Select company...</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
                <div><label style={labelStyle}>Job Title *</label>
                  <input required style={inputStyle} value={jobForm.title} onChange={e => setJobForm({ ...jobForm, title: e.target.value })} /></div>
                <div><label style={labelStyle}>Description *</label>
                  <textarea required rows={3} style={{ ...inputStyle, resize: 'vertical' as const }} value={jobForm.description} onChange={e => setJobForm({ ...jobForm, description: e.target.value })} /></div>
                <div><label style={labelStyle}>Required Skills</label>
                  <input style={inputStyle} placeholder="React, Python, SQL" value={jobForm.required_skills} onChange={e => setJobForm({ ...jobForm, required_skills: e.target.value })} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div><label style={labelStyle}>Location</label>
                    <input style={inputStyle} value={jobForm.location} onChange={e => setJobForm({ ...jobForm, location: e.target.value })} /></div>
                  <div><label style={labelStyle}>Type</label>
                    <select style={inputStyle} value={jobForm.job_type} onChange={e => setJobForm({ ...jobForm, job_type: e.target.value })}>
                      <option value="FULL_TIME">Full Time</option>
                      <option value="INTERNSHIP">Internship</option>
                      <option value="REMOTE">Remote</option>
                    </select></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div><label style={labelStyle}>Min Salary (₹)</label>
                    <input type="number" style={inputStyle} value={jobForm.salary_min} onChange={e => setJobForm({ ...jobForm, salary_min: e.target.value })} /></div>
                  <div><label style={labelStyle}>Max Salary (₹)</label>
                    <input type="number" style={inputStyle} value={jobForm.salary_max} onChange={e => setJobForm({ ...jobForm, salary_max: e.target.value })} /></div>
                </div>
                <div><label style={labelStyle}>Application Deadline</label>
                  <input type="date" style={inputStyle} value={jobForm.deadline} onChange={e => setJobForm({ ...jobForm, deadline: e.target.value })} /></div>
                <button type="submit" style={{
                  background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff',
                  border: 'none', borderRadius: 8, padding: '12px',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}>Post Job</button>
              </form>
            </div>

            <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
              <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>Posted Jobs</h2>
              {jobs.length === 0 ? (
                <p style={{ color: '#94a3b8', textAlign: 'center', padding: '30px 0' }}>No jobs posted yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                  {jobs.map(j => (
                    <div key={j.id} style={{ background: '#f8fafc', borderRadius: 10, padding: 14, border: '1px solid #e2e8f0' }}>
                      <p style={{ margin: '0 0 2px', fontWeight: 700, color: '#0f172a' }}>{j.title}</p>
                      <p style={{ margin: '0 0 4px', fontSize: 13, color: '#3b82f6' }}>{j.company_name}</p>
                      <div style={{ display: 'flex', gap: 8, fontSize: 12, color: '#64748b' }}>
                        {j.location && <span>📍 {j.location}</span>}
                        <span>• {j.job_type.replace('_', ' ')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Applicants Tab */}
        {tab === 'applicants' && (
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>All Applicants</h2>
            {applications.length === 0 ? (
              <p style={{ color: '#94a3b8', textAlign: 'center', padding: '40px 0' }}>No applications received yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
                {applications.map(app => {
                  const cfg = STATUS_COLORS[app.status] || STATUS_COLORS.APPLIED;
                  return (
                    <div key={app.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div>
                          <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: 16, color: '#0f172a' }}>
                            {app.applicant_username}
                          </p>
                          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
                            Applied for <strong>{app.job_title}</strong> · {new Date(app.applied_at).toLocaleDateString()}
                          </p>
                        </div>
                        <span style={{
                          background: cfg.bg, color: cfg.text,
                          fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
                        }}>{app.status}</span>
                      </div>

                      {app.cover_note && (
                        <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#475569', marginBottom: 12, borderLeft: '3px solid #cbd5e1' }}>
                          {app.cover_note}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
                        {app.resume && (
                          <button
                            // onClick={() => handleDownloadResume(app.id, app.applicant_username)}
                            onClick={() => handleDownloadResume(app)}
                            disabled={downloadingResume === app.id}
                            style={{
                              background: '#3b82f6', color: '#fff', border: 'none',
                              borderRadius: 8, padding: '6px 14px', fontSize: 13,
                              fontWeight: 600, cursor: downloadingResume === app.id ? 'not-allowed' : 'pointer',
                              opacity: downloadingResume === app.id ? 0.7 : 1,
                              transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e) => {
                              if (downloadingResume !== app.id) {
                                (e.target as HTMLButtonElement).style.background = '#1e40af';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (downloadingResume !== app.id) {
                                (e.target as HTMLButtonElement).style.background = '#3b82f6';
                              }
                            }}
                          >
                            {downloadingResume === app.id ? '⏳ Downloading...' : '📄 Resume'}
                          </button>
                        )}
                        <select
                          value={app.status}
                          onChange={e => handleStatusChange(app.id, e.target.value)}
                          style={{ ...inputStyle, width: 'auto', padding: '6px 12px' }}
                        >
                          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <input
                          placeholder="Add feedback note..."
                          value={noteInputs[app.id] || ''}
                          onChange={e => setNoteInputs({ ...noteInputs, [app.id]: e.target.value })}
                          style={{ ...inputStyle, flex: 1, minWidth: 180, padding: '6px 12px' }}
                        />
                        <button
                          onClick={() => handleStatusChange(app.id, app.status)}
                          style={{
                            background: '#10b981', color: '#fff', border: 'none',
                            borderRadius: 8, padding: '6px 16px', fontSize: 13,
                            fontWeight: 600, cursor: 'pointer',
                          }}
                        >Save</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
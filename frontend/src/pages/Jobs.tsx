import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getJobs, applyToJob, getMyResumes, getMyProfile, getApplications } from '../services/api';

const JOB_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: 'Full Time',
  INTERNSHIP: 'Internship',
  REMOTE: 'Remote',
};

const JOB_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  FULL_TIME: { bg: '#dbeafe', text: '#1e40af' },
  INTERNSHIP: { bg: '#d1fae5', text: '#065f46' },
  REMOTE: { bg: '#ede9fe', text: '#5b21b6' },
};

export default function Jobs() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<any[]>([]);
  const [resumes, setResumes] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [appliedJobIds, setAppliedJobIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [jobType, setJobType] = useState('');
  const [location, setLocation] = useState('');
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [applyModal, setApplyModal] = useState(false);
  const [coverNote, setCoverNote] = useState('');
  const [selectedResume, setSelectedResume] = useState<number | null>(null);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadJobs = async (params?: any) => {
    setLoading(true);
    try {
      const data = await getJobs(params);
      setJobs(data);
    } catch {
      setError('Failed to load jobs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
    getMyResumes().then(setResumes).catch(() => {});
    getMyProfile().then(setProfile).catch(() => navigate('/login'));
    getApplications().then((apps: any[]) => {
      setAppliedJobIds(new Set(apps.map((a: any) => a.job)));
    }).catch(() => {});
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadJobs({ q: search, job_type: jobType, location });
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJob) return;
    setApplying(true);
    setError('');
    try {
      await applyToJob(selectedJob.id, selectedResume, coverNote);
      setMessage(`Successfully applied to ${selectedJob.title}!`);
      setAppliedJobIds(prev => new Set(prev).add(selectedJob.id));
      setApplyModal(false);
      setCoverNote('');
      setSelectedResume(null);
    } catch (err: any) {
      setError(err.message || 'Failed to apply.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Navbar role={profile?.role} username={profile?.username || localStorage.getItem('username') || ''} />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', margin: 0 }}>Browse Jobs</h1>
          <p style={{ color: '#64748b', marginTop: 6 }}>Find your next opportunity</p>
        </div>

        {message && (
          <div style={{
            background: '#f0fdf4', border: '1px solid #86efac',
            color: '#166534', padding: '12px 16px', borderRadius: 10, marginBottom: 20,
          }}>{message}</div>
        )}
        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5',
            color: '#dc2626', padding: '12px 16px', borderRadius: 10, marginBottom: 20,
          }}>{error}</div>
        )}

        {/* Search Bar */}
        <form onSubmit={handleSearch} style={{
          background: '#fff', borderRadius: 16,
          boxShadow: '0 1px 8px rgba(0,0,0,0.08)',
          padding: 20, marginBottom: 24,
          display: 'flex', gap: 12, flexWrap: 'wrap' as const, alignItems: 'flex-end',
        }}>
          <div style={{ flex: 2, minWidth: 200 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>
              SEARCH
            </label>
            <input
              type="text"
              placeholder="Job title, skill, company..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8,
                border: '1.5px solid #e2e8f0', fontSize: 14,
                outline: 'none', boxSizing: 'border-box' as const,
              }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>
              TYPE
            </label>
            <select
              value={jobType}
              onChange={e => setJobType(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8,
                border: '1.5px solid #e2e8f0', fontSize: 14,
                background: '#fff', outline: 'none',
              }}
            >
              <option value="">All Types</option>
              <option value="FULL_TIME">Full Time</option>
              <option value="INTERNSHIP">Internship</option>
              <option value="REMOTE">Remote</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>
              LOCATION
            </label>
            <input
              type="text"
              placeholder="City or remote"
              value={location}
              onChange={e => setLocation(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8,
                border: '1.5px solid #e2e8f0', fontSize: 14,
                outline: 'none', boxSizing: 'border-box' as const,
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              color: '#fff', border: 'none', borderRadius: 8,
              padding: '10px 24px', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', whiteSpace: 'nowrap' as const,
            }}
          >
            Search
          </button>
          {(search || jobType || location) && (
            <button
              type="button"
              onClick={() => { setSearch(''); setJobType(''); setLocation(''); loadJobs(); }}
              style={{
                background: '#f1f5f9', color: '#64748b', border: 'none',
                borderRadius: 8, padding: '10px 16px', fontSize: 14, cursor: 'pointer',
              }}
            >
              Clear
            </button>
          )}
        </form>

        {/* Jobs Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Loading jobs...</div>
        ) : jobs.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 60,
            background: '#fff', borderRadius: 16,
            boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <p style={{ color: '#64748b', fontSize: 16 }}>No jobs found. Try different filters.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {jobs.map(job => {
              const typeStyle = JOB_TYPE_COLORS[job.job_type] || { bg: '#f1f5f9', text: '#475569' };
              return (
                <div
                  key={job.id}
                  style={{
                    background: '#fff', borderRadius: 16,
                    boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
                    padding: 24, display: 'flex',
                    justifyContent: 'space-between', alignItems: 'flex-start',
                    gap: 16, cursor: 'pointer',
                    border: selectedJob?.id === job.id ? '2px solid #3b82f6' : '2px solid transparent',
                    transition: 'all 0.15s',
                  }}
                  onClick={() => setSelectedJob(selectedJob?.id === job.id ? null : job)}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
                        {job.title}
                      </h3>
                      <span style={{
                        background: typeStyle.bg, color: typeStyle.text,
                        fontSize: 11, fontWeight: 700, padding: '3px 10px',
                        borderRadius: 20, letterSpacing: '0.3px',
                      }}>
                        {JOB_TYPE_LABELS[job.job_type] || job.job_type}
                      </span>
                    </div>
                    <p style={{ margin: '0 0 8px', color: '#3b82f6', fontWeight: 600, fontSize: 14 }}>
                      {job.company_name}
                    </p>
                    <div style={{ display: 'flex', gap: 16, color: '#64748b', fontSize: 13 }}>
                      {job.location && <span>📍 {job.location}</span>}
                      {job.salary_min && job.salary_max && (
                        <span>💰 ₹{job.salary_min.toLocaleString()} – ₹{job.salary_max.toLocaleString()}</span>
                      )}
                      {job.deadline && <span>⏰ Apply by {new Date(job.deadline).toLocaleDateString()}</span>}
                    </div>
                    {selectedJob?.id === job.id && (
                      <div style={{ marginTop: 16 }}>
                        <p style={{ color: '#374151', fontSize: 14, lineHeight: 1.6, margin: '0 0 12px' }}>
                          {job.description}
                        </p>
                        {job.required_skills && (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                            {job.required_skills.split(',').map((s: string) => s.trim()).filter(Boolean).map((skill: string) => (
                              <span key={skill} style={{
                                background: '#f0f9ff', color: '#0369a1',
                                fontSize: 12, padding: '4px 10px', borderRadius: 6,
                                border: '1px solid #bae6fd',
                              }}>{skill}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, minWidth: 100 }}>
                    {appliedJobIds.has(job.id) ? (
                      <button
                        disabled
                        style={{
                          background: '#f1f5f9',
                          color: '#475569', border: '1px solid #cbd5e1', borderRadius: 8,
                          padding: '10px 20px', fontSize: 14, fontWeight: 600,
                          cursor: 'default', whiteSpace: 'nowrap' as const,
                        }}
                      >
                        Applied
                      </button>
                    ) : job.deadline && new Date(job.deadline) < new Date(new Date().setHours(0,0,0,0)) ? (
                      <button
                        disabled
                        style={{
                          background: '#fee2e2',
                          color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: 8,
                          padding: '10px 20px', fontSize: 14, fontWeight: 600,
                          cursor: 'default', whiteSpace: 'nowrap' as const,
                        }}
                      >
                        Expired
                      </button>
                    ) : (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedJob(job);
                          setApplyModal(true);
                          setError('');
                          setMessage('');
                        }}
                        style={{
                          background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                          color: '#fff', border: 'none', borderRadius: 8,
                          padding: '10px 20px', fontSize: 14, fontWeight: 600,
                          cursor: 'pointer', whiteSpace: 'nowrap' as const,
                        }}
                      >
                        Apply Now
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Apply Modal */}
      {applyModal && selectedJob && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 20,
        }}>
          <div style={{
            background: '#fff', borderRadius: 20,
            padding: 32, width: '100%', maxWidth: 520,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: '#0f172a' }}>
                Apply for {selectedJob.title}
              </h2>
              <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>{selectedJob.company_name}</p>
            </div>

            {error && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fca5a5',
                color: '#dc2626', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14,
              }}>{error}</div>
            )}

            <form onSubmit={handleApply}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                  Select Resume
                </label>
                <select
                  value={selectedResume ?? ''}
                  onChange={e => setSelectedResume(e.target.value ? Number(e.target.value) : null)}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 8,
                    border: '1.5px solid #e2e8f0', fontSize: 14, background: '#fff',
                    outline: 'none', boxSizing: 'border-box' as const,
                  }}
                >
                  <option value="">No resume selected</option>
                  {resumes.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.file.split('/').pop()?.replace('.enc', '')} {r.digital_signature ? '✓ Signed' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                  Cover Note
                </label>
                <textarea
                  placeholder="Tell the recruiter why you're a great fit..."
                  value={coverNote}
                  onChange={e => setCoverNote(e.target.value)}
                  rows={4}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 8,
                    border: '1.5px solid #e2e8f0', fontSize: 14,
                    resize: 'vertical' as const, outline: 'none',
                    boxSizing: 'border-box' as const, fontFamily: 'inherit',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  type="submit"
                  disabled={applying}
                  style={{
                    flex: 1, background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                    color: '#fff', border: 'none', borderRadius: 10,
                    padding: '12px', fontSize: 15, fontWeight: 600,
                    cursor: applying ? 'not-allowed' : 'pointer',
                    opacity: applying ? 0.7 : 1,
                  }}
                >
                  {applying ? 'Submitting...' : 'Submit Application'}
                </button>
                <button
                  type="button"
                  onClick={() => { setApplyModal(false); setError(''); }}
                  style={{
                    background: '#f1f5f9', color: '#475569', border: 'none',
                    borderRadius: 10, padding: '12px 20px', fontSize: 15,
                    fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
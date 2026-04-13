import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getMyProfile, API_BASE_URL, secureFetch, getErrorMessage } from '../services/api';

export default function CompanyDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [company, setCompany] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'jobs' | 'posts'>('overview');
  const [newPostContent, setNewPostContent] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Load company details
        const companyRes = await fetch(`${API_BASE_URL}/api/jobs/companies/${id}/`, {
          credentials: 'include',
        });
        if (!companyRes.ok) throw new Error('Failed to load company');
        const companyData = await companyRes.json();
        setCompany(companyData);
        setIsSaved(companyData.is_saved);

        // Load company jobs
        const jobsRes = await fetch(`${API_BASE_URL}/api/jobs/jobs/?company=${id}`, {
          credentials: 'include',
        });
        if (jobsRes.ok) {
          const jobsData = await jobsRes.json();
          setJobs(Array.isArray(jobsData.results) ? jobsData.results : jobsData);
        }

        // Load company posts
        const postsRes = await fetch(`${API_BASE_URL}/api/jobs/companies/${id}/posts/`, {
          credentials: 'include',
        });
        if (postsRes.ok) {
          const postsData = await postsRes.json();
          setPosts(Array.isArray(postsData.results) ? postsData.results : postsData);
        }

        // Load user profile
        getMyProfile().then(setProfile).catch(() => navigate('/login'));
      } catch (err: any) {
        setError(err.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id]);

  const handleSaveCompany = async () => {
    try {
      const endpoint = isSaved ? 'unsave' : 'save';
      const response = await fetch(`${API_BASE_URL}/api/jobs/companies/${id}/${endpoint}/`, {
        method: isSaved ? 'DELETE' : 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to update save status');

      setIsSaved(!isSaved);
      setMessage(isSaved ? 'Removed from saved' : 'Saved to your list!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save company');
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostContent.trim()) return;

    setPostingComment(true);
    try {
      const response = await secureFetch(`${API_BASE_URL}/api/jobs/companies/${id}/posts/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newPostContent }),
      });
      
      if (!response.ok) {
        const errorMessage = await getErrorMessage(response);
        throw new Error(errorMessage);
      }
      
      const newPost = await response.json();
      setPosts([newPost, ...posts]);
      setNewPostContent('');
      setMessage('Post published!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to post');
    } finally {
      setPostingComment(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
        <Navbar role={profile?.role} username={profile?.username || localStorage.getItem('username') || ''} />
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Loading...</div>
      </div>
    );
  }

  if (!company) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
        <Navbar role={profile?.role} username={profile?.username || localStorage.getItem('username') || ''} />
        <div style={{ textAlign: 'center', padding: '40px', color: '#991b1b' }}>
          {error || 'Company not found'}
        </div>
      </div>
    );
  }

  const canEditCompany = profile && (company.owner === profile.id || company.access_level === 'FULL');

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Navbar role={profile?.role} username={profile?.username || localStorage.getItem('username') || ''} />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
        {message && (
          <div style={{
            background: '#f0fdf4', border: '1px solid #86efac',
            color: '#166534', padding: '12px 16px', borderRadius: 10, marginBottom: 20,
          }}>{message}</div>
        )}
        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5',
            color: '#991b1b', padding: '12px 16px', borderRadius: 10, marginBottom: 20,
          }}>{error}</div>
        )}

        {/* Company Header */}
        <div style={{
          background: 'white',
          borderRadius: 12,
          padding: 32,
          marginBottom: 32,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 32,
          alignItems: 'start',
        }}>
          <div>
            {/* Logo & Name */}
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', marginBottom: 24 }}>
              <div style={{
                width: 100,
                height: 100,
                background: company.logo ? `url(${company.logo}) center/cover` : '#e2e8f0',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 48,
                fontWeight: 700,
                color: '#94a3b8',
              }}>
                {!company.logo && company.name.charAt(0)}
              </div>
              <div>
                <h1 style={{ fontSize: 32, fontWeight: 700, color: '#0f172a', margin: '0 0 8px 0' }}>
                  {company.name}
                </h1>
                <p style={{ color: '#64748b', margin: 0, fontSize: 16 }}>
                  {company.industry || 'Not specified'}
                </p>
              </div>
            </div>

            {/* Basic Info */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
              {company.location && (
                <div>
                  <p style={{ color: '#64748b', fontSize: 12, margin: 0, marginBottom: 4 }}>LOCATION</p>
                  <p style={{ color: '#0f172a', fontSize: 14, fontWeight: 600, margin: 0 }}>
                    📍 {company.location}
                  </p>
                </div>
              )}
              {company.employee_count && (
                <div>
                  <p style={{ color: '#64748b', fontSize: 12, margin: 0, marginBottom: 4 }}>EMPLOYEES</p>
                  <p style={{ color: '#0f172a', fontSize: 14, fontWeight: 600, margin: 0 }}>
                    👥 {company.employee_count}
                  </p>
                </div>
              )}
              <div>
                <p style={{ color: '#64748b', fontSize: 12, margin: 0, marginBottom: 4 }}>JOBS POSTED</p>
                <p style={{ color: '#0f172a', fontSize: 14, fontWeight: 600, margin: 0 }}>
                  📋 {company.jobs_count || 0}
                </p>
              </div>
            </div>

            {/* Description */}
            {company.description && (
              <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 8px 0' }}>About</h3>
                <p style={{ color: '#475569', margin: 0, lineHeight: 1.6 }}>
                  {company.description}
                </p>
              </div>
            )}

            {/* Website & Social Links */}
            {(company.website || company.social_links) && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 12px 0' }}>Links</h3>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {company.website && (
                    <a
                      href={company.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '8px 12px',
                        background: '#dbeafe',
                        color: '#1e40af',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      🌐 Website
                    </a>
                  )}
                  {company.social_links?.linkedin && (
                    <a
                      href={company.social_links.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '8px 12px',
                        background: '#dbeafe',
                        color: '#1e40af',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      in LinkedIn
                    </a>
                  )}
                  {company.social_links?.twitter && (
                    <a
                      href={company.social_links.twitter}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '8px 12px',
                        background: '#dbeafe',
                        color: '#1e40af',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      𝕏 Twitter
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              onClick={handleSaveCompany}
              style={{
                background: isSaved ? '#fbbf24' : '#f3f4f6',
                color: isSaved ? '#78350f' : '#374151',
                border: 'none',
                padding: '12px 16px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {isSaved ? '⭐ Saved' : '☆ Save Company'}
            </button>
            {canEditCompany && (
              <button
                onClick={() => navigate(`/companies/${id}/edit`)}
                style={{
                  background: '#2563eb',
                  color: 'white',
                  border: 'none',
                  padding: '12px 16px',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ✎ Edit Company
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: 0,
          marginBottom: 24,
          borderBottom: '1px solid #e2e8f0',
        }}>
          {(['overview', 'jobs', 'posts'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '12px 16px',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid #2563eb' : 'none',
                color: activeTab === tab ? '#2563eb' : '#64748b',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div style={{
            background: 'white',
            borderRadius: 12,
            padding: 24,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}>
            <p style={{ color: '#475569', lineHeight: 1.8 }}>
              {company.description || 'No description available'}
            </p>
            <p style={{ color: '#64748b', marginTop: 16, fontSize: 13 }}>
              Company created on {new Date(company.created_at).toLocaleDateString()}
            </p>
          </div>
        )}

        {activeTab === 'jobs' && (
          <div style={{ display: 'grid', gap: 16 }}>
            {jobs.length === 0 ? (
              <div style={{
                background: 'white',
                borderRadius: 12,
                padding: 40,
                textAlign: 'center',
                color: '#64748b',
              }}>
                No jobs posted yet
              </div>
            ) : (
              jobs.map((job: any) => (
                <div
                  key={job.id}
                  onClick={() => navigate(`/jobs`)}
                  style={{
                    background: 'white',
                    borderRadius: 12,
                    padding: 20,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 4px 0' }}>
                        {job.title}
                      </h3>
                      <p style={{ color: '#64748b', margin: 0, fontSize: 13 }}>
                        {job.job_type} • {job.location || 'Remote'}
                      </p>
                      <p style={{ color: '#475569', margin: '8px 0 0 0', fontSize: 13, lineHeight: 1.5 }}>
                        {job.description.substring(0, 100)}...
                      </p>
                    </div>
                    {job.salary_min && job.salary_max && (
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ color: '#0f172a', fontWeight: 700, margin: 0, fontSize: 14 }}>
                          ${job.salary_min} - ${job.salary_max}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'posts' && (
          <div>
            {/* Post Input */}
            {profile && (
              <form
                onSubmit={handlePostComment}
                style={{
                  background: 'white',
                  borderRadius: 12,
                  padding: 20,
                  marginBottom: 20,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}
              >
                <textarea
                  value={newPostContent}
                  onChange={(e) => setNewPostContent(e.target.value)}
                  placeholder="Share an update about this company..."
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    fontSize: 14,
                    fontFamily: 'inherit',
                    marginBottom: 12,
                    minHeight: 80,
                    resize: 'vertical',
                  }}
                />
                <button
                  type="submit"
                  disabled={postingComment || !newPostContent.trim()}
                  style={{
                    background: '#2563eb',
                    color: 'white',
                    border: 'none',
                    padding: '10px 16px',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    opacity: postingComment || !newPostContent.trim() ? 0.6 : 1,
                  }}
                >
                  {postingComment ? 'Posting...' : 'Post Update'}
                </button>
              </form>
            )}

            {/* Posts List */}
            {posts.length === 0 ? (
              <div style={{
                background: 'white',
                borderRadius: 12,
                padding: 40,
                textAlign: 'center',
                color: '#64748b',
              }}>
                No posts yet
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 16 }}>
                {posts.map((post: any) => (
                  <div
                    key={post.id}
                    style={{
                      background: 'white',
                      borderRadius: 12,
                      padding: 20,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
                      <div>
                        <p style={{ color: '#0f172a', fontWeight: 700, margin: 0, fontSize: 14 }}>
                          {post.author_username}
                        </p>
                        <p style={{ color: '#64748b', margin: 0, fontSize: 12 }}>
                          {new Date(post.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <p style={{ color: '#475569', margin: 0, lineHeight: 1.6 }}>
                      {post.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

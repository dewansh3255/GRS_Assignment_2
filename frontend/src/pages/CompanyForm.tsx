import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getMyProfile, API_BASE_URL, secureFetch, getErrorMessage } from '../services/api';

export default function CompanyForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(!!id);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    location: '',
    industry: '',
    employee_count: '',
    website: '',
    logo: null as File | null,
    social_links: {
      linkedin: '',
      twitter: '',
      facebook: '',
    },
  });

  useEffect(() => {
    getMyProfile().then((p) => {
      if (p.role !== 'RECRUITER') {
        navigate('/dashboard');
      }
      setProfile(p);
    }).catch(() => navigate('/login'));

    if (id) {
      const loadCompany = async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/api/jobs/companies/${id}/`, {
            credentials: 'include',
          });
          if (!response.ok) throw new Error('Failed to load company');
          const data = await response.json();

          // Check if user can edit this company
          if (data.access_level !== 'OWNER' && data.access_level !== 'FULL') {
            navigate(`/companies/${id}`);
            return;
          }

          setFormData({
            name: data.name,
            description: data.description,
            location: data.location,
            industry: data.industry || '',
            employee_count: data.employee_count || '',
            website: data.website,
            logo: null,
            social_links: data.social_links || { linkedin: '', twitter: '', facebook: '' },
          });
        } catch (err: any) {
          setError(err.message || 'Failed to load company');
        } finally {
          setLoading(false);
        }
      };
      loadCompany();
    }
  }, [id]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSocialLinkChange = (platform: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      social_links: {
        ...prev.social_links,
        [platform]: value,
      },
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFormData((prev) => ({
        ...prev,
        logo: e.target.files![0],
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const formDataObj = new FormData();
      formDataObj.append('name', formData.name);
      formDataObj.append('description', formData.description);
      formDataObj.append('location', formData.location);
      formDataObj.append('industry', formData.industry);
      if (formData.employee_count) {
        formDataObj.append('employee_count', formData.employee_count);
      }
      formDataObj.append('website', formData.website);
      if (formData.logo) {
        formDataObj.append('logo', formData.logo);
      }
      formDataObj.append('social_links', JSON.stringify(formData.social_links));

      const method = id ? 'PUT' : 'POST';
      const url = id ? `${API_BASE_URL}/api/jobs/companies/${id}/` : `${API_BASE_URL}/api/jobs/companies/`;

      // For multipart form data, we need to pass it through secureFetch
      // Don't set Content-Type - let browser set it with boundary
      const response = await secureFetch(url, {
        method,
        body: formDataObj,
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
        }
      });

      if (!response.ok) {
        const errorMessage = await getErrorMessage(response);
        throw new Error(errorMessage);
      }

      const company = await response.json();
      setMessage(id ? 'Company updated successfully!' : 'Company created successfully!');
      setTimeout(() => {
        navigate(`/companies/${company.id}`);
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to save company');
    } finally {
      setSubmitting(false);
    }
  };

  if (!profile) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
        <Navbar />
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Navbar role={profile.role} username={profile.username} />

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', margin: '0 0 8px 0' }}>
          {id ? 'Edit Company' : 'Create Company'}
        </h1>
        <p style={{ color: '#64748b', margin: 0, marginBottom: 32 }}>
          {id ? 'Update your company information' : 'Set up your company profile'}
        </p>

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

        <form onSubmit={handleSubmit} style={{
          background: 'white',
          borderRadius: 12,
          padding: 24,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          {/* Company Name */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>
              Company Name *
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="Enter company name"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                fontSize: 14,
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>
              Description
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder="Tell us about your company"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                fontSize: 14,
                fontFamily: 'inherit',
                minHeight: 100,
                boxSizing: 'border-box',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Location */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>
              Location
            </label>
            <input
              type="text"
              name="location"
              value={formData.location}
              onChange={handleInputChange}
              placeholder="e.g., San Francisco, CA"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                fontSize: 14,
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Industry */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>
              Industry
            </label>
            <input
              type="text"
              name="industry"
              value={formData.industry}
              onChange={handleInputChange}
              placeholder="e.g., Technology, Healthcare"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                fontSize: 14,
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Employee Count */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>
              Employee Count
            </label>
            <input
              type="number"
              name="employee_count"
              value={formData.employee_count}
              onChange={handleInputChange}
              placeholder="e.g., 50"
              min="0"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                fontSize: 14,
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Website */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>
              Website
            </label>
            <input
              type="url"
              name="website"
              value={formData.website}
              onChange={handleInputChange}
              placeholder="https://example.com"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                fontSize: 14,
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Logo */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>
              Company Logo
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                fontSize: 13,
                boxSizing: 'border-box',
              }}
            />
            <p style={{ color: '#64748b', fontSize: 12, margin: '6px 0 0 0' }}>Max size: 5MB (JPG, PNG)</p>
          </div>

          {/* Social Links */}
          <div style={{ marginBottom: 24, padding: 16, background: '#f8fafc', borderRadius: 8 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: '0 0 12px 0' }}>Social Links</h3>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#475569', marginBottom: 4 }}>LinkedIn</label>
              <input
                type="url"
                value={formData.social_links.linkedin}
                onChange={(e) => handleSocialLinkChange('linkedin', e.target.value)}
                placeholder="https://linkedin.com/company/..."
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                  fontSize: 13,
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#475569', marginBottom: 4 }}>Twitter/X</label>
              <input
                type="url"
                value={formData.social_links.twitter}
                onChange={(e) => handleSocialLinkChange('twitter', e.target.value)}
                placeholder="https://twitter.com/..."
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                  fontSize: 13,
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#475569', marginBottom: 4 }}>Facebook</label>
              <input
                type="url"
                value={formData.social_links.facebook}
                onChange={(e) => handleSocialLinkChange('facebook', e.target.value)}
                placeholder="https://facebook.com/..."
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                  fontSize: 13,
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Submit Button */}
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="submit"
              disabled={submitting}
              style={{
                flex: 1,
                background: '#2563eb',
                color: 'white',
                border: 'none',
                padding: '12px 16px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? 'Saving...' : id ? 'Update Company' : 'Create Company'}
            </button>
            <button
              type="button"
              onClick={() => navigate(id ? `/companies/${id}` : '/companies')}
              style={{
                flex: 1,
                background: '#f3f4f6',
                color: '#374151',
                border: '1px solid #e5e7eb',
                padding: '12px 16px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

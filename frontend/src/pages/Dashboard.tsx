import { useEffect, useState } from 'react';
import { uploadResume, listResumes, downloadResumeUrl, deleteResume } from '../services/api';

interface Resume {
  id: number;
  file: string;
  is_encrypted: boolean;
  uploaded_at: string;
}

export default function Dashboard() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');

  const loadResumes = async () => {
    try {
      const data = await listResumes();
      setResumes(data);
    } catch (err: any) {
      setError(err.message || 'Unable to load resumes');
    }
  };

  useEffect(() => {
    loadResumes();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please choose a file first');
      return;
    }
    setError('');
    setMessage('');
    try {
      await uploadResume(selectedFile);
      setMessage('Upload successful');
      setSelectedFile(null);
      loadResumes();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
      {message && <p className="text-green-600 mb-2">{message}</p>}
      {error && <p className="text-red-600 mb-2">{error}</p>}

      <form onSubmit={handleUpload} className="mb-6">
        <input type="file" onChange={handleFileChange} />
        <button
          type="submit"
          className="ml-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Upload Resume
        </button>
      </form>

      <h2 className="text-xl font-semibold mb-2">Your Resumes</h2>
      <ul>
        {resumes.map(r => (
          <li key={r.id} className="mb-1">
            <a
              href={downloadResumeUrl(r.id)}
              className="text-blue-600 underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {r.file.split('/').pop()}
            </a> 
            <span className="text-sm text-gray-500">({new Date(r.uploaded_at).toLocaleString()})</span>
            <button
              onClick={async () => {
                if (!confirm('Delete this resume?')) return;
                try {
                  await deleteResume(r.id);
                  setMessage('Resume deleted');
                  loadResumes();
                } catch (err: any) {
                  setError(err.message || 'Delete failed');
                }
              }}
              className="ml-3 text-sm text-red-600 underline"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

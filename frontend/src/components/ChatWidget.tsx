import { useState, useEffect, useRef } from 'react';
import { getUsersList, getPublicKey, sendEncryptedMessage, getMessages, getMyKeys } from '../services/api';
import { encryptMessage, decryptMessage, unwrapPrivateKey } from '../utils/crypto';

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  
  const [messages, setMessages] = useState<any[]>([]); // Messages received
  const [sentMessages, setSentMessages] = useState<any[]>([]); // Messages you sent locally
  const [inputText, setInputText] = useState('');
  const [error, setError] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Fetch users when the widget is opened
  useEffect(() => {
    if (isOpen) {
      getUsersList().then(setUsers).catch(console.error);
    }
  }, [isOpen]);

  // 2. Auto-scroll to the bottom of the chat when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sentMessages, selectedUser]);

  // 3. AUTO-REFRESH: Poll the server for new messages every 3 seconds
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isOpen && isUnlocked && privateKey) {
      interval = setInterval(() => {
        fetchInbox(privateKey);
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [isOpen, isUnlocked, privateKey]);

  // Unlock the RSA Private Key
  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const myKeys = await getMyKeys();
      const unlockedKey = await unwrapPrivateKey(myKeys.encrypted_private_key, password);
      setPrivateKey(unlockedKey);
      setIsUnlocked(true);
      fetchInbox(unlockedKey); // Initial fetch
    } catch (err) {
      setError('Failed to unlock. Wrong password?');
    }
  };

  // Fetch & Decrypt Inbox
  const fetchInbox = async (key: CryptoKey) => {
    try {
      const encryptedMsgs = await getMessages();
      const decryptedMsgs = await Promise.all(
        encryptedMsgs.map(async (msg: any) => {
          try {
            const plaintext = await decryptMessage(msg.encrypted_content, msg.encrypted_key, key);
            return { ...msg, plaintext };
          } catch {
            return { ...msg, plaintext: '[Decryption Failed]' };
          }
        })
      );
      setMessages(decryptedMsgs);
    } catch (err) {
      console.error("Inbox fetch failed", err);
    }
  };

  // Encrypt & Send Message
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !inputText) return;
    try {
      // Encrypt and send to backend
      const recipientData = await getPublicKey(selectedUser.username);
      const { encryptedContent, encryptedKey } = await encryptMessage(inputText, recipientData.public_key);
      await sendEncryptedMessage(selectedUser.id, encryptedContent, encryptedKey);
      
      // Add to local state so you can see what you just sent
      setSentMessages(prev => [...prev, {
        id: 'local-' + Date.now(),
        recipient_username: selectedUser.username,
        plaintext: inputText,
        timestamp: new Date().toISOString(),
        is_sent: true
      }]);

      setInputText('');
    } catch (err) {
      alert('Failed to send message.');
    }
  };

  // Helper function to render only the conversation with the selected user
  const renderConversation = () => {
    if (!selectedUser) {
      return <p className="text-center text-gray-400 mt-10">Select a user to start a secure chat.</p>;
    }

    // Filter received messages
    const received = messages
      .filter(m => m.sender_username === selectedUser.username)
      .map(m => ({ ...m, is_sent: false }));
      
    // Filter sent messages
    const sent = sentMessages
      .filter(m => m.recipient_username === selectedUser.username);

    // Combine them and sort chronologically by timestamp
    const combined = [...received, ...sent].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    if (combined.length === 0) {
      return <p className="text-center text-gray-400 mt-10">No messages yet. Say hello!</p>;
    }

    return combined.map(msg => (
      <div key={msg.id} className={`flex ${msg.is_sent ? 'justify-end' : 'justify-start'} mb-2`}>
        <div className={`p-2 rounded-lg max-w-[80%] ${msg.is_sent ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-200 text-black rounded-bl-none'}`}>
          <span className="block text-[10px] opacity-60 mb-1">{msg.is_sent ? 'You' : msg.sender_username}</span>
          <span className="text-sm">{msg.plaintext}</span>
        </div>
      </div>
    ));
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {!isOpen && (
        <button onClick={() => setIsOpen(true)} className="bg-blue-600 text-white p-4 rounded-full shadow-lg font-bold hover:bg-blue-700 transition-transform hover:scale-105">
          💬 Secure Chat
        </button>
      )}

      {isOpen && (
        <div className="bg-white border rounded-lg shadow-2xl w-80 h-[32rem] flex flex-col">
          <div className="bg-gray-800 text-white p-3 flex justify-between items-center rounded-t-lg">
            <span className="font-bold">E2EE Messaging</span>
            <button onClick={() => setIsOpen(false)} className="text-red-400 font-bold hover:text-red-300">✖</button>
          </div>

          {!isUnlocked ? (
            <form onSubmit={handleUnlock} className="flex flex-col flex-1 p-6 justify-center bg-gray-50">
              <div className="text-center mb-6">
                <span className="text-4xl">🔐</span>
              </div>
              <p className="text-sm mb-4 text-gray-600 text-center">Enter your password to decrypt your local keys and unlock your inbox.</p>
              {error && <p className="text-red-500 text-xs mb-2 text-center">{error}</p>}
              <input type="password" placeholder="Password" className="border border-gray-300 p-2 mb-4 rounded w-full focus:outline-none focus:border-blue-500"
                onChange={(e) => setPassword(e.target.value)} required />
              <button type="submit" className="bg-green-600 text-white p-2 rounded hover:bg-green-700 font-semibold shadow-sm">Unlock Inbox</button>
            </form>
          ) : (
            <div className="flex flex-col flex-1 overflow-hidden">
              <div className="p-2 border-b bg-gray-100">
                <select className="w-full border border-gray-300 p-1.5 rounded text-sm focus:outline-none" 
                  onChange={(e) => setSelectedUser(users.find(u => u.id === parseInt(e.target.value)))} 
                  defaultValue="">
                  <option value="" disabled>Select user to message...</option>
                  {users.map(u => <option key={u.id} value={u.id}>@{u.username}</option>)}
                </select>
              </div>

              {/* Chat Viewport */}
              <div className="flex-1 overflow-y-auto p-3 bg-white">
                {renderConversation()}
                {/* Empty div to auto-scroll to */}
                <div ref={messagesEndRef} /> 
              </div>

              <form onSubmit={handleSend} className="p-2 border-t bg-gray-50 flex gap-2">
                <input type="text" className="border border-gray-300 p-2 rounded flex-1 text-sm focus:outline-none focus:border-blue-500" placeholder="Type secret message..."
                  value={inputText} onChange={(e) => setInputText(e.target.value)} disabled={!selectedUser} />
                <button type="submit" className="bg-blue-600 text-white px-4 py-1 rounded font-semibold hover:bg-blue-700 disabled:bg-gray-400 transition-colors" disabled={!selectedUser}>
                  Send
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
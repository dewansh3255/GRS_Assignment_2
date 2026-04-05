import { useState, useEffect, useRef } from 'react';
import { 
  getUsersList, getPublicKey, sendEncryptedMessage, getMessages, getMyKeys,
  getMyGroups, createGroup, fetchGroupMessages, sendGroupMessage, addGroupMember, removeGroupMember, promoteGroupMember, deleteGroup // Phase 5 API Imports
} from '../services/api';
import { 
  encryptMessage, decryptMessage, unwrapPrivateKey,
  generateGroupKey, wrapGroupKeyForMembers, unwrapGroupKey, encryptGroupMessage, decryptGroupMessage // Phase 5 Crypto Imports
} from '../utils/crypto';

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  
  // Tab State
  const [activeTab, setActiveTab] = useState<'DM' | 'GROUP'>('DM');

  // DM State
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]); 
  const [sentMessages, setSentMessages] = useState<any[]>([]); 
  
  // Group State (Phase 5)
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [groupMessages, setGroupMessages] = useState<any[]>([]);
  const [unwrappedGroupKeys, setUnwrappedGroupKeys] = useState<Record<number, CryptoKey>>({});
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);

  const [inputText, setInputText] = useState('');
  const [error, setError] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Settings State
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [newMemberId, setNewMemberId] = useState('');
  //const currentUserId = Number(localStorage.getItem('user_id')); // Assuming you store this on login

  // Fetch users and groups on open
  useEffect(() => {
    if (isOpen) {
      getUsersList().then(setUsers).catch(console.error);
      if (isUnlocked) fetchGroupsData();
    }
  }, [isOpen, isUnlocked]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sentMessages, groupMessages, selectedUser, selectedGroup]);

  // Auto-refresh polling
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isOpen && isUnlocked && privateKey) {
      interval = setInterval(() => {
        if (activeTab === 'DM') fetchInbox(privateKey);
        if (activeTab === 'GROUP' && selectedGroup) pollGroupMessages(selectedGroup, privateKey);
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [isOpen, isUnlocked, privateKey, activeTab, selectedGroup, unwrappedGroupKeys]);

  // --- UNLOCK & FETCH INITIAL DATA ---
  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const myKeys = await getMyKeys();
      const username = localStorage.getItem('username') || '';
      const unlockedKey = await unwrapPrivateKey(myKeys.encrypted_private_key, password, username);
      setPrivateKey(unlockedKey);
      setIsUnlocked(true);
      fetchInbox(unlockedKey); 
      fetchGroupsData();
    } catch (err) {
      setError('Failed to unlock. Wrong password?');
    }
  };

  const fetchGroupsData = async () => {
    try {
      const myGroups = await getMyGroups();
      setGroups(myGroups);
    } catch (err) {
      console.error("Failed to fetch groups", err);
    }
  };

  // --- DM LOGIC (UNCHANGED) ---
  const fetchInbox = async (key: CryptoKey) => {
    // ... your existing fetchInbox logic ...
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

  const handleSendDM = async () => {
    if (!selectedUser || !inputText) return;
    try {
      const recipientData = await getPublicKey(selectedUser.username);
      const { encryptedContent, encryptedKey } = await encryptMessage(inputText, recipientData.public_key);
      await sendEncryptedMessage(selectedUser.id, encryptedContent, encryptedKey);
      
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

  // --- GROUP CHAT LOGIC (PHASE 5) ---

  const handleCreateGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName || selectedMembers.length === 0 || !privateKey) return;
    
    try {
      const sharedAesKey = await generateGroupKey();
      
      // 1. Wrap for selected members
      const memberKeyPromises = selectedMembers.map(async (uid) => {
        const userObj = users.find(u => u.id === uid);
        const keyData = await getPublicKey(userObj.username);
        return { userId: uid, publicKeyBase64: keyData.public_key };
      });
      const memberKeyData = await Promise.all(memberKeyPromises);

      // 2. Wrap for MYSELF (the owner) using the special -1 flag
      const myKeys = await getMyKeys();
      memberKeyData.push({
        userId: -1, 
        publicKeyBase64: myKeys.public_key
      });

      const wrappedKeys = await wrapGroupKeyForMembers(sharedAesKey, memberKeyData);
      await createGroup(newGroupName, wrappedKeys);
      
      setShowCreateGroup(false);
      setNewGroupName('');
      setSelectedMembers([]);
      fetchGroupsData(); // Refresh the UI
    } catch (err) {
      console.error(err);
      alert('Failed to create group. Ensure all users have generated keys.');
    }
  };

  const handleSelectGroup = async (group: any) => {
    setSelectedGroup(group);
    setGroupMessages([]);
    if (!privateKey) return;

    if (!unwrappedGroupKeys[group.id]) {
      try {
        const myUsername = localStorage.getItem('username');
        // THE FIX: Find your membership by matching your username
        const myMembership = group.members.find((m: any) => m.username === myUsername);
        
        if (myMembership) {
          const decryptedGroupKey = await unwrapGroupKey(myMembership.encrypted_group_key, privateKey);
          setUnwrappedGroupKeys(prev => ({ ...prev, [group.id]: decryptedGroupKey }));
          pollGroupMessages(group, privateKey, decryptedGroupKey);
        } else {
          console.error("Critical Error: You are not a member of this group!");
        }
      } catch (err) {
        console.error("Failed to unwrap group key", err);
      }
    } else {
      pollGroupMessages(group, privateKey, unwrappedGroupKeys[group.id]);
    }
  };

  const pollGroupMessages = async (group: any, rsaPrivKey: CryptoKey, cachedAesKey?: CryptoKey) => {
    const aesKeyToUse = cachedAesKey || unwrappedGroupKeys[group.id];
    if (!aesKeyToUse) return;

    try {
      const myUsername = localStorage.getItem('username');
      const encryptedMsgs = await fetchGroupMessages(group.id);
      
      const decryptedMsgs = await Promise.all(encryptedMsgs.map(async (msg: any) => {
        try {
          const plaintext = await decryptGroupMessage(msg.encrypted_content, aesKeyToUse);
          // THE FIX: Identify your own messages using username
          return { ...msg, plaintext, is_sent: msg.sender_username === myUsername };
        } catch {
          return { ...msg, plaintext: '[Decryption Failed]', is_sent: msg.sender_username === myUsername };
        }
      }));
      setGroupMessages(decryptedMsgs);
    } catch (err) {
      console.error("Failed to fetch group messages", err);
    }
  };

  const handleSendGroupMessage = async () => {
    if (!selectedGroup || !inputText || !unwrappedGroupKeys[selectedGroup.id]) return;
    try {
      const encryptedContent = await encryptGroupMessage(inputText, unwrappedGroupKeys[selectedGroup.id]);
      await sendGroupMessage(selectedGroup.id, encryptedContent);
      setInputText('');
      pollGroupMessages(selectedGroup, privateKey!, unwrappedGroupKeys[selectedGroup.id]);
    } catch (err) {
      alert('Failed to send group message.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTab === 'DM') handleSendDM();
    else handleSendGroupMessage();
  };

  // --- GROUP MANAGEMENT HANDLERS ---
  const myGroupRole = selectedGroup?.members?.find((m: any) => m.username === localStorage.getItem('username'))?.role;

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup || !newMemberId || !unwrappedGroupKeys[selectedGroup.id]) return;

    try {
      // 1. Get the new user's Public Key
      const userObj = users.find(u => u.id === parseInt(newMemberId));
      const keyData = await getPublicKey(userObj.username);
      
      // 2. Re-wrap the currently unlocked AES Group Key for the new user
      const wrappedData = await wrapGroupKeyForMembers(
        unwrappedGroupKeys[selectedGroup.id], 
        [{ userId: parseInt(newMemberId), publicKeyBase64: keyData.public_key }]
      );

      // 3. Send to API
      await addGroupMember(selectedGroup.id, parseInt(newMemberId), wrappedData[0].encrypted_key);
      alert(`${userObj.username} added successfully!`);
      setNewMemberId('');
      fetchGroupsData(); // Refresh group member list
    } catch (err) {
      alert("Failed to add member. Ensure they have generated their keys.");
    }
  };

  const handlePromote = async (userId: number) => {
    try {
      await promoteGroupMember(selectedGroup.id, userId);
      fetchGroupsData();
    } catch (err) { alert("Failed to promote user."); }
  };

  const handleRemove = async (userId: number) => {
    if (!window.confirm("Remove this user?")) return;
    try {
      await removeGroupMember(selectedGroup.id, userId);
      fetchGroupsData();
    } catch (err) { alert("Failed to remove user."); }
  };

  const handleDeleteGroup = async () => {
    if (!window.confirm("Are you sure you want to permanently delete this group?")) return;
    try {
      await deleteGroup(selectedGroup.id);
      setSelectedGroup(null);
      setShowGroupSettings(false);
      fetchGroupsData();
    } catch (err) { alert("Failed to delete group."); }
  };

  // --- UI RENDERERS ---

  const renderConversation = () => {
    if (activeTab === 'GROUP') {
      if (!selectedGroup) return <p className="text-center text-gray-400 mt-10">Select a group to chat.</p>;
      if (groupMessages.length === 0) return <p className="text-center text-gray-400 mt-10">No messages yet.</p>;
      
      return groupMessages.map(msg => (
        <div key={msg.id} className={`flex ${msg.is_sent ? 'justify-end' : 'justify-start'} mb-2`}>
          <div className={`p-2 rounded-lg max-w-[80%] ${msg.is_sent ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-gray-200 text-black rounded-bl-none'}`}>
            <span className="block text-[10px] opacity-60 mb-1">{msg.is_sent ? 'You' : msg.sender_username}</span>
            <span className="text-sm">{msg.plaintext}</span>
          </div>
        </div>
      ));
    }

    // DM Render Logic
    if (!selectedUser) return <p className="text-center text-gray-400 mt-10">Select a user to chat.</p>;
    const received = messages.filter(m => m.sender_username === selectedUser.username).map(m => ({ ...m, is_sent: false }));
    const sent = sentMessages.filter(m => m.recipient_username === selectedUser.username);
    const combined = [...received, ...sent].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (combined.length === 0) return <p className="text-center text-gray-400 mt-10">No messages yet. Say hello!</p>;

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
             <p className="text-sm mb-4 text-gray-600 text-center">Enter your password to decrypt your keys.</p>
             {error && <p className="text-red-500 text-xs mb-2 text-center">{error}</p>}
             <input type="password" placeholder="Password" className="border border-gray-300 p-2 mb-4 rounded w-full focus:outline-none focus:border-blue-500"
               onChange={(e) => setPassword(e.target.value)} required />
             <button type="submit" className="bg-green-600 text-white p-2 rounded hover:bg-green-700 font-semibold shadow-sm">Unlock Inbox</button>
           </form>
          ) : (
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* TABS */}
              <div className="flex bg-gray-200 text-sm font-semibold">
                <button onClick={() => setActiveTab('DM')} className={`flex-1 p-2 ${activeTab === 'DM' ? 'bg-white border-t-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:bg-gray-300'}`}>Direct</button>
                <button onClick={() => setActiveTab('GROUP')} className={`flex-1 p-2 ${activeTab === 'GROUP' ? 'bg-white border-t-2 border-indigo-500 text-indigo-600' : 'text-gray-500 hover:bg-gray-300'}`}>Groups</button>
              </div>

              {/* SELECTORS / CREATE GROUP */}
              {/* SELECTORS / CREATE GROUP */}
              <div className="p-2 border-b bg-gray-100 flex gap-2 items-center">
                {activeTab === 'DM' ? (
                  <select className="w-full border border-gray-300 p-1.5 rounded text-sm focus:outline-none" 
                    onChange={(e) => setSelectedUser(users.find(u => u.id === parseInt(e.target.value)))} defaultValue="">
                    <option value="" disabled>Select user...</option>
                    {users.map(u => <option key={u.id} value={u.id}>@{u.username}</option>)}
                  </select>
                ) : (
                  <>
                    <select className="flex-1 border border-gray-300 p-1.5 rounded text-sm focus:outline-none" 
                      onChange={(e) => {
                        handleSelectGroup(groups.find(g => g.id === parseInt(e.target.value)));
                        setShowGroupSettings(false);
                      }} value={selectedGroup?.id || ""}>
                      <option value="" disabled>Select group...</option>
                      {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                    {selectedGroup && (
                      <button onClick={() => setShowGroupSettings(!showGroupSettings)} className="text-gray-600 hover:text-gray-900 font-bold px-2">
                        ⚙️
                      </button>
                    )}
                    <button onClick={() => {setShowCreateGroup(!showCreateGroup); setShowGroupSettings(false);}} className="bg-indigo-600 text-white px-2 rounded text-xs font-bold hover:bg-indigo-700">+</button>
                  </>
                )}
              </div>

              {/* GROUP SETTINGS PANEL */}
              {activeTab === 'GROUP' && showGroupSettings && selectedGroup && (
                <div className="absolute top-24 left-0 right-0 bottom-0 bg-white z-10 p-4 overflow-y-auto">
                  <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h3 className="font-bold text-gray-800">{selectedGroup.name} Settings</h3>
                    <button onClick={() => setShowGroupSettings(false)} className="text-red-500 font-bold">✖</button>
                  </div>
                  
                  <div className="mb-4">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Members</h4>
                    <ul className="text-sm border rounded divide-y">
                      {selectedGroup.members.map((m: any) => (
                        <li key={m.user} className="p-2 flex justify-between items-center bg-gray-50">
                          <div>
                            <span className="font-semibold">@{m.username}</span>
                            <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded text-white ${m.role === 'owner' ? 'bg-red-500' : m.role === 'admin' ? 'bg-blue-500' : 'bg-gray-400'}`}>{m.role.toUpperCase()}</span>
                          </div>
                          {(myGroupRole === 'owner' || myGroupRole === 'admin') && m.role !== 'owner' && (
                            <div className="flex gap-2">
                              {myGroupRole === 'owner' && m.role !== 'admin' && (
                                <button onClick={() => handlePromote(m.user)} className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded hover:bg-blue-200">Promote</button>
                              )}
                              <button onClick={() => handleRemove(m.user)} className="text-[10px] bg-red-100 text-red-700 px-1 rounded hover:bg-red-200">Kick</button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {(myGroupRole === 'owner' || myGroupRole === 'admin') && (
                    <form onSubmit={handleAddMember} className="mb-6 flex gap-2">
                      <select className="border p-1 text-sm rounded flex-1" value={newMemberId} onChange={e => setNewMemberId(e.target.value)} required>
                        <option value="" disabled>Add new member...</option>
                        {users.filter(u => !selectedGroup.members.find((m: any) => m.user === u.id)).map(u => (
                          <option key={u.id} value={u.id}>@{u.username}</option>
                        ))}
                      </select>
                      <button type="submit" className="bg-green-600 text-white px-2 py-1 rounded text-sm font-bold">Add</button>
                    </form>
                  )}

                  {myGroupRole === 'owner' && (
                    <button onClick={handleDeleteGroup} className="w-full mt-4 bg-red-600 text-white p-2 rounded text-sm font-bold hover:bg-red-700">
                      Delete Group
                    </button>
                  )}
                </div>
              )}

              {/* CREATE GROUP PANEL */}
              {activeTab === 'GROUP' && showCreateGroup && (
                <form onSubmit={handleCreateGroupSubmit} className="p-3 bg-indigo-50 border-b flex flex-col gap-2 shadow-inner">
                  <input type="text" placeholder="New Group Name" className="border p-1 text-sm rounded w-full" 
                    value={newGroupName} onChange={e => setNewGroupName(e.target.value)} required/>
                  <div className="max-h-20 overflow-y-auto bg-white border rounded p-1 text-xs">
                    <p className="font-semibold text-gray-500 mb-1">Select Members:</p>
                    {users.map(u => (
                      <label key={u.id} className="flex items-center gap-2 mb-1 cursor-pointer">
                        <input type="checkbox" value={u.id} 
                          onChange={(e) => {
                            if (e.target.checked) setSelectedMembers([...selectedMembers, u.id]);
                            else setSelectedMembers(selectedMembers.filter(id => id !== u.id));
                          }}/>
                        @{u.username}
                      </label>
                    ))}
                  </div>
                  <button type="submit" className="bg-indigo-600 text-white py-1 rounded text-sm font-bold mt-1">Create Secure Group</button>
                </form>
              )}

              {/* CHAT VIEWPORT */}
              <div className="flex-1 overflow-y-auto p-3 bg-white">
                {renderConversation()}
                <div ref={messagesEndRef} /> 
              </div>

              {/* MESSAGE INPUT */}
              <form onSubmit={handleSubmit} className="p-2 border-t bg-gray-50 flex gap-2">
                <input type="text" className="border border-gray-300 p-2 rounded flex-1 text-sm focus:outline-none focus:border-blue-500" placeholder="Type secret message..."
                  value={inputText} onChange={(e) => setInputText(e.target.value)} disabled={(activeTab === 'DM' && !selectedUser) || (activeTab === 'GROUP' && !selectedGroup)} />
                <button type="submit" className={`text-white px-4 py-1 rounded font-semibold transition-colors disabled:bg-gray-400 ${activeTab === 'GROUP' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-blue-600 hover:bg-blue-700'}`} disabled={(activeTab === 'DM' && !selectedUser) || (activeTab === 'GROUP' && !selectedGroup)}>
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
// Client-side logic for Gaming Chats App

let socket, user, pfp = "/default-pfp.png";
let currentChannel = "general";
let isMuted = false, localStream = null, pc = null;

// Restore user session
if (localStorage.getItem('username')) {
  user = localStorage.getItem('username');
  pfp = localStorage.getItem('pfp') || "/default-pfp.png";
  showApp();
}

// --- Auth/Register/Login logic ---
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const authDiv = document.getElementById('auth');
const appDiv = document.getElementById('main-app');
const logoutBtn = document.getElementById('logout-btn');

registerForm.onsubmit = async (e) => {
  e.preventDefault();
  const username = document.getElementById('register-username').value.trim();
  const password = document.getElementById('register-password').value;
  const pfpFile = document.getElementById('register-pfp').files[0];
  const avatar = document.getElementById('register-avatar').value;
  let formData = new FormData();
  formData.append('username', username);
  formData.append('password', password);
  if (pfpFile) formData.append('pfp', pfpFile);
  if (avatar) formData.append('avatar', avatar);
  document.getElementById('register-error').textContent = '';
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) {
      document.getElementById('register-error').textContent = data.error || 'Register failed.';
      return;
    }
    alert('Registration successful! Please login.');
    registerForm.reset();
  } catch (err) {
    document.getElementById('register-error').textContent = 'Error connecting to server.';
  }
};

loginForm.onsubmit = async (e) => {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  document.getElementById('login-error').textContent = '';
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      document.getElementById('login-error').textContent = data.error || 'Login failed.';
      return;
    }
    user = username;
    pfp = data.pfp || "/default-pfp.png";
    localStorage.setItem('username', user);
    localStorage.setItem('pfp', pfp);
    showApp();
  } catch (err) {
    document.getElementById('login-error').textContent = 'Error connecting to server.';
  }
};

function showApp() {
  authDiv.style.display = 'none';
  appDiv.style.display = 'flex';
  document.getElementById('user-label').textContent = user;
  document.getElementById('pfp').src = pfp;
  logoutBtn.style.display = '';
  logoutBtn.onclick = () => {
    localStorage.clear();
    location.reload();
  };
  initChatApp();
}

// --- Main Chat App Logic ---
function initChatApp() {
  socket = io();
  socket.emit('login', { username: user });

  // Channel navigation
  socket.on('channels', chs => {
    const channelsDiv = document.getElementById('channels');
    channelsDiv.innerHTML = '';
    chs.forEach(ch => {
      const div = document.createElement('div');
      div.className = 'channel' + (ch.id === currentChannel ? ' active' : '');
      div.textContent = ch.name;
      div.onclick = () => {
        if (currentChannel !== ch.id) {
          currentChannel = ch.id;
          document.querySelectorAll('.channel').forEach(c => c.classList.remove('active'));
          div.classList.add('active');
          document.getElementById('messages').innerHTML = '';
          socket.emit('join', currentChannel);
        }
      };
      channelsDiv.appendChild(div);
    });
  });

  socket.on('joined', (channel) => {
    currentChannel = channel;
    document.getElementById('messages').innerHTML = '';
  });

  // Messaging
  document.getElementById('msg-form').onsubmit = (e) => {
    e.preventDefault();
    sendMessage();
  };
  document.getElementById('msg').addEventListener('keydown', e => {
    if (e.key === 'Enter') sendMessage();
  });

  function sendMessage() {
    const text = document.getElementById('msg').value.trim();
    if (!text) return;
    // Chatbot channel
    if (currentChannel === "chatbot") {
      fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, username: user })
      }).then(res => res.json()).then(data => {
        addMessage({ user: "Chatbot", text: data.text, pfp: "/avatars/chatbot.png", isBot: true });
      });
    }
    socket.emit('message', { channel: currentChannel, user, text, pfp });
    addMessage({ user, text, pfp, isAdmin: (user === "BredXD") });
    document.getElementById('msg').value = '';
  }

  socket.on('message', ({ user: from, text, pfp, isAdmin }) => {
    addMessage({ user: from, text, pfp, isAdmin });
  });

  function addMessage({ user, text, pfp, isAdmin, isBot }) {
    const div = document.createElement('div');
    div.className = 'msg';
    const img = document.createElement('img');
    img.src = pfp || "/default-pfp.png";
    img.className = 'pfp';
    div.appendChild(img);
    const uname = document.createElement('span');
    uname.className = 'user';
    uname.textContent = user;
    div.appendChild(uname);
    if (isAdmin) {
      const crown = document.createElement('span');
      crown.className = 'crown';
      crown.innerHTML = '👑';
      div.appendChild(crown);
    }
    if (isBot) {
      const bot = document.createElement('span');
      bot.className = 'bot';
      bot.textContent = ' 🤖';
      div.appendChild(bot);
    }
    const msg = document.createElement('span');
    msg.textContent = ": " + text;
    div.appendChild(msg);
    document.getElementById('messages').appendChild(div);
    document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
  }

  // Image sending
  document.getElementById('img-btn').onclick = () => {
    document.getElementById('file-input').click();
  };
  document.getElementById('file-input').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    let formData = new FormData();
    formData.append('image', file);
    const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.url) {
      socket.emit('image', { channel: currentChannel, user, imageUrl: data.url, pfp });
      addImage({ user, imageUrl: data.url, pfp });
    }
    e.target.value = '';
  };

  socket.on('image', ({ user: from, imageUrl, pfp }) => {
    addImage({ user: from, imageUrl, pfp });
  });

  function addImage({ user, imageUrl, pfp }) {
    const div = document.createElement('div');
    div.className = 'msg';
    const img = document.createElement('img');
    img.src = pfp || "/default-pfp.png";
    img.className = 'pfp';
    div.appendChild(img);
    const uname = document.createElement('span');
    uname.className = 'user';
    uname.textContent = user;
    div.appendChild(uname);
    if (user === "BredXD") {
      const crown = document.createElement('span');
      crown.className = 'crown';
      crown.innerHTML = '👑';
      div.appendChild(crown);
    }
    const imgMsg = document.createElement('img');
    imgMsg.src = imageUrl;
    imgMsg.className = 'chat-image';
    div.appendChild(imgMsg);
    document.getElementById('messages').appendChild(div);
    document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
  }

  // --- Voice Chat (WebRTC) ---
  document.getElementById('start-voice-btn').onclick = async () => {
    if (pc) return;
    pc = new RTCPeerConnection();
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    pc.ontrack = event => {
      document.getElementById('remoteAudio').srcObject = event.streams[0];
    };
    pc.onicecandidate = e => {
      if (e.candidate) socket.emit('signal', { channel: currentChannel, data: { candidate: e.candidate } });
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('signal', { channel: currentChannel, data: { desc: pc.localDescription } });
    document.getElementById('start-voice-btn').style.display = 'none';
    document.getElementById('leave-voice-btn').style.display = '';
    document.getElementById('mute-btn').style.display = '';
    document.getElementById('unmute-btn').style.display = 'none';
    isMuted = false;
  };

  document.getElementById('leave-voice-btn').onclick = () => {
    if (pc) {
      pc.close();
      pc = null;
      document.getElementById('remoteAudio').srcObject = null;
    }
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
    document.getElementById('start-voice-btn').style.display = '';
    document.getElementById('leave-voice-btn').style.display = 'none';
    document.getElementById('mute-btn').style.display = 'none';
    document.getElementById('unmute-btn').style.display = 'none';
  };

  document.getElementById('mute-btn').onclick = () => {
    if (localStream) {
      localStream.getAudioTracks()[0].enabled = false;
      isMuted = true;
      document.getElementById('mute-btn').style.display = 'none';
      document.getElementById('unmute-btn').style.display = '';
    }
  };
  document.getElementById('unmute-btn').onclick = () => {
    if (localStream) {
      localStream.getAudioTracks()[0].enabled = true;
      isMuted = false;
      document.getElementById('mute-btn').style.display = '';
      document.getElementById('unmute-btn').style.display = 'none';
    }
  };

  socket.on('signal', async data => {
    if (!pc) {
      pc = new RTCPeerConnection();
      pc.ontrack = event => {
        document.getElementById('remoteAudio').srcObject = event.streams[0];
      };
      pc.onicecandidate = e => {
        if (e.candidate) socket.emit('signal', { channel: currentChannel, data: { candidate: e.candidate } });
      };
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }
    if (data.desc) {
      await pc.setRemoteDescription(data.desc);
      if (data.desc.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal', { channel: currentChannel, data: { desc: pc.localDescription } });
      }
    } else if (data.candidate) {
      await pc.addIceCandidate(data.candidate);
    }
  });
}
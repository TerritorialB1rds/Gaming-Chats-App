const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Filter = require('bad-words');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

// ==== Server Setup ====
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const filter = new Filter();

app.use(express.static(path.join(__dirname, '../client')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const usersFile = path.join(__dirname, 'users.json');
const bansFile = path.join(__dirname, 'bans.json');
const uploadsDir = path.join(__dirname, '../client/uploads/');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ==== Storage for uploads ====
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  },
});
const upload = multer({ storage });

// ==== Helper: Read/Write JSON ====
function readJSON(file, fallback = []) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ==== Users & Bans ====
function readUsers() {
  return readJSON(usersFile, []);
}
function writeUsers(users) {
  writeJSON(usersFile, users);
}
function readBans() {
  return readJSON(bansFile, []);
}
function writeBans(bans) {
  writeJSON(bansFile, bans);
}

// ==== Auth APIs ====
app.post('/api/register', upload.single('pfp'), async (req, res) => {
  const { username, password } = req.body;
  let pfp = req.file ? `/uploads/${req.file.filename}` : (req.body.avatar || '/default-pfp.png');
  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    !username.trim() ||
    !password.trim()
  ) return res.status(400).json({ error: 'Username and password required.' });

  const users = readUsers();
  if (users.find(u => u.username === username)) {
    return res.status(409).json({ error: 'Username already exists.' });
  }
  const hash = await bcrypt.hash(password, 10);
  users.push({ username, password: hash, pfp });
  writeUsers(users);
  res.json({ success: true });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const bans = readBans();
  if (bans.includes(username)) return res.status(403).json({ error: 'Account banned.' });
  const users = readUsers();
  const user = users.find(u => u.username === username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials.' });
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: 'Invalid credentials.' });
  res.json({ success: true, pfp: user.pfp });
});

app.post('/api/upload-pfp', upload.single('pfp'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  res.json({ pfp: `/uploads/${req.file.filename}` });
});

// Ban/unban endpoints (admin only)
app.post('/api/ban', (req, res) => {
  const { username, admin } = req.body;
  if (admin !== 'BredXD') return res.status(403).json({ error: 'Not authorized.' });
  const bans = readBans();
  if (!bans.includes(username)) bans.push(username);
  writeBans(bans);
  res.json({ success: true });
});
app.post('/api/unban', (req, res) => {
  const { username, admin } = req.body;
  if (admin !== 'BredXD') return res.status(403).json({ error: 'Not authorized.' });
  let bans = readBans();
  bans = bans.filter(b => b !== username);
  writeBans(bans);
  res.json({ success: true });
});

// ==== Image Upload for Chat ====
app.post('/api/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// ==== Serve uploads ====
app.use('/uploads', express.static(uploadsDir));

// ==== Chatbot (Simple AI) ====
app.post('/api/chatbot', async (req, res) => {
  const { prompt, username } = req.body;
  // Simple AI: echo or canned response
  // You can later integrate OpenAI API or other AI services
  let response = "Hello! I'm Chatbot. How can I help you today?";
  if (prompt && prompt.toLowerCase().includes('hello')) response = `Hi ${username}! 👋`;
  else if (prompt && prompt.length > 100) response = "That's a long message! Can you summarize?";
  else if (prompt) response = `You said: "${prompt}"`;
  res.json({ text: response });
});

// ==== Channel List ====
const channels = [
  { id: "general", name: "#general" },
  { id: "game-updates", name: "#game-updates" },
  { id: "random", name: "#random" },
  { id: "chatbot", name: "#chatbot" },
];

// ==== SOCKET.IO ====
const userSockets = {}; // { username: socket.id }
io.on('connection', (socket) => {
  let username, currentChannel = "general";
  
  socket.on('login', (user) => {
    username = user.username;
    userSockets[username] = socket.id;
    socket.join(currentChannel);
    socket.emit('channels', channels);
  });

  socket.on('join', (channelId) => {
    if (currentChannel) socket.leave(currentChannel);
    currentChannel = channelId;
    socket.join(currentChannel);
    socket.emit('joined', currentChannel);
  });

  socket.on('message', ({ channel, user, text, pfp }) => {
    if (readBans().includes(user)) return;
    // Swear filter
    const clean = filter.clean(text || "");
    // Crown logic
    const isAdmin = user === "BredXD";
    io.to(channel).emit('message', { user, text: clean, pfp, isAdmin });
  });

  socket.on('image', ({ channel, user, imageUrl, pfp }) => {
    if (readBans().includes(user)) return;
    io.to(channel).emit('image', { user, imageUrl, pfp });
  });

  // DMs: send to specific user
  socket.on('dm', ({ to, from, text, pfp }) => {
    if (readBans().includes(from)) return;
    const toSocketId = userSockets[to];
    if (toSocketId) {
      io.to(toSocketId).emit('dm', { from, text, pfp });
    }
  });

  // Voice signaling (WebRTC)
  socket.on('signal', ({ channel, data }) => {
    socket.to(channel).emit('signal', data);
  });

  socket.on('disconnect', () => {
    if (username) delete userSockets[username];
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
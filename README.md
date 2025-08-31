# Gaming Chats App

A Discord-inspired, all-ages chat web app with:
- Swear filter & account bans for rule-breaking
- Custom login/signup (no OAuth)
- Custom profile pictures (upload or avatar select)
- Channels (including #general)
- DMs
- Voice chat with mute/unmute
- Image sending (no size limit)
- Chatbot AI in #chatbot channel
- Admin "BredXD" with crown icon
- Top bar with favicon and logout

## Quick Start

1. `cd server && npm install`
2. `node server.js`
3. Open `client/index.html` (or `http://localhost:3000`)

## Project Structure

- `server/` — Node.js backend (Express, Socket.IO, authentication, image/PFP upload, bans, AI bot)
- `client/` — Frontend (HTML/CSS/JS, favicon, chat UI)

---
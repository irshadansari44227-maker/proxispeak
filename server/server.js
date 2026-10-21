
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
    ],
    methods: ['GET', 'POST'],
  },
});

// Connected browser users and their positions
const users = new Map();
const PROXIMITY_DISTANCE = 18;

app.get('/', (req, res) => {
  res.send('ProxiSpeak backend is running!');
});

// Broadcast positions and calculate nearby users
function broadcastPositions() {
  const allPositions = Array.from(users.values());

  io.emit('all-positions', allPositions);

  const nearbyPairs = [];

  for (let i = 0; i < allPositions.length; i++) {
    for (let j = i + 1; j < allPositions.length; j++) {
      const a = allPositions[i];
      const b = allPositions[j];

      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= PROXIMITY_DISTANCE) {
        nearbyPairs.push({
          userA: a.id,
          userB: b.id,
          distance: Number(distance.toFixed(2)),
        });
      }
    }
  }

  io.emit('nearby-users', nearbyPairs);
}

io.on('connection', socket => {
  console.log('Connected:', socket.id);

  socket.emit('all-positions', Array.from(users.values()));

  // Register browser identity
  socket.on('register-user', data => {
    const name =
      typeof data?.name === 'string'
        ? data.name.trim().slice(0, 50)
        : '';

    if (!name) return;

    const existing = users.get(socket.id);

    users.set(socket.id, {
      id: socket.id,
      name,
      x: existing?.x ?? 50,
      y: existing?.y ?? 50,
    });

    console.log('Registered:', name, socket.id);
    broadcastPositions();
  });

  // Update the current user's position
  socket.on('avatar-move', data => {
    const existing = users.get(socket.id);
    if (!existing) return;

    const x = Number(data?.x);
    const y = Number(data?.y);

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < 0 || x > 100 ||
      y < 0 || y > 100
    ) {
      return;
    }

    users.set(socket.id, {
      ...existing,
      x,
      y,
    });

    broadcastPositions();
  });

  // Forward WebRTC signaling messages to the target browser
  const signalingEvents = [
    'webrtc-offer',
    'webrtc-answer',
    'webrtc-ice-candidate',
  ];

  signalingEvents.forEach(eventName => {
    socket.on(eventName, data => {
      if (!data || typeof data.target !== 'string') return;
      if (data.target === socket.id) return;

      const targetSocket = io.sockets.sockets.get(data.target);
      if (!targetSocket) return;

      const payload = { ...data, from: socket.id };
      delete payload.target;

      targetSocket.emit(eventName, payload);
    });
  });

  // Remove disconnected browser
  socket.on('disconnect', () => {
    const user = users.get(socket.id);

    console.log(
      'Disconnected:',
      user?.name || socket.id
    );

    users.delete(socket.id);
    broadcastPositions();
  });
});

const PORT = 5000;

server.listen(PORT, () => {
  console.log(`ProxiSpeak server running on port ${PORT}`);
});


require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const Avatar = require('./models/Avatar');
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

const users = new Map();
const PROXIMITY_DISTANCE = 32;

// MongoDB connection
async function connectDatabase() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI missing in server/.env');
    return;
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });

    console.log('MongoDB Atlas connected successfully!');
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
  }
}

app.get('/', (req, res) => {
  res.send('ProxiSpeak backend is running!');
});

function broadcastPositions() {
  const positions = Array.from(users.values());

  io.emit('all-positions', positions);

  const nearbyPairs = [];

  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const a = positions[i];
      const b = positions[j];

      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distance = Math.hypot(dx, dy);

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
    if (mongoose.connection.readyState === 1) {
  const user = users.get(socket.id);

  Avatar.findOneAndUpdate(
    { socketId: socket.id },
    {
      socketId: socket.id,
      name: user.name,
      x: user.x,
      y: user.y,
      position: {
        type: 'Point',
        coordinates: [user.x, user.y],
      },
    },
    { upsert: true, new: true, runValidators: true }
  ).catch(error => {
    console.error('Avatar registration save failed:', error.message);
  });
}
    broadcastPositions();
  });

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
    if (mongoose.connection.readyState === 1) {
  Avatar.findOneAndUpdate(
    { socketId: socket.id },
    {
      x,
      y,
      position: {
        type: 'Point',
        coordinates: [x, y],
      },
    },
    { runValidators: true }
  ).catch(error => {
    console.error('Avatar movement save failed:', error.message);
  });
}

    broadcastPositions();
  });

  // WebRTC voice signaling
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

      if (!targetSocket) {
        console.log('Signaling target not connected:', data.target);
        return;
      }

      const payload = { ...data, from: socket.id };
      delete payload.target;

      targetSocket.emit(eventName, payload);
    });
  });

  socket.on('disconnect', () => {
    const user = users.get(socket.id);

    console.log('Disconnected:', user?.name || socket.id);

    users.delete(socket.id);
    broadcastPositions();
  });
});

const PORT = Number(process.env.PORT) || 5000;

server.listen(PORT, () => {
  console.log(`ProxiSpeak server running on port ${PORT}`);
});

connectDatabase();

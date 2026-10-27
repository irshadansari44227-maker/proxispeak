
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

async function connectDatabase() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI missing in server/.env');
    return;
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });

    await Avatar.init();

    console.log('MongoDB Atlas connected successfully!');
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
  }
}

app.get('/', (req, res) => {
  res.send('ProxiSpeak backend is running!');
});

function calculateNearbyPairs(positions) {
  const nearbyPairs = [];

  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const a = positions[i];
      const b = positions[j];

      const distance = Math.hypot(
        a.x - b.x,
        a.y - b.y
      );

      if (distance <= PROXIMITY_DISTANCE) {
        nearbyPairs.push({
          userA: a.id,
          userB: b.id,
          distance: Number(distance.toFixed(2)),
        });
      }
    }
  }

  return nearbyPairs;
}

function broadcastPositions() {
  const positions = Array.from(users.values());

  io.emit('all-positions', positions);
  io.emit('nearby-users', calculateNearbyPairs(positions));
}

async function saveAvatar(user) {
  if (mongoose.connection.readyState !== 1) return;

  try {
    await Avatar.findOneAndUpdate(
      { socketId: user.id },
      {
        $set: {
          name: user.name,
          x: user.x,
          y: user.y,
          position: {
            type: 'Point',
            coordinates: [user.x, user.y],
          },
        },
      },
      {
        upsert: true,
        runValidators: true,
      }
    );
  } catch (error) {
    console.error('Avatar save failed:', error.message);
  }
}

async function findNearbyFromDatabase(socketId) {
  const currentUser = users.get(socketId);

  if (!currentUser) return [];

  const activeSocketIds = Array.from(users.keys());

  if (mongoose.connection.readyState !== 1) {
    return calculateNearbyPairs(
      Array.from(users.values())
    ).filter(
      pair =>
        pair.userA === socketId ||
        pair.userB === socketId
    );
  }

  try {
    const avatars = await Avatar.find({
      socketId: { $in: activeSocketIds },
    })
      .select('socketId name x y')
      .lean();

    const nearby = [];

    for (const avatar of avatars) {
      if (avatar.socketId === socketId) continue;

      const distance = Math.hypot(
        currentUser.x - avatar.x,
        currentUser.y - avatar.y
      );

      if (distance <= PROXIMITY_DISTANCE) {
        nearby.push({
          id: avatar.socketId,
          name: avatar.name,
          distance: Number(distance.toFixed(2)),
        });
      }
    }

    return nearby;
  } catch (error) {
    console.error('Database proximity query failed:', error.message);
    return [];
  }
}

// API for testing database-based proximity detection
app.get('/api/nearby/:socketId', async (req, res) => {
  const socketId = req.params.socketId;

  if (!users.has(socketId)) {
    return res.status(404).json({
      error: 'User is not currently connected',
    });
  }

  const nearby = await findNearbyFromDatabase(socketId);

  res.json({
    socketId,
    threshold: PROXIMITY_DISTANCE,
    nearby,
  });
});

io.on('connection', socket => {
  console.log('Connected:', socket.id);

  socket.emit(
    'all-positions',
    Array.from(users.values())
  );

  socket.on('register-user', async data => {
    const name =
      typeof data?.name === 'string'
        ? data.name.trim().slice(0, 50)
        : '';

    if (!name) return;

    const existing = users.get(socket.id);

    const user = {
      id: socket.id,
      name,
      x: existing?.x ?? 50,
      y: existing?.y ?? 50,
    };

    users.set(socket.id, user);

    console.log('Registered:', name, socket.id);

    broadcastPositions();

    await saveAvatar(user);
  });

  socket.on('avatar-move', async data => {
    const existing = users.get(socket.id);

    if (!existing) return;

    const x = Number(data?.x);
    const y = Number(data?.y);

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < 0 ||
      x > 100 ||
      y < 0 ||
      y > 100
    ) {
      return;
    }

    const updatedUser = {
      ...existing,
      x,
      y,
    };

    users.set(socket.id, updatedUser);

    broadcastPositions();

    await saveAvatar(updatedUser);
  });

  // Preserve WebRTC signaling
  const signalingEvents = [
    'webrtc-offer',
    'webrtc-answer',
    'webrtc-ice-candidate',
  ];

  signalingEvents.forEach(eventName => {
    socket.on(eventName, data => {
      if (!data || typeof data.target !== 'string') {
        return;
      }

      if (data.target === socket.id) return;

      const targetSocket =
        io.sockets.sockets.get(data.target);

      if (!targetSocket) {
        console.log(
          'Signaling target not connected:',
          data.target
        );
        return;
      }

      const payload = {
        ...data,
        from: socket.id,
      };

      delete payload.target;

      targetSocket.emit(eventName, payload);
    });
  });

  socket.on('disconnect', async () => {
    const user = users.get(socket.id);

    console.log(
      'Disconnected:',
      user?.name || socket.id
    );

    users.delete(socket.id);

    broadcastPositions();

    if (mongoose.connection.readyState === 1) {
      try {
        await Avatar.deleteOne({
          socketId: socket.id,
        });

        console.log(
          'Disconnected avatar removed from MongoDB'
        );
      } catch (error) {
        console.error(
          'Avatar cleanup failed:',
          error.message
        );
      }
    }
  });
});

const PORT = Number(process.env.PORT) || 5000;

server.listen(PORT, () => {
  console.log(
    `ProxiSpeak server running on port ${PORT}`
  );
});

connectDatabase();

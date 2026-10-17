
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

// Har connected browser ki position store hogi
const positions = new Map();

// Nearby distance in percentage-based office coordinates
const PROXIMITY_DISTANCE = 18;

app.get('/', (req, res) => {
  res.send('ProxiSpeak backend is running!');
});

// Connected users ki positions aur nearby pairs broadcast karo
function broadcastPositions() {
  const allPositions = Array.from(positions.values());
  io.emit('all-positions', allPositions);

  const nearbyPairs = [];

  for (let i = 0; i < allPositions.length; i++) {
    for (let j = i + 1; j < allPositions.length; j++) {
      const userA = allPositions[i];
      const userB = allPositions[j];

      const dx = userA.x - userB.x;
      const dy = userA.y - userB.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= PROXIMITY_DISTANCE) {
        nearbyPairs.push({
          userA: userA.id,
          userB: userB.id,
          distance: Number(distance.toFixed(2)),
        });
      }
    }
  }

  io.emit('nearby-users', nearbyPairs);
}

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  // Naye browser ko existing positions bhejo
  socket.emit('all-positions', Array.from(positions.values()));

  socket.on('avatar-move', (data) => {
    const x = Number(data?.x);
    const y = Number(data?.y);

    // Invalid positions reject karo
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < 0 || x > 100 ||
      y < 0 || y > 100
    ) {
      return;
    }

    positions.set(socket.id, {
      id: socket.id,
      x,
      y,
    });

    console.log('Avatar moved:', socket.id, { x, y });

    broadcastPositions();
  });

  socket.on('disconnect', () => {
    positions.delete(socket.id);

    console.log('Disconnected:', socket.id);

    // Disconnected browser ko hata kar fresh data bhejo
    broadcastPositions();
  });
});

const PORT = 5000;

server.listen(PORT, () => {
  console.log(`ProxiSpeak server running on port ${PORT}`);
});

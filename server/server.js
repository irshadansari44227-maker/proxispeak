
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
    origin: ['http://localhost:5173', 'http://localhost:5174'],
    methods: ['GET', 'POST'],
  },
});

const positions = new Map();

app.get('/', (req, res) => {
  res.send('ProxiSpeak backend is running!');
});

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  socket.emit('all-positions', Array.from(positions.values()));

  socket.on('avatar-move', (data) => {
    const position = {
      id: socket.id,
      x: Number(data.x),
      y: Number(data.y),
    };

    positions.set(socket.id, position);
    io.emit('all-positions', Array.from(positions.values()));
  });

  socket.on('disconnect', () => {
    positions.delete(socket.id);
    io.emit('all-positions', Array.from(positions.values()));
    console.log('Disconnected:', socket.id);
  });
});

const PORT = 5000;

server.listen(PORT, () => {
  console.log(`ProxiSpeak server running on port ${PORT}`);
});
  
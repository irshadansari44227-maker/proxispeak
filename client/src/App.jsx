import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const SERVER_URL = 'http://localhost:5000';
const PROXIMITY_DISTANCE = 32;

const TEAM = [
  { id: 1, name: 'Irshad Ansari', role: 'Frontend Developer', x: 16, y: 25, color: '#8057f5' },
  { id: 2, name: 'Mohd Aman Choudhary', role: 'Team Member', x: 38, y: 45, color: '#08a5e8' },
  { id: 3, name: 'Akshaya Rajendran', role: 'Team Member', x: 62, y: 25, color: '#f59e0b' },
  { id: 4, name: 'Ankush pateel B V', role: 'Team Member', x: 78, y: 55, color: '#16a085' },
];

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export default function App() {
  const [selectedName, setSelectedName] = useState(TEAM[0].name);
  const [connected, setConnected] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [positions, setPositions] = useState([]);
  const [nearbyIds, setNearbyIds] = useState([]);
  const [notice, setNotice] = useState('Connect to the office to get started.');
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [localOffsets, setLocalOffsets] = useState({});

  const socketRef = useRef(null);
  const streamRef = useRef(null);
  const peersRef = useRef(new Map());
  const pendingIceRef = useRef(new Map());
  const nearbyRef = useRef(new Set());
  const micOnRef = useRef(false);
  const selectedRef = useRef(selectedName);
  const positionsRef = useRef([]);
  const audioRefs = useRef(new Map());

  useEffect(() => {
    selectedRef.current = selectedName;
  }, [selectedName]);

  const closePeer = useCallback((peerId) => {
    const pc = peersRef.current.get(peerId);

    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
      peersRef.current.delete(peerId);
    }

    pendingIceRef.current.delete(peerId);
    audioRefs.current.delete(peerId);
  }, []);

  const closeAllPeers = useCallback(() => {
    for (const peerId of [...peersRef.current.keys()]) {
      closePeer(peerId);
    }
  }, [closePeer]);

  const createPeer = useCallback((peerId) => {
    const existing = peersRef.current.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
      ],
    });

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, streamRef.current);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit('webrtc-ice-candidate', {
          target: peerId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      const remoteStream = event.streams?.[0];
      if (!remoteStream) return;

      setRemoteStreams((current) => {
        const filtered = current.filter((item) => item.id !== peerId);
        return [...filtered, { id: peerId, stream: remoteStream }];
      });

      const audio = audioRefs.current.get(peerId);

      if (audio && audio.srcObject !== remoteStream) {
        audio.srcObject = remoteStream;
        audio.play().catch(() => {
          setNotice('Audio blocked by browser. Check browser sound permissions.');
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setNotice('Voice connection established with a nearby teammate.');
      }

      if (pc.connectionState === 'connecting') {
        setNotice('Nearby teammate found. Connecting voice...');
      }

      if (['failed', 'closed'].includes(pc.connectionState)) {
        console.warn(
          'Voice peer connection state:',
          peerId,
          pc.connectionState
        );

        if (pc.connectionState === 'failed') {
          setNotice('Voice connection failed. Check both microphones and try again.');
        }

        if (pc.connectionState === 'failed') {
          closePeer(peerId);
          setRemoteStreams((current) =>
            current.filter((item) => item.id !== peerId)
          );
        }
      }
    };

    peersRef.current.set(peerId, pc);
    return pc;
  }, [closePeer]);

  const startOffer = useCallback(async (peerId) => {
    const socket = socketRef.current;

    if (!socket || !socket.id || !micOnRef.current) return;
    if (!nearbyRef.current.has(peerId)) return;

    // One browser initiates to avoid both browsers creating offers together.
    if (socket.id.localeCompare(peerId) >= 0) return;

    let pc = peersRef.current.get(peerId);

    if (pc && pc.signalingState !== 'stable') return;
    if (!pc) pc = createPeer(peerId);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit('webrtc-offer', {
        target: peerId,
        offer: pc.localDescription,
      });
    } catch (error) {
      console.error('Could not create voice offer:', error);
      setNotice('Could not start voice connection. Please try again.');
    }
  }, [createPeer]);

  useEffect(() => {
    const socket = io(SERVER_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setNotice('Connected to the ProxiSpeak server.');

      const member =
        TEAM.find((item) => item.name === selectedRef.current) || TEAM[0];

      socket.emit('register-user', { name: member.name });
      socket.emit('avatar-move', { x: member.x, y: member.y });
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
      setNotice('Cannot connect to server. Check that backend is running on port 5000.');
    });

    socket.on('disconnect', () => {
      setConnected(false);
      closeAllPeers();
      setRemoteStreams([]);
      setNotice('Server disconnected. Reconnecting...');
    });

    socket.on('all-positions', (allPositions) => {
      const validPositions = Array.isArray(allPositions)
        ? allPositions
        : [];

      positionsRef.current = validPositions;
      setPositions(validPositions);
    });

    socket.on('nearby-users', (pairs) => {
      const ownId = socket.id;
      const nextNearby = new Set();

      for (const pair of Array.isArray(pairs) ? pairs : []) {
        if (pair.userA === ownId) nextNearby.add(pair.userB);
        if (pair.userB === ownId) nextNearby.add(pair.userA);
      }

      const previous = nearbyRef.current;
      nearbyRef.current = nextNearby;
      setNearbyIds([...nextNearby]);

      if (nextNearby.size > 0) {
        setNotice(
          micOnRef.current
            ? 'Nearby teammate detected. Starting voice connection...'
            : 'Nearby teammate detected. Turn on the microphone to test voice.'
        );
      }

      for (const oldId of previous) {
        if (!nextNearby.has(oldId)) {
          closePeer(oldId);
          setRemoteStreams((current) =>
            current.filter((item) => item.id !== oldId)
          );
        }
      }

      for (const peerId of nextNearby) {
        if (!previous.has(peerId) && micOnRef.current) {
          void startOffer(peerId);
        }
      }
    });

    socket.on('webrtc-offer', async ({ from, offer }) => {
      if (!from || !offer || !nearbyRef.current.has(from)) return;

      try {
        let pc = peersRef.current.get(from);

        if (pc && pc.signalingState !== 'stable') {
          closePeer(from);
          pc = null;
        }

        if (!pc) pc = createPeer(from);

        await pc.setRemoteDescription(offer);

        const queued = pendingIceRef.current.get(from) || [];

        for (const candidate of queued) {
          await pc.addIceCandidate(candidate);
        }

        pendingIceRef.current.delete(from);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('webrtc-answer', {
          target: from,
          answer: pc.localDescription,
        });
      } catch (error) {
        console.error('Could not answer voice offer:', error);
        setNotice('Could not answer voice connection. Try turning the mic off and on.');
      }
    });

    socket.on('webrtc-answer', async ({ from, answer }) => {
      const pc = peersRef.current.get(from);
      if (!pc || !answer) return;

      try {
        await pc.setRemoteDescription(answer);

        const queued = pendingIceRef.current.get(from) || [];

        for (const candidate of queued) {
          await pc.addIceCandidate(candidate);
        }

        pendingIceRef.current.delete(from);
      } catch (error) {
        console.error('Could not apply voice answer:', error);
      }
    });

    socket.on('webrtc-ice-candidate', async ({ from, candidate }) => {
      if (!from || !candidate) return;

      const pc = peersRef.current.get(from);

      if (pc?.remoteDescription) {
        try {
          await pc.addIceCandidate(candidate);
        } catch (error) {
          console.warn('ICE candidate could not be added:', error);
        }
      } else {
        const queued = pendingIceRef.current.get(from) || [];
        queued.push(candidate);
        pendingIceRef.current.set(from, queued);
      }
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      closeAllPeers();

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      micOnRef.current = false;
      socketRef.current = null;
    };
  }, [closeAllPeers, closePeer, createPeer, startOffer]);

  useEffect(() => {
    if (!connected || !socketRef.current) return;

    const member = TEAM.find((item) => item.name === selectedName) || TEAM[0];

    socketRef.current.emit('register-user', { name: member.name });
    socketRef.current.emit('avatar-move', { x: member.x, y: member.y });

    closeAllPeers();
    setRemoteStreams([]);
  }, [selectedName, connected, closeAllPeers]);

  const toggleMicrophone = async () => {
    if (micOnRef.current) {
      micOnRef.current = false;
      setMicOn(false);

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      closeAllPeers();
      setRemoteStreams([]);
      setNotice('Microphone is off.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      streamRef.current = stream;
      micOnRef.current = true;
      setMicOn(true);

      setNotice(
        'Microphone is on. Move close to a teammate to test voice chat.'
      );

      for (const peerId of nearbyRef.current) {
        void startOffer(peerId);
      }
    } catch (error) {
      console.error('Microphone permission failed:', error);

      setNotice(
        'Microphone permission denied or unavailable. Allow microphone access in your browser.'
      );
    }
  };

  const moveAvatar = (member) => {
    if (member.name !== selectedName) {
      setNotice('Select your identity first, then click your own avatar to move.');
      return;
    }

    const socketId = socketRef.current?.id;

    const currentPosition =
      positionsRef.current.find((item) => item.id === socketId) ||
      positions.find((item) => item.name === selectedName) ||
      member;

    const otherUsers = positionsRef.current.filter(
      (item) => item.id !== socketId
    );

    let nextX;
    let nextY;

    if (otherUsers.length > 0) {
      const target = otherUsers.reduce((nearest, candidate) =>
        distanceBetween(currentPosition, candidate) <
        distanceBetween(currentPosition, nearest)
          ? candidate
          : nearest
      );

      const dx = target.x - currentPosition.x;
      const dy = target.y - currentPosition.y;
      const distance = Math.hypot(dx, dy);
      const step = Math.min(10, distance);

      if (distance > 0) {
        nextX = currentPosition.x + (dx / distance) * step;
        nextY = currentPosition.y + (dy / distance) * step;
      } else {
        nextX = currentPosition.x;
        nextY = currentPosition.y;
      }
    } else {
      nextX = currentPosition.x + (Math.random() * 10 - 5);
      nextY = currentPosition.y + (Math.random() * 10 - 5);
    }

    const updated = {
      ...member,
      x: Math.max(2, Math.min(98, nextX)),
      y: Math.max(5, Math.min(90, nextY)),
    };

    positionsRef.current = positionsRef.current.map((item) =>
      item.id === socketId ? { ...item, x: updated.x, y: updated.y } : item
    );

    socketRef.current?.emit('avatar-move', {
      x: updated.x,
      y: updated.y,
    });

    setLocalOffsets((current) => ({
      ...current,
      [member.name]: { x: updated.x, y: updated.y },
    }));

    setNotice(
      otherUsers.length > 0
        ? 'Moving toward the nearest connected browser. Click your avatar again if needed.'
        : 'No second browser connected yet. Open another browser and enable its microphone.'
    );
  };

  const displayedMembers = TEAM.map((member) => ({
    ...member,
    ...(localOffsets[member.name] || {}),
  }));

  const ownPosition = positions.find(
    (item) => item.id === socketRef.current?.id
  );

  const nearbyNames = positions.filter(
    (item) => nearbyIds.includes(item.id)
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">P</div>
          <div>
            <h1>ProxiSpeak</h1>
            <p>Geospatial Proximity Audio</p>
          </div>
        </div>

        <div className="server-status">
          <span
            className={connected ? 'status-dot online' : 'status-dot'}
          />
          {connected ? 'Office online' : 'Connecting...'}
        </div>
      </header>

      <section className="voice-panel">
        <div>
          <h2>Proximity Voice</h2>
          <p>{notice}</p>
        </div>

        <button
          className={micOn ? 'mic-button active' : 'mic-button'}
          onClick={toggleMicrophone}
          disabled={!connected}
        >
          {micOn ? '🎙️ Turn microphone off' : '🎙️ Enable microphone'}
        </button>
      </section>

      <section className="workspace">
        <div className="workspace-heading">
          <div>
            <h2>Virtual Office</h2>
            <p>Choose your identity, then move near a teammate.</p>
          </div>

          <label className="identity-picker">
            Your identity
            <select
              value={selectedName}
              onChange={(event) => setSelectedName(event.target.value)}
            >
              {TEAM.map((member) => (
                <option key={member.id} value={member.name}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="office-floor">
          <div className="floor-grid" />

          <div className="office-zone-label">VIRTUAL OFFICE</div>

          <div className="office-desk desk-one">
            <span className="desk-icon">▤</span>
            <span>DESK 01</span>
          </div>

          <div className="office-desk desk-two">
            <span className="desk-icon">▤</span>
            <span>DESK 02</span>
          </div>

          <div className="office-desk desk-three">
            <span className="desk-icon">▤</span>
            <span>DESK 03</span>
          </div>

          <div className="meeting-room">
            <div className="meeting-room-title">MEETING ROOM</div>
            <div className="meeting-table">
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>

          {displayedMembers.map((member) => {
            const isYou = member.name === selectedName;

            const online = positions.some(
              (item) => item.name === member.name
            );

            const nearby = nearbyNames.some(
              (item) => item.name === member.name
            );

            return (
              <button
                key={member.id}
                className={`avatar-card ${isYou ? 'selected' : ''} ${nearby ? 'nearby' : ''}`}
                style={{
                  left: `${member.x}%`,
                  top: `${member.y}%`,
                  '--avatar-color': member.color,
                }}
                onClick={() => moveAvatar(member)}
                title={
                  isYou
                    ? 'Click to move your avatar'
                    : 'Demo avatar; select this identity to connect as this teammate'
                }
              >
                <span className="avatar-circle">
                  {member.name
                    .split(' ')
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join('')}
                </span>

                <span className="avatar-name">
                  {isYou ? 'You' : member.name}
                </span>

                <span className="avatar-role">{member.role}</span>

                {nearby && (
                  <span className="nearby-badge">🎙 Nearby</span>
                )}

                {!isYou && online && (
                  <span className="online-badge">Online</span>
                )}
              </button>
            );
          })}

          <div className="floor-caption">
            {ownPosition
              ? `Your position: ${Math.round(ownPosition.x)}, ${Math.round(ownPosition.y)}`
              : 'Your position will appear when connected'}
          </div>
        </div>
      </section>

      <section className="team-panel">
        <div className="team-panel-heading">
          <h2>Your Team · {TEAM.length} Members</h2>
          <span>{positions.length} browser connection(s)</span>
        </div>

        <div className="team-list">
          {TEAM.map((member) => {
            const online = positions.some(
              (item) => item.name === member.name
            );

            const nearby = nearbyNames.some(
              (item) => item.name === member.name
            );

            return (
              <div className="team-row" key={member.id}>
                <span
                  className="team-initial"
                  style={{ background: member.color }}
                >
                  {member.name
                    .split(' ')
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join('')}
                </span>

                <div className="team-info">
                  <strong>{member.name}</strong>
                  <small>{member.role}</small>
                </div>

                <span className={`team-status ${online ? 'is-online' : ''}`}>
                  {nearby ? 'Nearby' : online ? 'Online' : 'Demo'}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="audio-elements" aria-hidden="true">
        {remoteStreams.map(({ id, stream }) => (
          <audio
            key={id}
            autoPlay
            playsInline
            ref={(element) => {
              if (element) {
                audioRefs.current.set(id, element);

                if (element.srcObject !== stream) {
                  element.srcObject = stream;
                }

                element.play().catch(() => {});
              } else {
                audioRefs.current.delete(id);
              }
            }}
          />
        ))}
      </div>
    </main>
  );
}
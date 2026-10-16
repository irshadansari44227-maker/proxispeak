
import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'
import './App.css'

const socket = io('http://localhost:5000')

const initialMembers = [
  { id: 1, name: 'You', role: 'Frontend Developer', x: 21, y: 25, color: '#8057f5' },
  { id: 2, name: 'Aman', role: 'Team Member', x: 49, y: 43, color: '#08a5e8' },
  { id: 3, name: 'Akshaya', role: 'Team Member', x: 72, y: 27, color: '#f59e0b' },
]

function App() {
  const [members, setMembers] = useState(initialMembers)
  const [remotePositions, setRemotePositions] = useState([])
  const [selected, setSelected] = useState(1)
  const [micOn, setMicOn] = useState(false)
  const [connected, setConnected] = useState(socket.connected)

  useEffect(() => {
    function onConnect() {
      setConnected(true)
    }

    function onDisconnect() {
      setConnected(false)
    }

    function onPositions(positions) {
      setRemotePositions(
        positions.filter(position => position.id !== socket.id)
      )
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('all-positions', onPositions)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('all-positions', onPositions)
    }
  }, [])

  function moveAvatar(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.max(4, Math.min(96, ((event.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(8, Math.min(92, ((event.clientY - rect.top) / rect.height) * 100))

    setMembers(current =>
      current.map(member =>
        member.id === selected ? { ...member, x, y } : member
      )
    )

    socket.emit('avatar-move', { x, y })
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-icon">P</div>
        <div>
          <h2>ProxiSpeak</h2>
          <p>Geospatial Proximity Audio</p>
        </div>
        <span className="online">
          ● {connected ? 'Office online' : 'Connecting...'}
        </span>
      </header>

      <main className="layout">
        <aside className="sidebar">
          <p className="eyebrow">WORKSPACE</p>
          <h3>▦ Virtual Office</h3>

          <button className="mic-button" onClick={() => setMicOn(!micOn)}>
            🎙️ {micOn ? 'Disable microphone' : 'Enable microphone'}
          </button>

          <p className="eyebrow team-heading">YOUR TEAM</p>

          {members.map(member => (
            <button
              key={member.id}
              className={`member ${selected === member.id ? 'active' : ''}`}
              onClick={() => setSelected(member.id)}
            >
              <span className="member-icon" style={{ background: member.color }}>
                {member.name[0]}
              </span>
              <span className="member-info">
                <strong>{member.name}</strong>
                <small>{member.role}</small>
              </span>
              <span className="status">●</span>
            </button>
          ))}

          <div className="tip">
            💡 Move close to teammates to prepare for proximity-based conversations.
          </div>
        </aside>

        <section className="workspace-section">
          <p className="eyebrow">YOUR SPACE</p>
          <h1>Virtual Office</h1>
          <p className="subtitle">
            A shared space for your team to connect.
          </p>

          <div className="office" onClick={moveAvatar}>
            <span className="workspace-label">MAIN WORKSPACE</span>

            <div className="desk desk-one">DESK 01</div>
            <div className="desk desk-two">DESK 02</div>

            <div className="meeting-room">
              <strong>MEETING ROOM</strong>
              <div className="meeting-table" />
            </div>

            {members.map(member => (
              <button
                key={member.id}
                className={`avatar ${selected === member.id ? 'chosen' : ''}`}
                style={{
                  left: `${member.x}%`,
                  top: `${member.y}%`,
                  '--avatar-color': member.color,
                }}
                onClick={event => {
                  event.stopPropagation()
                  setSelected(member.id)
                }}
              >
                <span>{member.name[0]}</span>
                <small>{member.name}</small>
              </button>
            ))}

            {remotePositions.map((position, index) => (
              <div
                key={position.id}
                className="avatar"
                style={{
                  left: `${position.x}%`,
                  top: `${position.y}%`,
                  '--avatar-color': '#16a085',
                  pointerEvents: 'none',
                }}
              >
                <span>G</span>
                <small>Guest {index + 1}</small>
              </div>
            ))}

            <span className="plant plant-one">🪴</span>
            <span className="plant plant-two">🌿</span>
          </div>

          <p className="help-text">
            Selected: {members.find(member => member.id === selected)?.name}.
            Click a teammate to select them, then click an empty space to move them.
          </p>

          <p className="mic-status">
            Server: {connected ? 'Connected' : 'Disconnected'}
          </p>
          <p className="mic-status">
            Microphone: {micOn ? 'Enabled in the interface (audio connection not implemented yet)' : 'Off'}
          </p>
        </section>
      </main>
    </div>
  )
}

export default App

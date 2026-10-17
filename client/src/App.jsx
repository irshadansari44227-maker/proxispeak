
import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'
import './App.css'

const socket = io('http://localhost:5000')

const PROXIMITY_DISTANCE = 18

const initialMembers = [
  { id: 1, name: 'You', role: 'Frontend Developer', x: 16, y: 25, color: '#8057f5' },
  { id: 2, name: 'Mohd Aman Choudhary', role: 'Team Member', x: 38, y: 45, color: '#08a5e8' },
  { id: 3, name: 'Akshaya Rajendran', role: 'Team Member', x: 62, y: 25, color: '#f59e0b' },
  { id: 4, name: 'Ankush pateel B V', role: 'Team Member', x: 78, y: 55, color: '#16a085' },
]

function getDistance(a, b) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function App() {
  const [members, setMembers] = useState(initialMembers)
  const [remotePositions, setRemotePositions] = useState([])
  const [nearbyPairs, setNearbyPairs] = useState([])
  const [selected, setSelected] = useState(1)
  const [micOn, setMicOn] = useState(false)
  const [connected, setConnected] = useState(socket.connected)

  useEffect(() => {
    function onConnect() {
      setConnected(true)
    }

    function onDisconnect() {
      setConnected(false)
      setRemotePositions([])
      setNearbyPairs([])
    }

    function onPositions(positions) {
      setRemotePositions(
        positions.filter(position => position.id !== socket.id)
      )
    }

    function onNearbyUsers(pairs) {
      setNearbyPairs(pairs)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('all-positions', onPositions)
    socket.on('nearby-users', onNearbyUsers)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('all-positions', onPositions)
      socket.off('nearby-users', onNearbyUsers)
    }
  }, [])

  const selectedMember = members.find(member => member.id === selected)

  const nearbyMembers = selectedMember
    ? members.filter(member =>
        member.id !== selectedMember.id &&
        getDistance(selectedMember, member) <= PROXIMITY_DISTANCE
      )
    : []

  const myRemotePosition = remotePositions.find(
    position => position.id === socket.id
  )

  // Server ke nearby pairs mein apne browser ka ID check karo.
  // Is browser ke apne record ko server se filter kiya gaya hai,
  // isliye filhaal remote pair status connected guests ke liye hai.
  const nearbyGuests = nearbyPairs.filter(pair =>
    remotePositions.some(
      position =>
        (pair.userA === position.id && pair.userB === socket.id) ||
        (pair.userB === position.id && pair.userA === socket.id)
    )
  )

  function moveAvatar(event) {
    const rect = event.currentTarget.getBoundingClientRect()

    const x = Math.max(
      4,
      Math.min(96, ((event.clientX - rect.left) / rect.width) * 100)
    )

    const y = Math.max(
      8,
      Math.min(92, ((event.clientY - rect.top) / rect.height) * 100)
    )

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

          <button
            className="mic-button"
            onClick={() => setMicOn(value => !value)}
          >
            🎙️ {micOn ? 'Disable microphone' : 'Enable microphone'}
          </button>

          <p className="eyebrow team-heading">YOUR TEAM · 4 MEMBERS</p>

          {members.map(member => {
            const isNearby =
              member.id !== selected &&
              getDistance(selectedMember, member) <= PROXIMITY_DISTANCE

            return (
              <button
                key={member.id}
                className={`member ${selected === member.id ? 'active' : ''}`}
                onClick={() => setSelected(member.id)}
              >
                <span
                  className="member-icon"
                  style={{ background: member.color }}
                >
                  {member.name[0]}
                </span>

                <span className="member-info">
                  <strong>{member.name}</strong>
                  <small>{member.role}</small>
                  {isNearby && (
                    <small style={{ color: '#16a085' }}>● Nearby</small>
                  )}
                </span>
                <span className="status">●</span>
              </button>
            )
          })}

          <div className="tip">
            💡 Select a teammate, then click an empty office space to move
            their avatar.
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

            {members.map(member => {
              const isNearby =
                member.id !== selected &&
                getDistance(selectedMember, member) <= PROXIMITY_DISTANCE

              return (
                <button
                  key={member.id}
                  className={`avatar ${selected === member.id ? 'chosen' : ''}`}
                  style={{
                    left: `${member.x}%`,
                    top: `${member.y}%`,
                    '--avatar-color': member.color,
                    outline: isNearby ? '3px solid #16a085' : undefined,
                    outlineOffset: isNearby ? '3px' : undefined,
                  }}
                  title={member.name}
                  onClick={event => {
                    event.stopPropagation()
                    setSelected(member.id)
                  }}
                >
                  <span>{member.name[0]}</span>
                  <small>{member.name}</small>
                </button>
              )
            })}

            {remotePositions.map((position, index) => {
              const isNearby = nearbyPairs.some(pair =>
                (pair.userA === position.id && pair.userB === socket.id) ||
                (pair.userB === position.id && pair.userA === socket.id)
              )

              return (
                <div
                  key={position.id}
                  className="avatar"
                  style={{
                    left: `${position.x}%`,
                    top: `${position.y}%`,
                    '--avatar-color': '#e11d48',
                    outline: isNearby ? '3px solid #16a085' : undefined,
                    outlineOffset: isNearby ? '3px' : undefined,
                    pointerEvents: 'none',
                  }}
                >
                  <span>G</span>
                  <small>{`Guest ${index + 1}${isNearby ? ' · Nearby' : ''}`}</small>
                </div>
              )
            })}

            <span className="plant plant-one">🪴</span>
            <span className="plant plant-two">🌿</span>
          </div>

          <div className="tip">
            <strong>
              🟢 {nearbyMembers.length} demo teammate(s) nearby
            </strong>
            <p>
              {nearbyMembers.length
                ? nearbyMembers.map(member => member.name).join(', ')
                : 'Move a demo avatar close to another to test local proximity.'}
            </p>
          </div>

          <div className="tip">
            <strong>
              🌐 {nearbyGuests.length} remote guest connection(s) nearby
            </strong>
            <p>
              {nearbyGuests.length
                ? 'The server reports at least one nearby remote browser.'
                : 'Open the app in another browser or Incognito window, move an avatar there, and bring the positions close.'}
            </p>
          </div>

          <p className="help-text">
            Selected: {selectedMember?.name}. Click a teammate to select them,
            then click an empty office space to move them.
          </p>

          <p className="mic-status">
            Server: {connected ? 'Connected' : 'Disconnected'}
          </p>

          <p className="mic-status">
            Microphone: {micOn
              ? 'Interface enabled — audio calling is not implemented yet'
              : 'Off'}
          </p>
        </section>
      </main>
    </div>
  )
}

export default App

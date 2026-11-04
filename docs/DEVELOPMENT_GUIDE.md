\# ProxiSpeak — Development Guide



\## 1. Project Overview



ProxiSpeak is a geospatial proximity-based audio communication application. It provides a virtual office environment where team members can see nearby participants and communicate through real-time voice connections.



\## 2. Technology Stack



\- Frontend: React and Vite

\- Backend: Node.js and Express

\- Real-time communication: Socket.IO

\- Voice communication: WebRTC

\- Database integration: MongoDB and Mongoose



\## 3. Project Structure



\- `client/` — Frontend application

\- `client/src/App.jsx` — Main application interface and communication logic

\- `client/src/App.css` — Application styling

\- `server/` — Backend application and Socket.IO configuration

\- `docs/` — Project documentation



\## 4. Run the Application



\### Start the backend



Open a terminal in the project root and run:



`cd server`



`npm install`



`npm start`



If the server's package scripts use a different command, use the script configured in `server/package.json`.



\### Start the frontend



Open another terminal in the project root and run:



`cd client`



`npm install`



`npm run dev`



Open the local URL displayed by Vite in the terminal.



\## 5. Voice Communication Workflow



1\. Start the frontend and backend.

2\. Open the application in two separate browser sessions.

3\. Select the appropriate team identities.

4\. Allow microphone access in both sessions.

5\. Move the participants within the configured proximity range.

6\. Check the connection status and test two-way audio.



Microphone permissions, network connectivity, signaling events, and WebRTC connection states can affect voice communication.



\## 6. Build Verification



Run the production build from the client directory:



`npm run build`



A successful Vite build verifies that the frontend can be compiled for production. It does not, by itself, verify live microphone access or two-way audio.



\## 7. Version Control Workflow



Before committing changes, run:



`git status`



After reviewing the changed files, stage only the intended project files, create a descriptive commit, and push it to the `main` branch.



\## 8. Development Checklist



\- \[ ] Backend starts successfully.

\- \[ ] Frontend starts successfully.

\- \[ ] Team identities display correctly.

\- \[ ] Microphone permissions work.

\- \[ ] Two-browser voice communication is tested.

\- \[ ] Production build succeeds.

\- \[ ] Changes are committed and pushed to GitHub.




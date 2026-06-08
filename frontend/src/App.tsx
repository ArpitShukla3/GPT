import { Navigate, Route, Routes } from 'react-router-dom'

import AuthPage from '@/pages/auth-page'
import ChatPage from '@/pages/chat-page'
import HomePage from '@/pages/home-page'

function App() {
  return (
    <div className="relative isolate min-h-dvh overflow-hidden">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<AuthPage mode="signin" />} />
        <Route path="/signin" element={<Navigate to="/login" replace />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

export default App

import { useState, useEffect } from 'react'
import LoginPage from './components/LoginPage'
import Dashboard from './components/Dashboard'

const AUTH_TOKEN_KEY = 'square_dashboard_token'

function App() {
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    const savedToken = sessionStorage.getItem(AUTH_TOKEN_KEY)
    if (savedToken) {
      setToken(savedToken)
    }
  }, [])

  const handleLogin = (newToken: string) => {
    sessionStorage.setItem(AUTH_TOKEN_KEY, newToken)
    setToken(newToken)
  }

  const handleLogout = () => {
    sessionStorage.removeItem(AUTH_TOKEN_KEY)
    setToken(null)
  }

  if (!token) {
    return <LoginPage onLogin={handleLogin} />
  }

  return <Dashboard token={token} onLogout={handleLogout} />
}

export default App

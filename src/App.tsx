// src/App.tsx
import { useState } from 'react';
import LoginPage from './components/LoginPage';
import Dashboard from './components/Dashboard';

const TOKEN_KEY = 'square_token';

export default function App() {
  const [token, setToken] = useState<string | null>(
    sessionStorage.getItem(TOKEN_KEY)
  );

  const handleLogin = (newToken: string) => {
    sessionStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
  };

  const handleLogout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
  };

  if (!token) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return <Dashboard token={token} onLogout={handleLogout} />;
}

import React, { createContext, useContext, useState, useEffect } from 'react'
import api from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [setupComplete, setSetupComplete] = useState(false)
  const [connectedChannels, setConnectedChannels] = useState({})

  useEffect(() => {
    api.get('/auth/me')
      .then(res => {
        setUser(res.data.user)
        setSetupComplete(res.data.setupComplete)
        setConnectedChannels(res.data.connectedChannels || {})
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  async function login(email, password) {
    const res = await api.post('/auth/login', { email, password })
    setUser(res.data.user)
    setSetupComplete(res.data.setupComplete)
    setConnectedChannels(res.data.connectedChannels || {})
    return res.data
  }

  async function register(email, password, name) {
    const res = await api.post('/auth/register', { email, password, name })
    setUser(res.data.user)
    setSetupComplete(false)
    return res.data
  }

  async function demo() {
    const res = await api.post('/auth/demo')
    setUser(res.data.user)
    setSetupComplete(res.data.setupComplete)
    setConnectedChannels(res.data.connectedChannels || {})
    return res.data
  }

  async function logout() {
    await api.post('/auth/logout')
    setUser(null)
    setSetupComplete(false)
  }

  function refreshAuth() {
    return api.get('/auth/me').then(res => {
      setUser(res.data.user)
      setSetupComplete(res.data.setupComplete)
      setConnectedChannels(res.data.connectedChannels || {})
      return res.data
    })
  }

  return (
    <AuthContext.Provider value={{ user, loading, setupComplete, connectedChannels, login, register, demo, logout, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

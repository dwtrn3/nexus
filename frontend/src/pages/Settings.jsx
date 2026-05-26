import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'

const STATUS_STYLES = {
  connected: 'bg-green-100 text-green-700',
  disconnected: 'bg-gray-100 text-gray-600',
  error: 'bg-red-100 text-red-700',
  pending: 'bg-yellow-100 text-yellow-700'
}

function StatusBadge({ status }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status] || STATUS_STYLES.disconnected}`}>
      {status || 'Not connected'}
    </span>
  )
}

function ChannelCard({ icon, title, subtitle, status, onDisconnect, onConnect, children }) {
  return (
    <div className="card p-5">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: icon.bg }}>
          {icon.element}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-semibold text-gray-900">{title}</h3>
            <StatusBadge status={status} />
          </div>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
          {children}
        </div>
        <div className="flex gap-2 shrink-0">
          {status === 'connected' && onDisconnect && (
            <button onClick={onDisconnect} className="text-sm text-red-500 hover:text-red-700 font-medium">
              Disconnect
            </button>
          )}
          {(!status || status === 'disconnected') && onConnect && (
            <button onClick={onConnect} className="btn-primary text-sm py-1.5">
              Connect
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Settings() {
  const [channels, setChannels] = useState(null)
  const [loading, setLoading] = useState(true)
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  useEffect(() => {
    loadChannels()
  }, [])

  async function loadChannels() {
    try {
      const res = await api.get('/settings/channels')
      setChannels(res.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function disconnectWhatsApp() {
    if (!confirm('Disconnect WhatsApp? You will stop receiving messages.')) return
    try {
      await api.delete('/whatsapp/disconnect')
      toast.success('WhatsApp disconnected')
      loadChannels()
    } catch { toast.error('Failed to disconnect WhatsApp') }
  }

  async function disconnectSlackWorkspace(id) {
    if (!confirm('Remove this Slack workspace?')) return
    try {
      await api.delete(`/slack/workspaces/${id}`)
      toast.success('Slack workspace removed')
      loadChannels()
    } catch { toast.error('Failed to remove workspace') }
  }

  async function disconnectGmail() {
    if (!confirm('Disconnect Gmail?')) return
    try {
      await api.delete('/gmail/disconnect')
      toast.success('Gmail disconnected')
      loadChannels()
    } catch { toast.error('Failed to disconnect Gmail') }
  }

  async function connectSlack() {
    const res = await api.get('/slack/oauth/initiate')
    window.location.href = res.data.url
  }

  async function connectGmail() {
    const res = await api.get('/gmail/oauth/initiate')
    window.location.href = res.data.url
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Settings</h1>
          <p className="text-gray-500 text-sm mb-8">Manage your connected channels and account</p>

          {/* Profile */}
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Account</h2>
            <div className="card p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-brand-500 flex items-center justify-center text-white text-lg font-bold">
                {user?.name?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="font-semibold text-gray-900">{user?.name}</div>
                <div className="text-sm text-gray-500">{user?.email}</div>
              </div>
              <button
                onClick={logout}
                className="text-sm text-red-500 hover:text-red-700 font-medium"
              >
                Sign out
              </button>
            </div>
          </section>

          {/* Channels */}
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Connected Channels</h2>

            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"/>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Google Chat */}
                <ChannelCard
                  icon={{ bg: '#1A73E8', element: (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
                    </svg>
                  )}}
                  title="Google Chat"
                  subtitle={channels?.google_chat?.email || 'Internal communications'}
                  status={channels?.google_chat?.status || 'disconnected'}
                >
                  <p className="text-xs text-gray-400 mt-1">Auto-connected via Google sign-in</p>
                </ChannelCard>

                {/* WhatsApp */}
                <ChannelCard
                  icon={{ bg: '#25D366', element: (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                  )}}
                  title="WhatsApp"
                  subtitle={channels?.whatsapp ? `${channels.whatsapp.phone_number} · ${channels.whatsapp.account_type === 'business_api' ? 'Business API' : 'Personal'}` : 'Not connected'}
                  status={channels?.whatsapp?.status || 'disconnected'}
                  onDisconnect={channels?.whatsapp ? disconnectWhatsApp : undefined}
                  onConnect={!channels?.whatsapp ? () => navigate('/setup') : undefined}
                />

                {/* Slack */}
                <div className="card p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-[#4A154B] flex items-center justify-center text-white shrink-0">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-gray-900">Slack</h3>
                        {channels?.slack_workspaces?.length > 0 && (
                          <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium">
                            {channels.slack_workspaces.length} workspace{channels.slack_workspaces.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {channels?.slack_workspaces?.length > 0 ? (
                        <div className="space-y-2">
                          {channels.slack_workspaces.map(ws => (
                            <div key={ws.id} className="flex items-center justify-between text-sm">
                              <div>
                                <span className="font-medium text-gray-700">{ws.team_name}</span>
                                {ws.channel_count > 0 && <span className="text-gray-400 ml-2">· {ws.channel_count} channels</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                <StatusBadge status={ws.status} />
                                <button onClick={() => disconnectSlackWorkspace(ws.id)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">No workspaces connected</p>
                      )}
                    </div>
                    <button onClick={connectSlack} className="btn-primary text-sm py-1.5 shrink-0">
                      Add workspace
                    </button>
                  </div>
                </div>

                {/* Gmail */}
                <ChannelCard
                  icon={{ bg: '#EA4335', element: (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.907 1.528-1.148C21.69 2.28 24 3.434 24 5.457z"/>
                    </svg>
                  )}}
                  title="Gmail"
                  subtitle={channels?.gmail?.email || 'Not connected'}
                  status={channels?.gmail?.status || 'disconnected'}
                  onDisconnect={channels?.gmail ? disconnectGmail : undefined}
                  onConnect={!channels?.gmail ? connectGmail : undefined}
                />
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

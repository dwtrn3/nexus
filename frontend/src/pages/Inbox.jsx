import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { io } from 'socket.io-client'
import api from '../api'
import { useAuth } from '../context/AuthContext'
import Sidebar from '../components/Sidebar'
import ChannelBadge from '../components/ChannelBadge'

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'internal', label: 'Internal' },
  { key: 'client', label: 'Client comms' },
  { key: 'unread', label: 'Unread' }
]

const CHANNEL_ICONS = {
  whatsapp: '💬',
  slack: '#',
  gmail: '✉',
  google_chat: '💭'
}

export default function Inbox() {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all')
  const [unreadCounts, setUnreadCounts] = useState({ total_unread: 0, internal_unread: 0, client_unread: 0 })
  const { user } = useAuth()
  const navigate = useNavigate()

  const loadMessages = useCallback(async () => {
    try {
      const params = {}
      if (tab === 'internal') params.category = 'internal'
      else if (tab === 'client') params.category = 'client'
      else if (tab === 'unread') params.unread = 'true'

      const res = await api.get('/messages', { params })
      setMessages(res.data.messages || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => {
    setLoading(true)
    loadMessages()
  }, [loadMessages])

  useEffect(() => {
    api.get('/messages/unread-counts')
      .then(res => setUnreadCounts(res.data))
      .catch(() => {})
  }, [messages])

  // Socket.IO for real-time
  useEffect(() => {
    if (!user) return
    const socket = io('/', { withCredentials: true })
    socket.emit('authenticate', { userId: user.id })
    socket.on('new_message', () => loadMessages())
    return () => socket.disconnect()
  }, [user, loadMessages])

  function getThreadPreview(msg) {
    if (msg.content_type === 'email') return `📧 ${msg.content}`
    if (msg.content_type === 'image') return '📷 Image'
    if (msg.content_type === 'audio') return '🎵 Voice message'
    if (msg.content_type === 'video') return '📹 Video'
    if (msg.content_type === 'file') return '📎 File'
    return msg.content || '(No content)'
  }

  function getThreadName(msg) {
    if (msg.origin_channel === 'slack' && msg.workspace_name) return `#${msg.origin_channel_id}`
    return msg.sender_name || msg.origin_channel_id
  }

  const tabCounts = {
    all: null,
    internal: unreadCounts.internal_unread > 0 ? unreadCounts.internal_unread : null,
    client: unreadCounts.client_unread > 0 ? unreadCounts.client_unread : null,
    unread: unreadCounts.total_unread > 0 ? unreadCounts.total_unread : null
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Inbox</h1>
              <p className="text-sm text-gray-500">All your messages in one place</p>
            </div>
            {unreadCounts.total_unread > 0 && (
              <div className="bg-brand-500 text-white text-sm font-semibold px-3 py-1 rounded-full">
                {unreadCounts.total_unread} unread
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.key ? 'bg-brand-500 text-white' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {t.label}
                {tabCounts[t.key] && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t.key ? 'bg-white/20' : 'bg-gray-200'}`}>
                    {tabCounts[t.key]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Message list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"/>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <svg className="w-12 h-12 mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>
              </svg>
              <p className="font-medium">No messages yet</p>
              <p className="text-sm mt-1">Messages from your connected channels will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {messages.map(msg => {
                const isUnread = !msg.read_at && msg.direction === 'inbound'
                const threadId = encodeURIComponent(msg.thread_id)
                return (
                  <button
                    key={msg.id}
                    onClick={() => navigate(`/thread/${threadId}`)}
                    className={`w-full flex items-start gap-4 px-6 py-4 hover:bg-gray-50 transition-colors text-left ${isUnread ? 'bg-blue-50/50' : ''}`}
                  >
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-600 shrink-0">
                      {(msg.sender_name?.[0] || '?').toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-sm font-semibold ${isUnread ? 'text-gray-900' : 'text-gray-700'}`}>
                          {getThreadName(msg)}
                        </span>
                        <ChannelBadge channel={msg.origin_channel} workspaceName={msg.workspace_name} />
                        {msg.message_count > 1 && (
                          <span className="text-xs text-gray-400">{msg.message_count}</span>
                        )}
                      </div>
                      <p className={`text-sm truncate ${isUnread ? 'text-gray-700 font-medium' : 'text-gray-500'}`}>
                        {getThreadPreview(msg)}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-xs text-gray-400">
                        {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                      </span>
                      {isUnread && msg.unread_count > 0 && (
                        <span className="w-5 h-5 bg-brand-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                          {msg.unread_count > 9 ? '9+' : msg.unread_count}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

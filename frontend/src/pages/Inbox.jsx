import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { createSocket } from '../lib/socket'
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

function MessageSkeleton() {
  return (
    <div className="flex items-start gap-4 px-6 py-4 animate-pulse">
      <div className="w-10 h-10 rounded-full bg-gray-200 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="flex gap-2">
          <div className="h-3.5 bg-gray-200 rounded w-32" />
          <div className="h-3.5 bg-gray-200 rounded w-16" />
        </div>
        <div className="h-3 bg-gray-200 rounded w-3/4" />
      </div>
      <div className="h-3 bg-gray-200 rounded w-16" />
    </div>
  )
}

export default function Inbox() {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState(null) // null = not searching
  const [searchLoading, setSearchLoading] = useState(false)
  const [unreadCounts, setUnreadCounts] = useState({ total_unread: '0', internal_unread: '0', client_unread: '0' })
  const { user } = useAuth()
  const navigate = useNavigate()
  const searchTimeout = useRef(null)

  const loadMessages = useCallback(async () => {
    try {
      const params = {}
      if (tab === 'internal') params.category = 'internal'
      else if (tab === 'client') params.category = 'client'
      else if (tab === 'unread') params.unread = 'true'
      const res = await api.get('/messages', { params })
      setMessages(res.data.messages || [])
    } catch {}
    finally { setLoading(false) }
  }, [tab])

  const loadUnread = useCallback(async () => {
    try {
      const res = await api.get('/messages/unread-counts')
      setUnreadCounts(res.data)
    } catch {}
  }, [])

  useEffect(() => {
    setLoading(true)
    loadMessages()
  }, [loadMessages])

  useEffect(() => { loadUnread() }, [messages])

  // Real-time
  useEffect(() => {
    if (!user) return
    const socket = createSocket()
    socket.emit('authenticate', { userId: user.id })
    socket.on('new_message', () => { loadMessages(); loadUnread() })
    socket.on('thread_read', () => loadUnread())
    return () => socket.disconnect()
  }, [user, loadMessages, loadUnread])

  // Debounced search
  useEffect(() => {
    if (!search.trim()) { setSearchResults(null); return }
    setSearchLoading(true)
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await api.get('/messages/search', { params: { q: search } })
        setSearchResults(res.data.messages || [])
      } catch {}
      finally { setSearchLoading(false) }
    }, 300)
    return () => clearTimeout(searchTimeout.current)
  }, [search])

  const displayMessages = searchResults !== null ? searchResults : messages

  function getThreadPreview(msg) {
    if (msg.content_type === 'email') return `${msg.content}`
    if (msg.content_type === 'image') return '📷 Image'
    if (msg.content_type === 'audio') return '🎵 Voice message'
    if (msg.content_type === 'video') return '📹 Video'
    if (msg.content_type === 'file') return '📎 File'
    return msg.content || '(No content)'
  }

  function getThreadTitle(msg) {
    if (msg.origin_channel === 'slack') {
      return msg.workspace_name ? `${msg.workspace_name}` : msg.sender_name
    }
    return msg.sender_name || msg.origin_channel_id
  }

  function getThreadSubtitle(msg) {
    if (msg.origin_channel === 'slack') return `#${msg.origin_channel_id}`
    if (msg.origin_channel === 'whatsapp') return `+${msg.origin_channel_id}`
    if (msg.origin_channel === 'gmail') return msg.sender_id || msg.origin_channel_id
    return null
  }

  const tabCounts = {
    all: null,
    internal: parseInt(unreadCounts.internal_unread) > 0 ? unreadCounts.internal_unread : null,
    client: parseInt(unreadCounts.client_unread) > 0 ? unreadCounts.client_unread : null,
    unread: parseInt(unreadCounts.total_unread) > 0 ? unreadCounts.total_unread : null
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar unreadCount={parseInt(unreadCounts.total_unread)} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Inbox</h1>
              {parseInt(unreadCounts.total_unread) > 0 && (
                <p className="text-sm text-gray-500">{unreadCounts.total_unread} unread thread{parseInt(unreadCounts.total_unread) !== 1 ? 's' : ''}</p>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search messages…"
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            )}
          </div>

          {/* Tabs — hidden during search */}
          {!search && (
            <div className="flex gap-1">
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
                    <span className={`text-xs px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center ${tab === t.key ? 'bg-white/25' : 'bg-gray-200 text-gray-600'}`}>
                      {tabCounts[t.key]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {search && (
            <p className="text-sm text-gray-500">
              {searchLoading ? 'Searching…' : searchResults ? `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''} for "${search}"` : ''}
            </p>
          )}
        </div>

        {/* Message list */}
        <div className="flex-1 overflow-y-auto">
          {loading && !search ? (
            <div className="divide-y divide-gray-100">
              {[...Array(6)].map((_, i) => <MessageSkeleton key={i} />)}
            </div>
          ) : displayMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <svg className="w-12 h-12 mb-3 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>
              </svg>
              <p className="font-medium">
                {search ? 'No results found' : 'No messages yet'}
              </p>
              <p className="text-sm mt-1">
                {search ? `Try a different search term` : 'Messages from your connected channels will appear here'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {displayMessages.map(msg => {
                const isUnread = !msg.read_at && msg.direction === 'inbound'
                const threadId = encodeURIComponent(msg.thread_id)
                const title = getThreadTitle(msg)
                const subtitle = getThreadSubtitle(msg)
                return (
                  <button
                    key={msg.id}
                    onClick={() => navigate(`/thread/${threadId}`)}
                    className={`w-full flex items-start gap-4 px-6 py-4 hover:bg-gray-50 transition-colors text-left group ${isUnread ? 'bg-blue-50/40' : ''}`}
                  >
                    {/* Avatar */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${
                      isUnread ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {(msg.sender_name?.[0] || '?').toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className={`text-sm ${isUnread ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>
                          {title}
                        </span>
                        {subtitle && <span className="text-xs text-gray-400">{subtitle}</span>}
                        <ChannelBadge channel={msg.origin_channel} workspaceName={msg.workspace_name} />
                        {msg.message_count > 1 && (
                          <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{msg.message_count}</span>
                        )}
                      </div>
                      <p className={`text-sm truncate ${isUnread ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>
                        {msg.direction === 'outbound' && <span className="text-gray-400">You: </span>}
                        {getThreadPreview(msg)}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                      </span>
                      {isUnread && parseInt(msg.unread_count) > 0 && (
                        <span className="min-w-[1.25rem] h-5 bg-brand-500 rounded-full flex items-center justify-center text-white text-xs font-bold px-1">
                          {parseInt(msg.unread_count) > 9 ? '9+' : msg.unread_count}
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

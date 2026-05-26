import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { io } from 'socket.io-client'
import api from '../api'
import { useAuth } from '../context/AuthContext'
import Sidebar from '../components/Sidebar'
import ChannelBadge from '../components/ChannelBadge'

const CHANNEL_LABELS = {
  whatsapp: 'WhatsApp',
  slack: 'Slack',
  gmail: 'Gmail',
  google_chat: 'Google Chat'
}

export default function Thread() {
  const { threadId } = useParams()
  const decodedThreadId = decodeURIComponent(threadId)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [threadInfo, setThreadInfo] = useState(null)
  const { user } = useAuth()
  const navigate = useNavigate()
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    loadThread()
  }, [decodedThreadId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Socket.IO
  useEffect(() => {
    if (!user) return
    const socket = io('/', { withCredentials: true })
    socket.emit('authenticate', { userId: user.id })
    socket.on('new_message', (msg) => {
      if (msg.thread_id === decodedThreadId) {
        loadThread()
      }
    })
    return () => socket.disconnect()
  }, [user, decodedThreadId])

  async function loadThread() {
    try {
      const res = await api.get(`/messages/thread/${encodeURIComponent(decodedThreadId)}`)
      const msgs = res.data.messages || []
      setMessages(msgs)
      if (msgs.length > 0) {
        setThreadInfo(msgs[0])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSend(e) {
    e.preventDefault()
    if (!reply.trim() || !threadInfo) return
    setSending(true)
    setError('')

    try {
      await api.post('/messages/reply', {
        thread_id: decodedThreadId,
        content: reply.trim(),
        origin_channel: threadInfo.origin_channel,
        origin_channel_id: threadInfo.origin_channel_id,
        origin_workspace_id: threadInfo.origin_workspace_id
      })
      setReply('')
      await loadThread()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend(e)
    }
  }

  function getReplyingVia() {
    if (!threadInfo) return ''
    const channel = CHANNEL_LABELS[threadInfo.origin_channel] || threadInfo.origin_channel
    const id = threadInfo.origin_channel === 'slack'
      ? (threadInfo.workspace_name ? `${threadInfo.workspace_name} · #${threadInfo.origin_channel_id}` : `#${threadInfo.origin_channel_id}`)
      : threadInfo.origin_channel === 'whatsapp'
      ? `+${threadInfo.origin_channel_id}`
      : threadInfo.origin_channel_id

    return `Replying via ${channel} · ${id}`
  }

  const senderName = threadInfo?.sender_name || threadInfo?.origin_channel_id || 'Conversation'

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate('/inbox')}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            </svg>
          </button>

          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-600">
            {senderName[0]?.toUpperCase() || '?'}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-gray-900 truncate">{senderName}</h2>
              {threadInfo && <ChannelBadge channel={threadInfo.origin_channel} workspaceName={threadInfo.workspace_name} />}
            </div>
            <p className="text-xs text-gray-500 truncate">{getReplyingVia()}</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"/>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-gray-400 py-16">No messages in this thread</div>
          ) : (
            messages.map(msg => {
              const isOutbound = msg.direction === 'outbound'
              return (
                <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] ${isOutbound ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                    {!isOutbound && (
                      <span className="text-xs font-medium text-gray-500 px-1">{msg.sender_name}</span>
                    )}
                    <div className={`rounded-2xl px-4 py-2.5 ${
                      isOutbound
                        ? 'bg-brand-500 text-white rounded-tr-sm'
                        : 'bg-white border border-gray-200 text-gray-900 rounded-tl-sm'
                    }`}>
                      {msg.content_type === 'text' || msg.content_type === 'email' ? (
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        <p className="text-sm italic text-gray-400">[{msg.content_type}]</p>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 px-1">
                      {format(new Date(msg.created_at), 'h:mm a')}
                    </span>
                  </div>
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <div className="bg-white border-t border-gray-200 px-6 py-4">
          {threadInfo && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/>
              </svg>
              <span>{getReplyingVia()}</span>
            </div>
          )}

          {error && (
            <div className="mb-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <form onSubmit={handleSend} className="flex gap-3 items-end">
            <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-transparent">
              <textarea
                ref={textareaRef}
                value={reply}
                onChange={e => setReply(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
                rows={1}
                className="w-full bg-transparent text-sm resize-none focus:outline-none max-h-32"
                style={{ minHeight: '24px' }}
              />
            </div>
            <button
              type="submit"
              disabled={sending || !reply.trim()}
              className="w-10 h-10 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition-colors"
            >
              {sending ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"/>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                </svg>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

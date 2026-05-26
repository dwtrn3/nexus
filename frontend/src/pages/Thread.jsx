import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format, isToday, isYesterday } from 'date-fns'
import { io } from 'socket.io-client'
import api from '../api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import Sidebar from '../components/Sidebar'
import ChannelBadge from '../components/ChannelBadge'

const CHANNEL_LABELS = {
  whatsapp: 'WhatsApp',
  slack: 'Slack',
  gmail: 'Gmail',
  google_chat: 'Google Chat'
}

const CHANNEL_COLORS = {
  whatsapp: 'text-green-600',
  slack: 'text-purple-600',
  gmail: 'text-red-500',
  google_chat: 'text-blue-500'
}

function DateDivider({ date }) {
  const d = new Date(date)
  const label = isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : format(d, 'MMMM d, yyyy')
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-xs text-gray-400 font-medium px-2">{label}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  )
}

export default function Thread() {
  const { threadId } = useParams()
  const decodedThreadId = decodeURIComponent(threadId)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [threadInfo, setThreadInfo] = useState(null)
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  const loadThread = useCallback(async () => {
    try {
      const res = await api.get(`/messages/thread/${encodeURIComponent(decodedThreadId)}`)
      const msgs = res.data.messages || []
      setMessages(msgs)
      if (msgs.length > 0) setThreadInfo(msgs[0])
    } catch {}
    finally { setLoading(false) }
  }, [decodedThreadId])

  useEffect(() => { loadThread() }, [loadThread])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: loading ? 'instant' : 'smooth' })
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 150) + 'px'
  }, [reply])

  // Socket.IO
  useEffect(() => {
    if (!user) return
    const socket = io('/', { withCredentials: true })
    socket.emit('authenticate', { userId: user.id })
    socket.on('new_message', (msg) => {
      if (msg.thread_id === decodedThreadId) loadThread()
    })
    return () => socket.disconnect()
  }, [user, decodedThreadId, loadThread])

  async function handleSend(e) {
    e?.preventDefault()
    if (!reply.trim() || !threadInfo || sending) return
    setSending(true)
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
      toast.error(err.response?.data?.error || 'Failed to send message')
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function getReplyingVia() {
    if (!threadInfo) return ''
    const channel = CHANNEL_LABELS[threadInfo.origin_channel] || threadInfo.origin_channel
    let id = ''
    if (threadInfo.origin_channel === 'slack') {
      id = threadInfo.workspace_name ? `${threadInfo.workspace_name} · #${threadInfo.origin_channel_id}` : `#${threadInfo.origin_channel_id}`
    } else if (threadInfo.origin_channel === 'whatsapp') {
      id = `+${threadInfo.origin_channel_id}`
    } else if (threadInfo.origin_channel === 'gmail') {
      id = threadInfo.origin_channel_id
    } else {
      id = threadInfo.origin_channel_id
    }
    return { channel, id }
  }

  // Group messages by date for dividers
  function groupByDate(msgs) {
    const groups = []
    let lastDate = null
    for (const msg of msgs) {
      const dateKey = format(new Date(msg.created_at), 'yyyy-MM-dd')
      if (dateKey !== lastDate) {
        groups.push({ type: 'divider', date: msg.created_at, key: `div_${dateKey}` })
        lastDate = dateKey
      }
      groups.push({ type: 'message', msg, key: msg.id })
    }
    return groups
  }

  const via = getReplyingVia()
  const senderName = threadInfo?.sender_name || threadInfo?.origin_channel_id || 'Conversation'
  const items = groupByDate(messages)

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate('/inbox')}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            </svg>
          </button>

          <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-600 shrink-0">
            {senderName[0]?.toUpperCase() || '?'}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-gray-900 truncate text-sm">{senderName}</h2>
              {threadInfo && <ChannelBadge channel={threadInfo.origin_channel} workspaceName={threadInfo.workspace_name} />}
            </div>
            {via.channel && (
              <p className={`text-xs truncate ${CHANNEL_COLORS[threadInfo?.origin_channel] || 'text-gray-400'}`}>
                {via.channel} · {via.id}
              </p>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"/>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center text-gray-400 py-16">No messages in this thread</div>
          ) : (
            <div className="space-y-1">
              {items.map(item =>
                item.type === 'divider' ? (
                  <DateDivider key={item.key} date={item.date} />
                ) : (
                  <MessageBubble key={item.key} msg={item.msg} />
                )
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <div className="bg-white border-t border-gray-200 px-4 py-3">
          {via.channel && (
            <div className={`flex items-center gap-1.5 text-xs mb-2 ${CHANNEL_COLORS[threadInfo?.origin_channel] || 'text-gray-400'}`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/>
              </svg>
              <span className="font-medium">Replying via {via.channel}</span>
              <span className="text-gray-400">·</span>
              <span>{via.id}</span>
            </div>
          )}

          <div className="flex gap-2 items-end">
            <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-transparent transition-all">
              <textarea
                ref={textareaRef}
                value={reply}
                onChange={e => setReply(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message… (Enter to send · Shift+Enter for new line)"
                rows={1}
                className="w-full bg-transparent text-sm resize-none focus:outline-none"
                style={{ minHeight: '22px', maxHeight: '150px' }}
              />
            </div>
            <button
              onClick={handleSend}
              disabled={sending || !reply.trim()}
              className="w-10 h-10 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition-colors shrink-0"
            >
              {sending ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"/>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ msg }) {
  const isOutbound = msg.direction === 'outbound'
  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'} mb-1`}>
      <div className={`max-w-[72%] flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}>
        {!isOutbound && (
          <span className="text-xs font-medium text-gray-500 px-1 mb-1">{msg.sender_name}</span>
        )}
        <div className={`rounded-2xl px-4 py-2.5 ${
          isOutbound
            ? 'bg-brand-500 text-white rounded-tr-sm'
            : 'bg-white border border-gray-200 text-gray-900 shadow-sm rounded-tl-sm'
        }`}>
          {msg.content_type === 'text' || msg.content_type === 'email' ? (
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
          ) : (
            <p className="text-sm italic opacity-70">[{msg.content_type}]</p>
          )}
        </div>
        <span className="text-[11px] text-gray-400 px-1 mt-1">
          {format(new Date(msg.created_at), 'h:mm a')}
        </span>
      </div>
    </div>
  )
}

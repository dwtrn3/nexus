import React from 'react'

const CHANNEL_CONFIG = {
  whatsapp: { label: 'WhatsApp', bg: 'bg-green-100', text: 'text-green-800', dot: 'bg-green-500' },
  slack: { label: 'Slack', bg: 'bg-purple-100', text: 'text-purple-800', dot: 'bg-purple-600' },
  gmail: { label: 'Gmail', bg: 'bg-red-100', text: 'text-red-800', dot: 'bg-red-500' },
  google_chat: { label: 'Chat', bg: 'bg-blue-100', text: 'text-blue-800', dot: 'bg-blue-500' }
}

export default function ChannelBadge({ channel, workspaceName }) {
  const config = CHANNEL_CONFIG[channel] || { label: channel, bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-400' }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {workspaceName || config.label}
    </span>
  )
}

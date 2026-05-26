import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV = [
  {
    to: '/inbox',
    label: 'Inbox',
    icon: (active) => (
      <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>
      </svg>
    )
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: (active) => (
      <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
      </svg>
    )
  }
]

export default function Sidebar({ unreadCount = 0 }) {
  const { user, logout } = useAuth()
  const location = useLocation()

  return (
    <div className="w-16 bg-gray-900 flex flex-col items-center py-4 gap-1">
      {/* Logo */}
      <Link to="/inbox" className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center mb-3 hover:bg-brand-600 transition-colors">
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
        </svg>
      </Link>

      {NAV.map(item => {
        const isActive = location.pathname.startsWith(item.to)
        return (
          <Link
            key={item.to}
            to={item.to}
            title={item.label}
            className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              isActive ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {item.icon(isActive)}
            {/* Unread badge on inbox */}
            {item.to === '/inbox' && unreadCount > 0 && !isActive && (
              <span className="absolute -top-1 -right-1 min-w-[1.1rem] h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold px-1">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>
        )
      })}

      <div className="flex-1" />

      {/* User avatar */}
      <button
        onClick={logout}
        title={`Sign out (${user?.email})`}
        className="w-10 h-10 rounded-xl bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-white text-sm font-bold transition-colors"
      >
        {user?.name?.[0]?.toUpperCase() || 'U'}
      </button>
    </div>
  )
}

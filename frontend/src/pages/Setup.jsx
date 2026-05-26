import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api'

const STEPS = ['WhatsApp', 'Slack', 'Gmail']
const ICONS = {
  WhatsApp: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  ),
  Slack: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
    </svg>
  ),
  Gmail: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.907 1.528-1.148C21.69 2.28 24 3.434 24 5.457z"/>
    </svg>
  )
}

function StepIndicator({ steps, current }) {
  return (
    <div className="flex items-center justify-center mb-8">
      {steps.map((step, i) => (
        <React.Fragment key={step}>
          <div className="flex flex-col items-center">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all ${
              i < current ? 'bg-green-500 border-green-500 text-white'
              : i === current ? 'bg-brand-500 border-brand-500 text-white'
              : 'bg-white border-gray-200 text-gray-400'
            }`}>
              {i < current ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                </svg>
              ) : i + 1}
            </div>
            <span className={`text-xs mt-1 font-medium ${i === current ? 'text-brand-600' : i < current ? 'text-green-600' : 'text-gray-400'}`}>
              {step}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`h-0.5 w-16 mx-2 mb-5 ${i < current ? 'bg-green-400' : 'bg-gray-200'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

function WhatsAppStep({ onDone, onSkip }) {
  const [accountType, setAccountType] = useState('personal')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [checking, setChecking] = useState(false)
  const [numberError, setNumberError] = useState('')
  const [step, setStep] = useState('form') // 'form' | 'qr' | 'business_token' | 'done'
  const [qr, setQr] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [metaToken, setMetaToken] = useState('')
  const pollRef = useRef(null)

  async function handleConnect() {
    if (!phoneNumber) return
    setChecking(true)
    setNumberError('')

    try {
      // Check number availability
      const checkRes = await api.post('/whatsapp/check-number', { phone_number: phoneNumber })
      if (!checkRes.data.available) {
        setNumberError('This number is already linked to another account')
        setChecking(false)
        return
      }

      if (accountType === 'personal') {
        const initRes = await api.post('/whatsapp/connect/personal/init', { phone_number: phoneNumber })
        setQr(initRes.data.qr)
        setSessionId(initRes.data.sessionId)
        setStep('qr')

        // Poll for connection
        pollRef.current = setInterval(async () => {
          try {
            const statusRes = await api.get(`/whatsapp/connect/personal/status/${initRes.data.sessionId}`)
            if (statusRes.data.connected) {
              clearInterval(pollRef.current)
              setStep('done')
              setTimeout(onDone, 1500)
            } else if (statusRes.data.qr) {
              setQr(statusRes.data.qr)
            }
          } catch {}
        }, 3000)
      } else {
        setStep('business_token')
      }
    } catch (err) {
      setNumberError(err.response?.data?.error || 'Failed to check number')
    } finally {
      setChecking(false)
    }
  }

  async function handleBusinessConnect() {
    try {
      setChecking(true)
      await api.post('/whatsapp/connect/business', {
        phone_number: phoneNumber,
        meta_access_token: metaToken
      })
      setStep('done')
      setTimeout(onDone, 1500)
    } catch (err) {
      setNumberError(err.response?.data?.error || 'Failed to connect')
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => () => pollRef.current && clearInterval(pollRef.current), [])

  if (step === 'done') {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <p className="font-semibold text-gray-900">WhatsApp Connected!</p>
        <p className="text-sm text-gray-500 mt-1">{phoneNumber}</p>
      </div>
    )
  }

  if (step === 'qr') {
    return (
      <div className="text-center">
        <p className="text-sm text-gray-600 mb-4">Scan this QR code with WhatsApp on your phone</p>
        {qr ? (
          <img src={qr} alt="WhatsApp QR Code" className="mx-auto w-48 h-48 rounded-xl border-4 border-white shadow-md"/>
        ) : (
          <div className="w-48 h-48 mx-auto bg-gray-100 rounded-xl flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"/>
          </div>
        )}
        <p className="text-xs text-gray-400 mt-4">Waiting for scan…</p>
        <button onClick={onSkip} className="mt-4 text-sm text-gray-400 hover:text-gray-600">Skip for now</button>
      </div>
    )
  }

  if (step === 'business_token') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600">Enter your Meta Business API access token and phone number ID from Meta Business Manager.</p>
        <input
          type="text"
          value={metaToken}
          onChange={e => setMetaToken(e.target.value)}
          className="input"
          placeholder="Meta access token"
        />
        {numberError && <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg px-3 py-2">{numberError}</div>}
        <div className="flex gap-3">
          <button onClick={handleBusinessConnect} disabled={checking || !metaToken} className="btn-primary flex-1">
            {checking ? 'Connecting...' : 'Connect Business API'}
          </button>
          <button onClick={onSkip} className="btn-secondary">Skip</button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-gray-700 mb-3">Account type</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: 'personal', label: 'Personal WhatsApp', desc: 'Link your personal number via QR scan' },
            { value: 'business_api', label: 'Business API', desc: 'Verified business number via Meta Cloud API' }
          ].map(opt => (
            <label key={opt.value} className={`relative flex flex-col p-4 rounded-xl border-2 cursor-pointer transition-all ${accountType === opt.value ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
              <input type="radio" name="wa_type" value={opt.value} checked={accountType === opt.value} onChange={e => setAccountType(e.target.value)} className="sr-only"/>
              <span className="text-sm font-semibold text-gray-900">{opt.label}</span>
              <span className="text-xs text-gray-500 mt-1">{opt.desc}</span>
              {accountType === opt.value && (
                <div className="absolute top-3 right-3 w-4 h-4 bg-brand-500 rounded-full flex items-center justify-center">
                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20"><circle cx="10" cy="10" r="4"/></svg>
                </div>
              )}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Phone number</label>
        <input
          type="tel"
          value={phoneNumber}
          onChange={e => { setPhoneNumber(e.target.value); setNumberError('') }}
          className="input"
          placeholder="+91 98765 43210"
        />
        {numberError && (
          <div className="mt-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
            <svg className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            </svg>
            {numberError}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button onClick={handleConnect} disabled={checking || !phoneNumber} className="btn-primary flex-1">
          {checking ? 'Checking...' : 'Connect WhatsApp'}
        </button>
        <button onClick={onSkip} className="btn-secondary">Skip</button>
      </div>
    </div>
  )
}

function SlackStep({ onDone, onSkip }) {
  const [searchParams] = useSearchParams()
  const [workspaces, setWorkspaces] = useState([])
  const [loading, setLoading] = useState(false)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    loadWorkspaces()
    const slackSuccess = searchParams.get('slack_success')
    if (slackSuccess) loadWorkspaces()
  }, [])

  async function loadWorkspaces() {
    setLoading(true)
    try {
      const res = await api.get('/slack/workspaces')
      setWorkspaces(res.data.workspaces || [])
    } finally {
      setLoading(false)
    }
  }

  async function handleSlackConnect() {
    setConnecting(true)
    try {
      const res = await api.get('/slack/oauth/initiate')
      window.location.href = res.data.url
    } catch {
      setConnecting(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">Connect your Slack workspaces. All channels and DMs will be auto-imported.</p>

      {workspaces.length > 0 && (
        <div className="space-y-2">
          {workspaces.map(ws => (
            <div key={ws.id} className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="w-8 h-8 bg-[#4A154B] rounded-lg flex items-center justify-center text-white">
                {ICONS.Slack}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900">{ws.team_name}</div>
                {ws.channel_count > 0 && <div className="text-xs text-gray-500">{ws.channel_count} channels imported</div>}
              </div>
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={handleSlackConnect}
        disabled={connecting}
        className="w-full flex items-center justify-center gap-3 bg-[#4A154B] hover:bg-[#3e1040] text-white font-medium py-3 rounded-lg transition-colors"
      >
        {ICONS.Slack}
        {connecting ? 'Redirecting...' : workspaces.length > 0 ? 'Add another workspace' : 'Sign in with Slack'}
      </button>

      <div className="flex gap-3">
        {workspaces.length > 0 && (
          <button onClick={onDone} className="btn-primary flex-1">Continue</button>
        )}
        <button onClick={onSkip} className={`${workspaces.length > 0 ? 'btn-secondary' : 'btn-secondary w-full'}`}>
          {workspaces.length > 0 ? 'Skip' : 'Skip for now'}
        </button>
      </div>
    </div>
  )
}

function GmailStep({ onDone, onSkip }) {
  const [connected, setConnected] = useState(false)
  const [email, setEmail] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [searchParams] = useSearchParams()

  useEffect(() => {
    loadStatus()
    if (searchParams.get('gmail_success')) loadStatus()
  }, [])

  async function loadStatus() {
    try {
      const res = await api.get('/gmail/status')
      if (res.data.connection) {
        setConnected(true)
        setEmail(res.data.connection.email)
      }
    } catch {}
  }

  async function handleConnect() {
    setConnecting(true)
    try {
      const res = await api.get('/gmail/oauth/initiate')
      window.location.href = res.data.url
    } catch {
      setConnecting(false)
    }
  }

  if (connected) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center text-white">
            {ICONS.Gmail}
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-900">{email}</div>
            <div className="text-xs text-gray-500">Gmail connected</div>
          </div>
          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <button onClick={onDone} className="btn-primary w-full">Finish Setup</button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">Connect your Gmail to manage client emails in Nexus.</p>
      <button
        onClick={handleConnect}
        disabled={connecting}
        className="w-full flex items-center justify-center gap-3 border border-gray-200 rounded-lg py-3 px-4 hover:bg-gray-50 transition-colors"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        {connecting ? 'Redirecting...' : 'Connect Gmail'}
      </button>
      <button onClick={onSkip} className="btn-secondary w-full">Skip for now</button>
    </div>
  )
}

export default function Setup() {
  const [currentStep, setCurrentStep] = useState(0)
  const { refreshAuth } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Handle OAuth callbacks - detect which step to show
  useEffect(() => {
    if (searchParams.get('slack_success') || searchParams.get('slack_error')) setCurrentStep(1)
    if (searchParams.get('gmail_success') || searchParams.get('gmail_error')) setCurrentStep(2)
  }, [])

  async function handleStepDone() {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(s => s + 1)
    } else {
      await refreshAuth()
      navigate('/inbox')
    }
  }

  async function handleSkip() {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(s => s + 1)
    } else {
      await refreshAuth()
      navigate('/inbox')
    }
  }

  const stepComponents = [
    <WhatsAppStep key="wa" onDone={handleStepDone} onSkip={handleSkip} />,
    <SlackStep key="slack" onDone={handleStepDone} onSkip={handleSkip} />,
    <GmailStep key="gmail" onDone={handleStepDone} onSkip={handleSkip} />
  ]

  const channelColors = ['#25D366', '#4A154B', '#EA4335']

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Connect your channels</h1>
          <p className="text-gray-500 text-sm mt-1">Set up Nexus by connecting your communication tools</p>
        </div>

        <StepIndicator steps={STEPS} current={currentStep} />

        <div className="card p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: channelColors[currentStep] }}>
              {ICONS[STEPS[currentStep]]}
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Connect {STEPS[currentStep]}</h2>
              <p className="text-xs text-gray-400">Step {currentStep + 1} of {STEPS.length}</p>
            </div>
          </div>

          {stepComponents[currentStep]}
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          You can always add or change channels later in Settings
        </p>
      </div>
    </div>
  )
}

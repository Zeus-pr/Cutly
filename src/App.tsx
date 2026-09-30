import { useState } from 'react'

type Phase = 'splash' | 'cutting' | 'login'

/* ── Brand mark: minimal geometric scissors ── */
function CutlyMark({
  color = 'white',
  pivot = 'rgba(0,0,0,0.18)',
  size = 52,
}: {
  color?: string
  pivot?: string
  size?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 52 52"
      fill="none"
      aria-label="Cutly scissors mark"
    >
      {/* Left blade: top-left → bottom-right */}
      <rect
        x="21.5" y="3"
        width="9" height="32"
        rx="4.5"
        transform="rotate(38 26 22)"
        fill={color}
      />
      {/* Right blade: top-right → bottom-left */}
      <rect
        x="21.5" y="3"
        width="9" height="32"
        rx="4.5"
        transform="rotate(-38 26 22)"
        fill={color}
      />
      {/* Pivot knock-out circle */}
      <circle cx="26" cy="22" r="4" fill={pivot} />
      {/* Handle ring — left */}
      <circle cx="13.5" cy="41" r="5.5" stroke={color} strokeWidth="2.8" fill="none" />
      {/* Handle ring — right */}
      <circle cx="38.5" cy="41" r="5.5" stroke={color} strokeWidth="2.8" fill="none" />
    </svg>
  )
}

/* ── Splash ── */
function SplashScreen({ onTap }: { onTap: () => void }) {
  const [tapped, setTapped] = useState(false)

  function handleTap() {
    if (tapped) return
    setTapped(true)
    setTimeout(onTap, 300)
  }

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center select-none"
      style={{ background: '#FF4500', cursor: 'pointer' }}
      onClick={handleTap}
    >
      {/* Soft radial highlight — top center */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(255,255,255,0.18) 0%, transparent 65%)',
        }}
      />

      {/* Logo cluster */}
      <div
        className="flex flex-col items-center gap-5"
        style={{
          animation: tapped
            ? 'logoJolt 0.28s cubic-bezier(0.36,0.07,0.19,0.97)'
            : 'breathe 3s ease-in-out infinite',
        }}
      >
        {/* Mark */}
        <div className="relative flex items-center justify-center">
          {tapped && (
            <div
              className="absolute rounded-full pointer-events-none"
              style={{
                width: 100, height: 100,
                border: '2px solid rgba(255,255,255,0.55)',
                animation: 'tapPulse 0.5s ease-out forwards',
              }}
            />
          )}
          <CutlyMark size={80} color="white" pivot="rgba(255,69,0,0.8)" />
        </div>

        {/* Wordmark */}
        <div className="flex flex-col items-center gap-1" style={{ opacity: tapped ? 0 : 1, transition: 'opacity 0.15s' }}>
          <span
            className="text-white"
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 700,
              fontSize: '40px',
              letterSpacing: '-1px',
              lineHeight: 1,
            }}
          >
            CUTLY
          </span>
          <span
            className="text-white text-[10px] font-semibold tracking-[0.28em] uppercase"
            style={{ opacity: 0.55 }}
          >
            Book your cut
          </span>
        </div>
      </div>

      {/* Tap prompt */}
      <div
        className="absolute flex flex-col items-center gap-2"
        style={{
          bottom: 64,
          opacity: tapped ? 0 : 1,
          transition: 'opacity 0.15s',
          animation: 'fadeIn 0.6s ease 1.4s both',
        }}
      >
        <div className="flex gap-1.5">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="rounded-full"
              style={{
                width: i === 1 ? 7 : 4,
                height: i === 1 ? 7 : 4,
                background: i === 1 ? 'white' : 'rgba(255,255,255,0.38)',
                transition: 'all 0.2s',
              }}
            />
          ))}
        </div>
        <span className="text-[10px] font-medium tracking-[0.18em] text-white" style={{ opacity: 0.45 }}>
          TAP TO OPEN
        </span>
      </div>

      {/* Home indicator */}
      <div className="absolute bottom-2 w-full flex justify-center pb-1">
        <div className="w-32 h-1 rounded-full bg-white" style={{ opacity: 0.3 }} />
      </div>
    </div>
  )
}

/* ── Scissor-cut panels ── */
function CutOverlay({ active }: { active: boolean }) {
  if (!active) return null
  const shared: React.CSSProperties = {
    position: 'absolute', left: 0, right: 0, height: '50%',
    background: '#FF4500', zIndex: 30,
  }
  return (
    <>
      <div style={{ ...shared, top: 0,    animation: 'cutTop    0.5s cubic-bezier(0.4,0,0.2,1) forwards' }} />
      <div style={{ ...shared, bottom: 0, animation: 'cutBottom 0.5s cubic-bezier(0.4,0,0.2,1) forwards' }} />
    </>
  )
}

/* ── Login ── */
function LoginScreen() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [focused, setFocused]   = useState<string | null>(null)

  const fieldStyle = (name: string): React.CSSProperties => ({
    background: 'var(--color-card)',
    border: `1.5px solid ${focused === name ? '#FF4500' : 'var(--color-border)'}`,
    boxShadow: focused === name ? '0 0 0 3px rgba(255,69,0,0.14)' : 'none',
    borderRadius: '16px',
    transition: 'border-color 0.18s, box-shadow 0.18s',
  })

  return (
    <div
      className="absolute inset-0 flex flex-col overflow-y-auto"
      style={{ paddingTop: '54px', scrollbarWidth: 'none' }}
    >
      {/* Orange accent bar at top */}
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
          background: 'linear-gradient(90deg, #FF4500 0%, #FF6A33 60%, transparent 100%)',
          zIndex: 2,
        }}
      />

      <div className="flex flex-col flex-1 px-7 pb-10">

        {/* Brand */}
        <div className="mt-9 mb-9 anim-fadeUp" style={{ animationDelay: '0.04s' }}>
          <div className="flex items-center gap-3 mb-6">
            <div
              className="flex items-center justify-center rounded-[14px]"
              style={{
                width: 42, height: 42,
                background: '#FF4500',
                boxShadow: '0 4px 18px rgba(255,69,0,0.38)',
              }}
            >
              <CutlyMark size={28} color="white" pivot="rgba(255,69,0,0.7)" />
            </div>
            <span
              className="text-white"
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 700,
                fontSize: '22px',
                letterSpacing: '-0.5px',
              }}
            >
              CUTLY
            </span>
          </div>

          <h1
            className="text-white mb-2"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
              fontSize: '30px',
              letterSpacing: '-0.4px',
              lineHeight: 1.22,
            }}
          >
            Welcome<br />
            <span style={{ fontStyle: 'italic', color: '#FF4500' }}>back.</span>
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Sign in to manage your bookings.
          </p>
        </div>

        {/* Fields */}
        <div className="flex flex-col gap-4 mb-5 anim-fadeUp" style={{ animationDelay: '0.10s' }}>
          {/* Email */}
          <div>
            <label className="block text-[10px] font-bold mb-2 uppercase tracking-[0.12em]"
              style={{ color: 'var(--color-muted)' }}>
              Email
            </label>
            <div className="relative" style={fieldStyle('email')}>
              <span className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ opacity: 0.36 }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 4h12v8a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" stroke="white" strokeWidth="1.3"/>
                  <path d="M2 4l6 5 6-5" stroke="white" strokeWidth="1.3"/>
                </svg>
              </span>
              <input
                type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                onFocus={() => setFocused('email')}
                onBlur={() => setFocused(null)}
                placeholder="you@example.com"
                className="w-full bg-transparent text-white text-sm py-[15px] pl-10 pr-4 outline-none rounded-2xl"
                style={{ caretColor: '#FF4500' }}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-[10px] font-bold mb-2 uppercase tracking-[0.12em]"
              style={{ color: 'var(--color-muted)' }}>
              Password
            </label>
            <div className="relative" style={fieldStyle('password')}>
              <span className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ opacity: 0.36 }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="7" width="12" height="8" rx="1.5" stroke="white" strokeWidth="1.3"/>
                  <path d="M5 7V5a3 3 0 016 0v2" stroke="white" strokeWidth="1.3"/>
                  <circle cx="8" cy="11" r="1.2" fill="white"/>
                </svg>
              </span>
              <input
                type={showPw ? 'text' : 'password'} value={password}
                onChange={e => setPassword(e.target.value)}
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused(null)}
                placeholder="••••••••"
                className="w-full bg-transparent text-white text-sm py-[15px] pl-10 pr-12 outline-none rounded-2xl"
                style={{ caretColor: '#FF4500' }}
              />
              <button
                onClick={() => setShowPw(!showPw)}
                className="absolute right-4 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-70"
                style={{ opacity: 0.36, color: 'white' }}
              >
                {showPw ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="white" strokeWidth="1.3"/>
                    <circle cx="8" cy="8" r="2" stroke="white" strokeWidth="1.3"/>
                    <path d="M2 2l12 12" stroke="white" strokeWidth="1.3"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="white" strokeWidth="1.3"/>
                    <circle cx="8" cy="8" r="2" stroke="white" strokeWidth="1.3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Forgot */}
        <div className="flex justify-end mb-7 anim-fadeUp" style={{ animationDelay: '0.16s' }}>
          <button className="text-xs font-bold transition-opacity hover:opacity-75" style={{ color: '#FF4500' }}>
            Forgot password?
          </button>
        </div>

        {/* CTA */}
        <button
          className="w-full py-[15px] rounded-2xl text-white font-bold text-sm tracking-widest uppercase mb-5 transition-all active:scale-[0.97] anim-fadeUp"
          style={{
            background: '#FF4500',
            boxShadow: '0 6px 26px rgba(255,69,0,0.42)',
            letterSpacing: '0.1em',
            animationDelay: '0.20s',
          }}
        >
          Sign in
        </button>

        {/* Divider */}
        <div className="flex items-center gap-4 mb-5 anim-fadeUp" style={{ animationDelay: '0.24s' }}>
          <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
          <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>or continue with</span>
          <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
        </div>

        {/* Social */}
        <div className="flex gap-3 mb-8 anim-fadeUp" style={{ animationDelay: '0.28s' }}>
          {[
            {
              label: 'Google',
              icon: (
                <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
                  <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
              ),
            },
            {
              label: 'Apple',
              icon: (
                <svg width="14" height="17" viewBox="0 0 15 18" fill="white">
                  <path d="M13.264 9.572c-.02-2.123 1.737-3.147 1.816-3.196-1-1.44-2.543-1.636-3.085-1.653-1.308-.133-2.57.773-3.233.773-.672 0-1.698-.757-2.797-.736-1.432.02-2.762.834-3.498 2.108-1.499 2.593-.384 6.43 1.073 8.531.72 1.032 1.568 2.186 2.682 2.146 1.082-.044 1.489-.692 2.793-.692 1.294 0 1.663.692 2.793.669 1.162-.02 1.894-1.05 2.604-2.087.824-1.186 1.161-2.347 1.178-2.408-.027-.01-2.3-.88-2.327-3.455z"/>
                  <path d="M11.14 3.265c.591-.724.99-1.718.88-2.718-.852.036-1.898.57-2.51 1.277-.546.638-1.029 1.668-.9 2.642.951.072 1.929-.483 2.53-1.201z"/>
                </svg>
              ),
            },
          ].map(({ label, icon }) => (
            <button
              key={label}
              className="flex-1 flex items-center justify-center gap-2.5 py-[13px] rounded-2xl text-sm font-semibold transition-all active:scale-[0.97] hover:border-white/15"
              style={{
                background: 'var(--color-card)',
                border: '1.5px solid var(--color-border)',
                color: 'rgba(255,255,255,0.72)',
              }}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        {/* Sign up */}
        <p className="text-center text-[13px] anim-fadeUp" style={{ color: 'var(--color-muted)', animationDelay: '0.32s' }}>
          New here?{' '}
          <button className="font-bold transition-opacity hover:opacity-75" style={{ color: '#FF4500' }}>
            Create account
          </button>
        </p>
      </div>
    </div>
  )
}

/* ── Root ── */
export default function App() {
  const [phase, setPhase]     = useState<Phase>('splash')
  const [showLogin, setShowLogin] = useState(false)
  const [cutting, setCutting] = useState(false)

  function handleTap() {
    setCutting(true)
    setShowLogin(true)
    setTimeout(() => setPhase('login'), 540)
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden"
      style={{ background: 'var(--color-void)', fontFamily: 'var(--font-body)' }}
    >
      {/* Desktop ambient — orange halo */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse 50% 40% at 50% -5%, rgba(255,69,0,0.22) 0%, transparent 65%),
            radial-gradient(ellipse 30% 20% at 10% 90%, rgba(255,69,0,0.08) 0%, transparent 55%)
          `,
        }}
      />

      {/* Phone shell */}
      <div
        className="relative w-[375px] flex-shrink-0"
        style={{
          height: '812px',
          background: phase === 'splash' ? '#FF4500' : 'var(--color-surface)',
          borderRadius: '52px',
          boxShadow: `
            0 0 0 1px rgba(255,255,255,0.055),
            0 0 0 9px rgba(255,255,255,0.02),
            0 50px 120px rgba(0,0,0,0.8),
            0 0 100px rgba(255,69,0,0.16)
          `,
          overflow: 'hidden',
          transition: 'background 0.1s',
        }}
      >
        {/* Status bar */}
        {phase === 'login' && (
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-8 pt-4 pb-2 z-10 anim-fadeIn">
            <span className="text-white text-xs font-semibold" style={{ opacity: 0.5 }}>9:41</span>
            <div
              className="absolute left-1/2 -translate-x-1/2 top-0 h-7 rounded-b-2xl"
              style={{ width: '126px', background: 'var(--color-surface)' }}
            />
            <div className="flex items-center gap-1.5" style={{ opacity: 0.5 }}>
              <svg width="16" height="12" viewBox="0 0 16 12" fill="white">
                <rect x="0" y="4" width="3" height="8" rx="0.5" opacity="0.4"/>
                <rect x="4.5" y="2.5" width="3" height="9.5" rx="0.5" opacity="0.6"/>
                <rect x="9" y="0.5" width="3" height="11.5" rx="0.5"/>
              </svg>
              <svg width="15" height="12" viewBox="0 0 15 12" fill="white">
                <path d="M7.5 2.5C9.5 2.5 11.3 3.3 12.6 4.6L14 3.2C12.3 1.5 10 0.5 7.5 0.5C5 0.5 2.7 1.5 1 3.2L2.4 4.6C3.7 3.3 5.5 2.5 7.5 2.5Z" opacity="0.5"/>
                <path d="M7.5 5.5C8.8 5.5 9.9 6 10.7 6.9L12.1 5.5C10.9 4.3 9.3 3.5 7.5 3.5C5.7 3.5 4.1 4.3 2.9 5.5L4.3 6.9C5.1 6 6.2 5.5 7.5 5.5Z" opacity="0.75"/>
                <circle cx="7.5" cy="10" r="1.5"/>
              </svg>
            </div>
          </div>
        )}

        {/* Login (underneath cut panels) */}
        {showLogin && (
          <div
            className="absolute inset-0"
            style={{
              animation: phase === 'login' ? 'contentReveal 0.5s cubic-bezier(0.22,1,0.36,1) 0.06s both' : 'none',
              zIndex: 5,
            }}
          >
            <LoginScreen />
          </div>
        )}

        {/* Splash */}
        {phase === 'splash' && !cutting && <SplashScreen onTap={handleTap} />}

        {/* Cut animation overlay */}
        <CutOverlay active={cutting} />

        {/* Home indicator */}
        <div className="absolute bottom-2 w-full flex justify-center pb-1 z-40">
          <div
            className="w-32 h-1 rounded-full"
            style={{ background: phase === 'splash' ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.2)' }}
          />
        </div>
      </div>
    </div>
  )
}

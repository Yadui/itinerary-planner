import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { HomeIcon, ChevronDownIcon } from './Icons';

const EMAIL_DOMAIN = '@trip.io';
const RECENT_USERS_KEY = 'trip_recent_users';
const MAX_RECENT = 5;

function toEmail(input) {
  if (input.includes('@')) return input;
  return input.toLowerCase().trim() + EMAIL_DOMAIN;
}

function displayName(email) {
  if (!email) return '';
  if (email.endsWith(EMAIL_DOMAIN)) return email.replace(EMAIL_DOMAIN, '');
  return email;
}

function getRecentUsers() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_USERS_KEY) || '[]');
  } catch { return []; }
}

function addRecentUser(email) {
  const recent = getRecentUsers().filter((e) => e !== email);
  recent.unshift(email);
  localStorage.setItem(RECENT_USERS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

export default function AuthBar({ user, loading, onSignIn, onSignUp, onSignOut, onSave, saving, isDirty }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileForm, setShowMobileForm] = useState(false);
  const [switchingTo, setSwitchingTo] = useState(null);

  // Track successful logins
  useEffect(() => {
    if (user?.email) addRecentUser(user.email);
  }, [user?.email]);

  // Close menu on outside click
  useEffect(() => {
    if (!showUserMenu && !showMobileForm) return;
    const close = (e) => {
      if (!e.target.closest('.user-menu-container') && !e.target.closest('.auth-mobile-container')) {
        setShowUserMenu(false);
        setShowMobileForm(false);
      }
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [showUserMenu, showMobileForm]);

  if (loading) return null;

  const isHome = location.pathname === '/' || location.pathname === '/plan';

  if (user) {
    const recentUsers = getRecentUsers().filter((e) => e !== user.email);

    return (
      <div className="flex items-center gap-2 text-sm">
        {!isHome && (
          <button
            onClick={() => navigate('/plan')}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="Home"
          >
            <HomeIcon />
          </button>
        )}
        <div className="relative user-menu-container">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="w-6 h-6 rounded-full bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center text-xs font-semibold">
              {displayName(user.email)[0]?.toUpperCase() || '?'}
            </div>
            <span className="text-gray-700 font-medium truncate max-w-[100px]">{displayName(user.email)}</span>
            <ChevronDownIcon className="text-gray-300 text-xs" />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50">
              {/* Current user */}
              <div className="px-3 py-2 border-b border-gray-100">
                <p className="text-xs text-gray-400">Signed in as</p>
                <p className="text-sm font-medium text-gray-900 truncate">{displayName(user.email)}</p>
              </div>

              {/* Recent users / switch */}
              {recentUsers.length > 0 && (
                <div className="border-b border-gray-100">
                  <p className="px-3 pt-2 pb-1 text-[10px] text-gray-400 uppercase tracking-wider">Switch to</p>
                  {recentUsers.map((email) => (
                    <button
                      key={email}
                      disabled={switchingTo === email}
                      onClick={async () => {
                        setSwitchingTo(email);
                        try {
                          await onSignOut();
                          // Small delay to let signout complete
                          await new Promise((r) => setTimeout(r, 200));
                          await onSignIn(email, 'viet26');
                          setShowUserMenu(false);
                        } catch {
                          // If auto-login fails, just close menu — user is signed out
                          setShowUserMenu(false);
                        } finally {
                          setSwitchingTo(null);
                        }
                      }}
                      className="w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-[10px] font-semibold">
                        {displayName(email)[0]?.toUpperCase() || '?'}
                      </div>
                      <span className="text-sm text-gray-700 truncate">
                        {switchingTo === email ? 'Switching…' : displayName(email)}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Save action (only when a trip is open and editable) */}
              {onSave && (
                <>
                  <div className="border-b border-gray-100" />
                  <button
                    onClick={() => { onSave(); setShowUserMenu(false); }}
                    disabled={saving || !isDirty}
                    className="w-full px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-blue-50 transition-colors disabled:opacity-40"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isDirty ? 'bg-amber-400' : 'bg-green-400'}`} />
                    <span className={isDirty ? 'text-[#007AFF] font-medium' : 'text-gray-400'}>
                      {saving ? 'Saving…' : isDirty ? 'Save now' : 'All saved'}
                    </span>
                  </button>
                </>
              )}

              {/* Sign out */}
              <button
                onClick={() => { onSignOut(); setShowUserMenu(false); }}
                className="w-full px-3 py-2 text-sm text-left text-red-500 hover:bg-red-50 transition-colors"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username || !password) return;
    setSubmitting(true);
    setError(null);
    const email = toEmail(username);
    try {
      if (isSignUp) {
        await onSignUp(email, password);
      } else {
        await onSignIn(email, password);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {!isHome && (
        <button
          onClick={() => navigate('/plan')}
          className="text-gray-400 hover:text-gray-600 transition-colors mr-1"
          title="Home"
        >
          <HomeIcon />
        </button>
      )}

      {/* Desktop: inline form */}
      <form onSubmit={handleSubmit} className="hidden sm:flex items-center gap-2">
        <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username"
          className="px-2 py-1 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] w-28" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password"
          className="px-2 py-1 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] w-28" />
        <button type="submit" disabled={submitting}
          className="text-sm text-[#007AFF] font-medium hover:opacity-70 disabled:opacity-40 whitespace-nowrap">
          {submitting ? '…' : isSignUp ? 'Sign up' : 'Sign in'}
        </button>
        <button type="button" onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
          className="text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap">
          {isSignUp ? 'Have account?' : 'New here?'}
        </button>
        {error && <span className="text-xs text-red-500 max-w-[150px] truncate">{error}</span>}
      </form>

      {/* Mobile: compact button + dropdown */}
      <div className="sm:hidden relative auth-mobile-container">
        <button
          onClick={() => setShowMobileForm((v) => !v)}
          className="px-3 py-1.5 bg-[#007AFF] text-white text-sm font-semibold rounded-xl"
        >
          {isSignUp ? 'Sign up' : 'Sign in'}
        </button>
        {showMobileForm && (
          <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-200 p-4 z-50">
            <p className="text-sm font-semibold text-gray-900 mb-3">{isSignUp ? 'Create account' : 'Welcome back'}</p>
            <form onSubmit={handleSubmit} className="space-y-2.5">
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" autoFocus
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF]" />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF]" />
              <button type="submit" disabled={submitting || !username || !password}
                className="w-full py-2.5 bg-[#007AFF] text-white font-semibold rounded-xl text-sm hover:opacity-90 disabled:opacity-40 transition-opacity">
                {submitting ? '…' : isSignUp ? 'Sign up' : 'Sign in'}
              </button>
              {error && <p className="text-xs text-red-500">{error}</p>}
            </form>
            <button type="button" onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
              className="w-full mt-2 text-xs text-center text-gray-400 hover:text-gray-600 transition-colors py-1">
              {isSignUp ? 'Have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

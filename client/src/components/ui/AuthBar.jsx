import { useState } from 'react';

export default function AuthBar({ user, loading, onSignIn, onSignUp, onSignOut }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;

  if (user) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-500 truncate max-w-[160px]">{user.email}</span>
        <button
          onClick={onSignOut}
          className="text-gray-400 hover:text-gray-600"
        >
          Sign out
        </button>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || !password) return;
    setSubmitting(true);
    setError(null);
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
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email"
        className="px-2 py-1 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] w-36"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="password"
        className="px-2 py-1 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] w-28"
      />
      <button
        type="submit"
        disabled={submitting}
        className="text-sm text-[#007AFF] font-medium hover:opacity-70 disabled:opacity-40 whitespace-nowrap"
      >
        {submitting ? '…' : isSignUp ? 'Sign up' : 'Sign in'}
      </button>
      <button
        type="button"
        onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
        className="text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap"
      >
        {isSignUp ? 'Have account?' : 'New here?'}
      </button>
      {error && <span className="text-xs text-red-500 max-w-[150px] truncate">{error}</span>}
    </form>
  );
}

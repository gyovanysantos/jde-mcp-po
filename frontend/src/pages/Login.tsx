import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../lib/api";
import { FileText, Loader2 } from "lucide-react";

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    setLoading(true);
    setError(null);

    try {
      await login(username, password);
      navigate("/");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Login failed"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="rounded-xl bg-primary p-3">
            <FileText className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">JDE PO Hub</h1>
          <p className="text-sm text-gray-500">
            Sign in with your JD Edwards credentials
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border bg-white p-6 shadow-sm"
        >
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700 border border-red-200">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="username"
              className="mb-1.5 block text-sm font-medium text-gray-700"
            >
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="JDE username"
              required
              autoComplete="username"
              className="w-full rounded-lg border px-3 py-2 text-sm
                         focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-medium text-gray-700"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="JDE password"
              required
              autoComplete="current-password"
              className="w-full rounded-lg border px-3 py-2 text-sm
                         focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="flex w-full items-center justify-center gap-2 rounded-lg
                       bg-primary px-4 py-2.5 text-sm font-medium text-white
                       hover:bg-primary-dark disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-gray-400">
          Connected to JD Edwards EnterpriseOne via AIS
        </p>
      </div>
    </div>
  );
}

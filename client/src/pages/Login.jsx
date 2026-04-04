import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";

export default function Login() {
  const { token, login, loading } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  if (!loading && token) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message || "Login failed");
    }
  }

  return (
    <div className="login-page">
      <div className="card login-card">
        <h2>Sign in</h2>
        <p className="subtitle">Micro Finance administration</p>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="user">Username or email</label>
            <input
              id="user"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="pass">Password</label>
            <input
              id="pass"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error ? <p className="error">{error}</p> : null}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Please wait…" : "Sign in"}
            </button>
          </div>
        </form>
        <p className="subtitle" style={{ marginTop: "1.5rem", fontSize: "0.8rem" }}>
          First run seeds an admin: username <strong>admin</strong>, password{" "}
          <strong>Admin@123</strong> (change after login).
        </p>
      </div>
    </div>
  );
}

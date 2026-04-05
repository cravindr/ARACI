import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";

export default function Dashboard() {
  const { user, isAdmin } = useAuth();

  return (
    <div className="card">
      <h2>Welcome</h2>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        Signed in as <strong>{user?.username}</strong> ({user?.role}).
      </p>
      <p style={{ marginBottom: isAdmin ? "0.75rem" : 0 }}>
        <Link to="/board-rate">Gold board rate</Link>, <Link to="/customers">customers</Link>,{" "}
        <Link to="/jewel-loan">jewel pledge loan</Link>.
      </p>
      {isAdmin ? (
        <p style={{ marginBottom: 0 }}>
          Manage{" "}
          <Link to="/users">users</Link>, domain{" "}
          <Link to="/jewel-types">jewel types</Link>, and <Link to="/places">places</Link>.
        </p>
      ) : (
        <p style={{ color: "var(--muted)", marginBottom: 0 }}>
          You have standard User access. Contact an administrator to manage reference data or
          accounts.
        </p>
      )}
    </div>
  );
}

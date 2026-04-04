import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>Micro Finance</h1>
        <NavLink to="/" end className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
          Dashboard
        </NavLink>
        <NavLink
          to="/board-rate"
          className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
        >
          Board rate
        </NavLink>
        <NavLink
          to="/customers"
          className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
        >
          Customers
        </NavLink>
        {isAdmin && (
          <>
            <NavLink
              to="/users"
              className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
            >
              Users
            </NavLink>
            <NavLink
              to="/jewel-types"
              className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
            >
              Jewel types
            </NavLink>
            <NavLink
              to="/places"
              className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
            >
              Places
            </NavLink>
          </>
        )}
        <div className="sidebar-footer">
          <div>
            {user?.username}
            {user?.role && (
              <>
                {" "}
                ·{" "}
                <span className={user.role === "Administrator" ? "badge" : "badge badge-user"}>
                  {user.role}
                </span>
              </>
            )}
          </div>
          <button type="button" className="btn btn-ghost" style={{ marginTop: "0.5rem", width: "100%" }} onClick={logout}>
            Log out
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

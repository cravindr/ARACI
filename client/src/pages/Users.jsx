import { useCallback, useEffect, useState } from "react";
import * as api from "../api.js";
import { useAuth } from "../AuthContext.jsx";

export default function Users() {
  const { token, user: current } = useAuth();
  const [list, setList] = useState([]);
  const [roles, setRoles] = useState([]);
  const [err, setErr] = useState("");
  const [create, setCreate] = useState({
    username: "",
    email: "",
    password: "",
    roleId: 2,
  });
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setErr("");
    try {
      const [u, r] = await Promise.all([api.fetchUsers(token), api.fetchRoles(token)]);
      setList(u);
      setRoles(r);
    } catch (e) {
      setErr(e.message);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!roles.length) return;
    setCreate((c) =>
      roles.some((r) => r.id === c.roleId) ? c : { ...c, roleId: roles[0].id }
    );
  }, [roles]);

  async function onCreate(e) {
    e.preventDefault();
    setErr("");
    try {
      await api.createUser(token, {
        username: create.username,
        email: create.email,
        password: create.password,
        roleId: Number(create.roleId),
      });
      setCreate({ username: "", email: "", password: "", roleId: create.roleId });
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function onSaveEdit(e) {
    e.preventDefault();
    if (!editing) return;
    setErr("");
    try {
      const body = {
        username: editing.username,
        email: editing.email,
        roleId: Number(editing.roleId),
        isActive: editing.isActive,
      };
      if (editing.password) body.password = editing.password;
      await api.updateUser(token, editing.id, body);
      setEditing(null);
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function onDelete(id) {
    if (!window.confirm("Delete this user?")) return;
    setErr("");
    try {
      await api.deleteUser(token, id);
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2>Create user</h2>
        <form onSubmit={onCreate}>
          <div className="field">
            <label>Username</label>
            <input
              value={create.username}
              onChange={(e) => setCreate({ ...create, username: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={create.email}
              onChange={(e) => setCreate({ ...create, email: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={create.password}
              onChange={(e) => setCreate({ ...create, password: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>Role</label>
            <select
              value={create.roleId}
              onChange={(e) => setCreate({ ...create, roleId: Number(e.target.value) })}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Create
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Users</h2>
        {err ? <p className="error">{err}</p> : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((u) =>
                editing?.id === u.id ? (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>
                      <input
                        value={editing.username}
                        onChange={(e) => setEditing({ ...editing, username: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        value={editing.email}
                        onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        value={editing.roleId}
                        onChange={(e) =>
                          setEditing({ ...editing, roleId: Number(e.target.value) })
                        }
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={editing.isActive}
                        onChange={(e) =>
                          setEditing({ ...editing, isActive: e.target.checked })
                        }
                      />
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="btn btn-primary" onClick={onSaveEdit}>
                          Save
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => setEditing(null)}
                        >
                          Cancel
                        </button>
                      </div>
                      <div className="field" style={{ marginTop: "0.5rem" }}>
                        <label>New password (optional)</label>
                        <input
                          type="password"
                          value={editing.password || ""}
                          onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                        />
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>{u.username}</td>
                    <td>{u.email}</td>
                    <td>
                      <span className={u.role === "Administrator" ? "badge" : "badge badge-user"}>
                        {u.role}
                      </span>
                    </td>
                    <td>{u.isActive ? "Yes" : "No"}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() =>
                            setEditing({
                              id: u.id,
                              username: u.username,
                              email: u.email,
                              roleId: roles.find((r) => r.name === u.role)?.id ?? 2,
                              isActive: u.isActive,
                              password: "",
                            })
                          }
                        >
                          Edit
                        </button>
                        {u.id !== current?.id && (
                          <button
                            type="button"
                            className="btn btn-danger"
                            onClick={() => onDelete(u.id)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

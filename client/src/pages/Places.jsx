import { useCallback, useEffect, useState } from "react";
import * as api from "../api.js";
import { useAuth } from "../AuthContext.jsx";

export default function Places() {
  const { token } = useAuth();
  const [list, setList] = useState([]);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [initial, setInitial] = useState("");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setErr("");
    try {
      setList(await api.fetchPlaces(token));
    } catch (e) {
      setErr(e.message);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function onCreate(e) {
    e.preventDefault();
    setErr("");
    const ini = initial.trim().toUpperCase();
    if (ini.length !== 2) {
      setErr("Initial must be exactly 2 characters.");
      return;
    }
    try {
      await api.createPlace(token, { name, initial: ini, description });
      setName("");
      setInitial("");
      setDescription("");
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function onSave(e) {
    e.preventDefault();
    if (!editing) return;
    setErr("");
    const ini = (editing.initial || "").trim().toUpperCase();
    if (ini.length !== 2) {
      setErr("Initial must be exactly 2 characters.");
      return;
    }
    try {
      await api.updatePlace(token, editing.id, {
        name: editing.name,
        initial: ini,
        description: editing.description,
      });
      setEditing(null);
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function onDelete(id) {
    if (!window.confirm("Delete this place?")) return;
    setErr("");
    try {
      await api.deletePlace(token, id);
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2>Add place</h2>
        <form onSubmit={onCreate}>
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label>Initial (2 characters, unique)</label>
            <input
              value={initial}
              onChange={(e) => setInitial(e.target.value.toUpperCase().slice(0, 2))}
              maxLength={2}
              minLength={2}
              required
              placeholder="e.g. CH"
              style={{ maxWidth: "6rem", textTransform: "uppercase" }}
            />
          </div>
          <div className="field">
            <label>Description (optional)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Add
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Places</h2>
        {err ? <p className="error">{err}</p> : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Initial</th>
                <th>Name</th>
                <th>Description</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((row) =>
                editing?.id === row.id ? (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>
                      <input
                        value={editing.initial || ""}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            initial: e.target.value.toUpperCase().slice(0, 2),
                          })
                        }
                        maxLength={2}
                        style={{ width: "4rem", textTransform: "uppercase" }}
                      />
                    </td>
                    <td>
                      <input
                        value={editing.name}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        value={editing.description || ""}
                        onChange={(e) =>
                          setEditing({ ...editing, description: e.target.value })
                        }
                      />
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="btn btn-primary" onClick={onSave}>
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
                    </td>
                  </tr>
                ) : (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>
                      <span className="badge">{row.initial}</span>
                    </td>
                    <td>{row.name}</td>
                    <td>{row.description || "—"}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() =>
                            setEditing({
                              id: row.id,
                              name: row.name,
                              initial: row.initial || "",
                              description: row.description || "",
                            })
                          }
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => onDelete(row.id)}
                        >
                          Delete
                        </button>
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

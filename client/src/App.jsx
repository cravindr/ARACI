import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Users from "./pages/Users.jsx";
import JewelTypes from "./pages/JewelTypes.jsx";
import Places from "./pages/Places.jsx";
import BoardRate from "./pages/BoardRate.jsx";
import Customers from "./pages/Customers.jsx";
import Configuration from "./pages/Configuration.jsx";
import PledgeJewelLoan from "./pages/PledgeJewelLoan.jsx";
import Layout from "./components/Layout.jsx";

function PrivateRoute({ children }) {
  const { token, loading } = useAuth();
  if (loading) {
    return (
      <div className="login-page">
        <p className="subtitle">Loading…</p>
      </div>
    );
  }
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { isAdmin, loading } = useAuth();
  if (loading) {
    return (
      <div className="login-page">
        <p className="subtitle">Loading…</p>
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="board-rate" element={<BoardRate />} />
        <Route path="customers" element={<Customers />} />
        <Route path="jewel-loan" element={<PledgeJewelLoan />} />
        <Route
          path="users"
          element={
            <AdminRoute>
              <Users />
            </AdminRoute>
          }
        />
        <Route
          path="jewel-types"
          element={
            <AdminRoute>
              <JewelTypes />
            </AdminRoute>
          }
        />
        <Route
          path="places"
          element={
            <AdminRoute>
              <Places />
            </AdminRoute>
          }
        />
        <Route
          path="configuration"
          element={
            <AdminRoute>
              <Configuration />
            </AdminRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

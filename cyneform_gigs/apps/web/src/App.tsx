import { Navigate, Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import { RequireAuth } from "./components/RequireAuth";
import { Dashboard } from "./pages/Dashboard";
import { ForgotPassword } from "./pages/ForgotPassword";
import { Leave } from "./pages/Leave";
import { Login } from "./pages/Login";
import { Profile } from "./pages/Profile";
import { SetPassword } from "./pages/SetPassword";
import { UserDetailPage } from "./pages/UserDetail";
import { Users } from "./pages/Users";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/set-password" element={<SetPassword />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />

      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="profile" element={<Profile />} />
          <Route path="leave" element={<Leave />} />
          <Route element={<RequireAuth permission="users.view" />}>
            <Route path="users" element={<Users />} />
            <Route path="users/:id" element={<UserDetailPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

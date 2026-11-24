import { Navigate, Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import { RequireAuth } from "./components/RequireAuth";
import { BonusAdmin } from "./pages/BonusAdmin";
import { Calendar } from "./pages/Calendar";
import { Compensation } from "./pages/Compensation";
import { CompensationAdmin } from "./pages/CompensationAdmin";
import { CrmEntry } from "./pages/CrmEntry";
import { CrmList } from "./pages/CrmList";
import { Dashboard } from "./pages/Dashboard";
import { EquityAdmin } from "./pages/EquityAdmin";
import { ForgotPassword } from "./pages/ForgotPassword";
import { Gigs } from "./pages/Gigs";
import { Leave } from "./pages/Leave";
import { Login } from "./pages/Login";
import { MyPoints } from "./pages/MyPoints";
import { PointsAdmin } from "./pages/PointsAdmin";
import { PointsRules } from "./pages/PointsRules";
import { Profile } from "./pages/Profile";
import { SetPassword } from "./pages/SetPassword";
import { Settings } from "./pages/Settings";
import { Sources } from "./pages/Sources";
import { Training } from "./pages/Training";
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
          <Route path="settings" element={<Settings />} />
          <Route path="sources" element={<Sources />} />
          <Route path="gigs" element={<Gigs />} />
          <Route path="training" element={<Training />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="crm" element={<CrmList />} />
          <Route path="crm/:id" element={<CrmEntry />} />
          <Route path="compensation" element={<Compensation />} />
          <Route path="compensation/admin" element={<CompensationAdmin />} />
          <Route element={<RequireAuth permission="bonus.view_all" />}>
            <Route path="rewards/bonus" element={<BonusAdmin />} />
          </Route>
          <Route element={<RequireAuth permission="equity.view_all" />}>
            <Route path="rewards/equity" element={<EquityAdmin />} />
          </Route>
          <Route element={<RequireAuth permission="points.view_own" />}>
            <Route path="points" element={<MyPoints />} />
          </Route>
          <Route element={<RequireAuth permission="points.view_all" />}>
            <Route path="points/admin" element={<PointsAdmin />} />
          </Route>
          <Route element={<RequireAuth permission="rules.view" />}>
            <Route path="points/rules" element={<PointsRules />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

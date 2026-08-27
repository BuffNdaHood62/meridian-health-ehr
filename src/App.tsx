import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { AuthProvider, RequireAuth, RouteAuthenticationGate } from "./auth";
import { DoctorCodeProvider } from "./auth-doctor";
import { AppLayout } from "./components/layout/AppLayout";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import Patients from "./pages/Patients";
import PatientDetail from "./pages/PatientDetail";
import Orders from "./pages/Orders";
import LabResults from "./pages/LabResults";
import MedicalHistory from "./pages/MedicalHistory";
import Messages from "./pages/Messages";
import Settings from "./pages/Settings";
import ShareView from "./pages/ShareView";

// Scrolls to top on route change for a clean page transition
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <DoctorCodeProvider>
      <HashRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route element={<RequireAuth />}>
            <Route element={<RouteAuthenticationGate />}>
            <Route element={<AppLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="patients" element={<Patients />} />
              <Route path="patients/:id" element={<PatientDetail />} />
              <Route path="orders" element={<Orders />} />
              <Route path="labs" element={<LabResults />} />
              <Route path="history" element={<MedicalHistory />} />
              <Route path="messages" element={<Messages />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            </Route>
          </Route>
          <Route path="/share/:token" element={<ShareView />} />
          <Route path="schedule" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
      </DoctorCodeProvider>
    </AuthProvider>
  );
}

import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { AppLayout } from "./components/layout/AppLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Patients from "./pages/Patients";
import PatientDetail from "./pages/PatientDetail";
import Orders from "./pages/Orders";
import LabResults from "./pages/LabResults";
import MedicalHistory from "./pages/MedicalHistory";
import Schedule from "./pages/Schedule";
import Messages from "./pages/Messages";
import Settings from "./pages/Settings";

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
    <HashRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="patients" element={<Patients />} />
          <Route path="patients/:id" element={<PatientDetail />} />
          <Route path="orders" element={<Orders />} />
          <Route path="labs" element={<LabResults />} />
          <Route path="history" element={<MedicalHistory />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="messages" element={<Messages />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

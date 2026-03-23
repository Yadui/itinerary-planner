import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import PlanPage from './pages/PlanPage';
import TripPage from './pages/TripPage';
import JoinPage from './pages/JoinPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/plan" replace />} />
        <Route path="/plan" element={<PlanPage />} />
        <Route path="/trip/:id" element={<TripPage />} />
        <Route path="/trip/:id/join/:token" element={<JoinPage />} />
      </Routes>
    </BrowserRouter>
  );
}

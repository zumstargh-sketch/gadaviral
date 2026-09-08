import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from './auth.js';
import Layout from './components/Layout.js';
import Feed from './pages/Feed.js';
import Landing from './pages/Landing.js';
import Login from './pages/Login.js';
import Register from './pages/Register.js';
import Verify from './pages/Verify.js';
import Verified from './pages/Verified.js';
import ResetPassword from './pages/ResetPassword.js';
import GoogleComplete from './pages/GoogleComplete.js';
import PostDetail from './pages/PostDetail.js';
import Profile from './pages/Profile.js';
import Settings from './pages/Settings.js';
import Notifications from './pages/Notifications.js';
import Messages from './pages/Messages.js';
import Groups from './pages/Groups.js';
import GroupDetail from './pages/GroupDetail.js';
import Events from './pages/Events.js';
import Businesses from './pages/Businesses.js';
import Explore from './pages/Explore.js';
import Admin from './pages/Admin.js';

function RequireAuth({ children }: { children: any }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return null;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();
  return (
    <Routes>
      <Route path="/" element={!loading && !user ? <Landing /> : <Navigate to="/feed" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify" element={<Verify />} />
      <Route path="/verified" element={<Verified />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/auth/google/complete" element={<GoogleComplete />} />
      <Route element={<Layout />}>
        <Route path="/feed" element={<RequireAuth><Feed /></RequireAuth>} />
        <Route path="/explore" element={<RequireAuth><Explore /></RequireAuth>} />
        <Route path="/post/:id" element={<RequireAuth><PostDetail /></RequireAuth>} />
        <Route path="/u/:username" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="/notifications" element={<RequireAuth><Notifications /></RequireAuth>} />
        <Route path="/messages" element={<RequireAuth><Messages /></RequireAuth>} />
        <Route path="/groups" element={<RequireAuth><Groups /></RequireAuth>} />
        <Route path="/groups/:slug" element={<RequireAuth><GroupDetail /></RequireAuth>} />
        <Route path="/events" element={<RequireAuth><Events /></RequireAuth>} />
        <Route path="/businesses" element={<RequireAuth><Businesses /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth><Admin /></RequireAuth>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

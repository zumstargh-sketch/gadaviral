import { useState } from 'react';
import { useAuth } from '../auth.js';
import SettingsProfile from '../components/SettingsProfile.js';
import { SettingsSecurity, SettingsBlocks, SettingsDanger } from '../components/SettingsSecurity.js';

export default function Settings() {
  const { user } = useAuth();
  const [tab, setTab] = useState('profile');
  if (!user) return null;
  const T = ({ k, children }: any) => (
    <button className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{children}</button>
  );
  return (
    <div>
      <h2>Settings</h2>
      <div className="tabs">
        <T k="profile">Profile</T><T k="security">Security</T>
        <T k="blocks">Blocked users</T><T k="danger">Danger zone</T>
      </div>
      {tab === 'profile' && <SettingsProfile />}
      {tab === 'security' && <SettingsSecurity />}
      {tab === 'blocks' && <SettingsBlocks />}
      {tab === 'danger' && <SettingsDanger />}
    </div>
  );
}

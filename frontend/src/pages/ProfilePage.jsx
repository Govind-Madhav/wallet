import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import { BadgeInfo, Mail, PenLine, Phone, User, UserCircle2 } from 'lucide-react';

const buildProfileKey = (identifier) => `wallet-console-profile:${identifier || 'guest'}`;

export function ProfilePage({ session, addLog, addToast }) {
  const [profile, setProfile] = useState(() => {
    const fallbackProfile = {
      username: session.identifier || '',
      displayName: session.identifier || '',
      notificationEmail: session.identifier || '',
      phoneNumber: '',
      bio: '',
      alertsEnabled: true
    };

    try {
      const stored = globalThis.localStorage.getItem(buildProfileKey(session.identifier));
      if (stored) {
        return { ...fallbackProfile, ...JSON.parse(stored) };
      }
    } catch {
      // Ignore profile restore errors.
    }

    return fallbackProfile;
  });
  const [savedAt, setSavedAt] = useState(null);

  if (!session?.sessionId) {
    return <Navigate to="/auth" replace />;
  }

  const handleChange = (event) => {
    const { name, type, checked, value } = event.target;
    setProfile((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    try {
      globalThis.localStorage.setItem(buildProfileKey(session.identifier), JSON.stringify(profile));
      setSavedAt(new Date().toLocaleString());
      addToast('Profile Saved', 'Your profile settings were updated locally.', 'success');
      addLog('PROFILE_UPDATED', profile);
    } catch (error) {
      addToast('Save Failed', error.message, 'error');
      addLog('PROFILE_UPDATE_FAILED', error.message, 'error');
    }
  };

  return (
    <section className="page-stack">
      <div className="page-hero">
        <div>
          <p className="eyebrow">Profile</p>
          <h1>Edit and Manage Your Profile</h1>
          <p className="subhead">Update your local profile preferences and contact details.</p>
        </div>
        <div className="profile-mini-card">
          <UserCircle2 size={20} />
          <div>
            <strong>{session.identifier || 'User'}</strong>
            <div className="muted" style={{ fontSize: '0.8rem' }}>Active account session</div>
          </div>
        </div>
      </div>

      <div className="grid two profile-layout">
        <div className="panel stack">
          <div className="stack tight">
            <p className="eyebrow">Overview</p>
            <h2>Profile Summary</h2>
          </div>

          <div className="profile-summary-row">
            <BadgeInfo size={16} />
            <div>
              <strong>Account</strong>
              <div className="muted">{session.identifier || 'User'}</div>
            </div>
          </div>
          <div className="profile-summary-row">
            <User size={16} />
            <div>
              <strong>Username</strong>
              <div className="muted">{profile.username || '-'}</div>
            </div>
          </div>
          <div className="profile-summary-row">
            <Mail size={16} />
            <div>
              <strong>Email</strong>
              <div className="muted">{profile.notificationEmail || '-'}</div>
            </div>
          </div>
          <div className="profile-summary-row">
            <Phone size={16} />
            <div>
              <strong>Phone Number</strong>
              <div className="muted">{profile.phoneNumber || '-'}</div>
            </div>
          </div>
          <div className="profile-summary-row">
            <PenLine size={16} />
            <div>
              <strong>Status</strong>
              <div className="muted">{profile.alertsEnabled ? 'Security alerts enabled' : 'Security alerts muted'}</div>
            </div>
          </div>

          {savedAt && <div className="muted" style={{ fontSize: '0.8rem' }}>Last saved: {savedAt}</div>}
        </div>

        <form className="panel stack" onSubmit={handleSubmit}>
          <div className="stack tight">
            <p className="eyebrow">Edit Profile</p>
            <h2>Manage Details</h2>
          </div>

          <div className="field-label">
            <label htmlFor="profile-username">Username</label>
            <input id="profile-username" name="username" value={profile.username} onChange={handleChange} placeholder="Your username" />
          </div>

          <div className="field-label">
            <label htmlFor="profile-display-name">Display name</label>
            <input id="profile-display-name" name="displayName" value={profile.displayName} onChange={handleChange} placeholder="Your display name" />
          </div>

          <div className="field-label">
            <label htmlFor="profile-notification-email">Notification email</label>
            <input id="profile-notification-email" name="notificationEmail" type="email" value={profile.notificationEmail} onChange={handleChange} placeholder="you@example.com" />
          </div>

          <div className="field-label">
            <label htmlFor="profile-phone-number">Phone number</label>
            <input id="profile-phone-number" name="phoneNumber" value={profile.phoneNumber} onChange={handleChange} placeholder="Phone number" />
          </div>

          <div className="field-label">
            <label htmlFor="profile-bio">Bio</label>
            <textarea id="profile-bio" name="bio" value={profile.bio} onChange={handleChange} placeholder="Short profile note" />
          </div>

          <div className="toggle-row">
            <input id="profile-alerts-enabled" name="alertsEnabled" type="checkbox" checked={profile.alertsEnabled} onChange={handleChange} />
            <label htmlFor="profile-alerts-enabled" className="toggle-copy">
              <strong>Security alerts</strong>
              <div className="muted" style={{ fontSize: '0.8rem' }}>Keep email alerts enabled for withdrawal and device events.</div>
            </label>
          </div>

          <button className="btn" type="submit">Save Profile</button>
        </form>
      </div>
    </section>
  );
}

ProfilePage.propTypes = {
  session: PropTypes.shape({
    sessionId: PropTypes.string,
    identifier: PropTypes.string
  }).isRequired,
  addLog: PropTypes.func.isRequired,
  addToast: PropTypes.func.isRequired
};
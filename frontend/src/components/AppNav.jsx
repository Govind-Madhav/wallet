import PropTypes from 'prop-types';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ArrowRightLeft, UserCircle2, Shield } from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transactions', icon: ArrowRightLeft },
  { to: '/profile', label: 'Profile', icon: UserCircle2 },
  { to: '/admin', label: 'Admin', icon: Shield }
];

export function AppNav({ session }) {
  if (!session?.sessionId) {
    return null;
  }

  return (
    <nav className="top-nav" aria-label="Primary navigation">
      <div className="top-nav-links">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `top-nav-link ${isActive ? 'active' : ''}`}
            >
              <Icon size={16} />
              {item.label}
            </NavLink>
          );
        })}
      </div>

      <div className="top-nav-meta">
        <span className="top-nav-pill">Signed in</span>
        <strong>{session.identifier || 'User'}</strong>
      </div>
    </nav>
  );
}

AppNav.propTypes = {
  session: PropTypes.shape({
    sessionId: PropTypes.string,
    identifier: PropTypes.string
  }).isRequired
};
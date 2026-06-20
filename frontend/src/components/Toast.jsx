import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

export function ToastContainer({ toasts, removeToast }) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map(toast => {
        let Icon = Info;
        let iconClass = 'info';
        if (toast.type === 'success') { Icon = CheckCircle; iconClass = 'success'; }
        if (toast.type === 'error') { Icon = AlertCircle; iconClass = 'error'; }

        return (
          <div key={toast.id} className={`toast ${toast.type} ${toast.hiding ? 'hiding' : ''}`}>
            <Icon className={`toast-icon ${iconClass}`} size={18} />
            <div className="toast-content">
              <div className="toast-title">{toast.title}</div>
              {toast.message && <div className="toast-message">{toast.message}</div>}
            </div>
            <button 
              className="toast-close"
              onClick={() => removeToast(toast.id)}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

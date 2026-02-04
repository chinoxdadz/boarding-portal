// Security utility functions for XSS prevention and input sanitization

const Security = {
    // Sanitize HTML to prevent XSS attacks
    escapeHtml: (unsafe) => {
        if (typeof unsafe !== 'string') return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },

    // Sanitize text for safe display
    sanitizeText: (text) => {
        if (!text) return '';
        return Security.escapeHtml(String(text).trim());
    },

    // Validate room number (alphanumeric, max 10 chars)
    validateRoomNo: (roomNo) => {
        const sanitized = String(roomNo).trim();
        if (!/^[a-zA-Z0-9]{1,10}$/.test(sanitized)) {
            throw new Error('Invalid room number format');
        }
        return sanitized;
    },

    // Validate PIN (numeric, 4-6 digits)
    validatePin: (pin) => {
        const sanitized = String(pin).trim();
        if (!/^\d{4,6}$/.test(sanitized)) {
            throw new Error('PIN must be 4-6 digits');
        }
        return sanitized;
    },

    // Validate and sanitize ticket message
    validateMessage: (message) => {
        const sanitized = String(message).trim();
        if (sanitized.length < 10) {
            throw new Error('Message must be at least 10 characters');
        }
        if (sanitized.length > 1000) {
            throw new Error('Message too long (max 1000 characters)');
        }
        return Security.sanitizeText(sanitized);
    },

    // Rate limiting for login attempts
    rateLimiter: {
        attempts: new Map(),
        maxAttempts: 5,
        lockoutDuration: 15 * 60 * 1000, // 15 minutes

        canAttempt: (identifier) => {
            const now = Date.now();
            const record = Security.rateLimiter.attempts.get(identifier);
            
            if (!record) {
                return true;
            }

            // Check if lockout period has expired
            if (now - record.lastAttempt > Security.rateLimiter.lockoutDuration) {
                Security.rateLimiter.attempts.delete(identifier);
                return true;
            }

            // Check if max attempts exceeded
            if (record.count >= Security.rateLimiter.maxAttempts) {
                const remainingTime = Math.ceil(
                    (Security.rateLimiter.lockoutDuration - (now - record.lastAttempt)) / 1000 / 60
                );
                throw new Error(`Too many failed attempts. Try again in ${remainingTime} minutes.`);
            }

            return true;
        },

        recordAttempt: (identifier, success) => {
            const now = Date.now();
            const record = Security.rateLimiter.attempts.get(identifier) || { count: 0, lastAttempt: now };

            if (success) {
                // Clear on successful login
                Security.rateLimiter.attempts.delete(identifier);
            } else {
                // Increment failed attempts
                record.count++;
                record.lastAttempt = now;
                Security.rateLimiter.attempts.set(identifier, record);
            }
        }
    },

    // Content Security Policy configuration
    cspConfig: {
        'default-src': ["'self'"],
        'script-src': [
            "'self'",
            "https://www.gstatic.com/firebasejs/"
        ],
        'style-src': ["'self'", "'unsafe-inline'"], // Note: Consider removing unsafe-inline
        'img-src': ["'self'", "data:", "https:"],
        'connect-src': [
            "'self'",
            "https://*.firebaseio.com",
            "https://*.googleapis.com",
            "https://firestore.googleapis.com"
        ],
        'font-src': ["'self'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        'upgrade-insecure-requests': []
    },

    // Generate CSP header string
    getCspHeader: () => {
        return Object.entries(Security.cspConfig)
            .map(([key, values]) => `${key} ${values.join(' ')}`)
            .join('; ');
    },

    // Session management
    session: {
        timeout: 30 * 60 * 1000, // 30 minutes
        lastActivity: Date.now(),

        updateActivity: () => {
            Security.session.lastActivity = Date.now();
        },

        isExpired: () => {
            return (Date.now() - Security.session.lastActivity) > Security.session.timeout;
        },

        checkExpiration: () => {
            if (Security.session.isExpired()) {
                localStorage.removeItem('bh_tenant');
                alert('Your session has expired for security reasons. Please log in again.');
                window.location.reload();
                return false;
            }
            return true;
        }
    },

    // Initialize security measures
    init: () => {
        // Add activity listeners
        ['click', 'keypress', 'scroll', 'mousemove'].forEach(event => {
            document.addEventListener(event, Security.session.updateActivity, { passive: true });
        });

        // Check session every minute
        setInterval(() => {
            Security.session.checkExpiration();
        }, 60000);

        // Add CSP meta tag (Note: Server-side headers are preferred)
        const meta = document.createElement('meta');
        meta.httpEquiv = 'Content-Security-Policy';
        meta.content = Security.getCspHeader();
        document.head.appendChild(meta);
    }
};

// Auto-initialize security when script loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', Security.init);
} else {
    Security.init();
}

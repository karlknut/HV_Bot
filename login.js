document.addEventListener('DOMContentLoaded', () => {
    // Check if already logged in
    if (Auth.isAuthenticated()) {
        window.location.href = '/dashboard';
        return;
    }
    
    // Tab switching
    const tabs = document.querySelectorAll('.tab');
    const forms = document.querySelectorAll('.form');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            
            // Update active states
            tabs.forEach(t => t.classList.remove('active'));
            forms.forEach(f => f.classList.remove('active'));
            
            tab.classList.add('active');
            document.querySelector(`form[data-tab="${targetTab}"]`).classList.add('active');
            
            // Clear any messages
            document.getElementById('message').style.display = 'none';
        });
    });
    
    // Login form handler
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
        
        if (!username || !password) {
            UI.showMessage('Please fill in all fields');
            return;
        }
        
        UI.showLoading(true);
        
        try {
            console.log('Attempting login for:', username);
            
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });
            
            console.log('Login response status:', response.status);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Login failed' }));
                UI.showMessage(errorData.error || 'Login failed');
                UI.showLoading(false);
                return;
            }
            
            const result = await response.json();
            console.log('Login result:', result);
            
            if (result.success && result.token && result.user) {
                console.log('Login successful, setting auth data');
                
                // Set authentication data
                Auth.setAuth(result.token, result.user);
                
                // Verify the data was set correctly
                const storedToken = Auth.getToken();
                const storedUser = Auth.getUser();
                console.log('Stored token:', storedToken ? 'Present' : 'Missing');
                console.log('Stored user:', storedUser);
                
                UI.showMessage('Login successful! Redirecting...', 'success');
                
                // Short delay to show success message, then redirect
                setTimeout(() => {
                    console.log('Redirecting to dashboard...');
                    window.location.href = '/dashboard';
                }, 1000);
            } else {
                console.error('Invalid login response:', result);
                UI.showMessage(result.error || 'Login failed - invalid response');
                UI.showLoading(false);
            }
        } catch (error) {
            console.error('Login error:', error);
            UI.showMessage('Network error. Please try again.');
            UI.showLoading(false);
        }
    });
    
    // Register form handler
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('registerUsername').value.trim();
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        if (!username || !password || !confirmPassword) {
            UI.showMessage('Please fill in all fields');
            return;
        }
        
        if (password !== confirmPassword) {
            UI.showMessage('Passwords do not match');
            return;
        }
        
        if (password.length < 8) {
            UI.showMessage('Password must be at least 8 characters long');
            return;
        }
        
        UI.showLoading(true);
        
        try {
            console.log('Attempting registration for:', username);
            
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });
            
            const result = await response.json();
            console.log('Registration result:', result);
            
            if (result.success) {
                UI.showMessage('Registration successful! You can now login.', 'success');
                
                // Switch to login tab after successful registration
                setTimeout(() => {
                    document.querySelector('.tab[data-tab="login"]').click();
                    document.getElementById('loginUsername').value = username;
                    document.getElementById('loginUsername').focus();
                }, 1500);
            } else {
                UI.showMessage(result.error || 'Registration failed');
            }
        } catch (error) {
            console.error('Registration error:', error);
            UI.showMessage('Network error. Please try again.');
        }
        
        UI.showLoading(false);
    });
});
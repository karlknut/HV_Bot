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
        
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        
        if (!username || !password) {
            UI.showMessage('Please fill in all fields');
            return;
        }
        
        UI.showLoading(true);
        
        try {
            const result = await API.post('/api/login', { username, password });
            
            if (result.success) {
                Auth.setAuth(result.token, result.user);
                UI.showMessage('Login successful! Redirecting...', 'success');
                
                setTimeout(() => {
                    window.location.href = '/dashboard';
                }, 1000);
            } else {
                UI.showMessage(result.error || 'Login failed');
                UI.showLoading(false);
            }
        } catch (error) {
            UI.showMessage('Network error. Please try again.');
            UI.showLoading(false);
        }
    });
    
    // Register form handler
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('registerUsername').value;
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
            const result = await API.post('/api/register', { username, password });
            
            if (result.success) {
                UI.showMessage('Registration successful! You can now login.', 'success');
                
                // Switch to login tab after successful registration
                setTimeout(() => {
                    document.querySelector('.tab[data-tab="login"]').click();
                    document.getElementById('loginUsername').value = username;
                }, 1500);
            } else {
                UI.showMessage(result.error || 'Registration failed');
            }
        } catch (error) {
            UI.showMessage('Network error. Please try again.');
        }
        
        UI.showLoading(false);
    });
});
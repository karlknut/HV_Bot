      // Starfield animation
      const canvas = document.getElementById('starfield');
      const ctx = canvas.getContext('2d');
      
      function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
      
      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);
      
      const stars = [];
      const numStars = 200;
      
      for (let i = 0; i < numStars; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          radius: Math.random() * 2,
          opacity: Math.random(),
          speed: Math.random() * 0.5 + 0.1
        });
      }
      
      function drawStars() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        stars.forEach(star => {
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
          ctx.fill();
          
          star.opacity += (Math.random() - 0.5) * 0.02;
          star.opacity = Math.max(0.1, Math.min(1, star.opacity));
        });
        
        requestAnimationFrame(drawStars);
      }
      
      drawStars();

      // Utility functions
      const UI = {
        showMessage: (message, type = 'error') => {
          const messageEl = document.getElementById('message');
          messageEl.textContent = message;
          messageEl.className = `message ${type}`;
          messageEl.style.display = 'block';
          
          if (type === 'success') {
            setTimeout(() => {
              messageEl.style.display = 'none';
            }, 3000);
          }
        },
        
        showLoading: (show) => {
          const loading = document.getElementById('loading');
          loading.style.display = show ? 'flex' : 'none';
        }
      };

      const Auth = {
        setAuth: (token, user) => {
          // In a real app, you'd use localStorage here
          // For demo purposes, we'll simulate storage
          window.authData = { token, user };
        },
        
        getToken: () => {
          return window.authData?.token || null;
        },
        
        getUser: () => {
          return window.authData?.user || null;
        },
        
        isAuthenticated: () => {
          return !!window.authData?.token;
        }
      };

      // Initialize page
      document.addEventListener("DOMContentLoaded", () => {
        // Check if already logged in
        if (Auth.isAuthenticated()) {
          // In a real app, redirect to dashboard
          UI.showMessage("Already logged in!", "success");
          return;
        }

        // Tab switching
        const tabs = document.querySelectorAll(".tab");
        const forms = document.querySelectorAll(".form");

        tabs.forEach((tab) => {
          tab.addEventListener("click", () => {
            const targetTab = tab.dataset.tab;

            // Update active states
            tabs.forEach((t) => t.classList.remove("active"));
            forms.forEach((f) => f.classList.remove("active"));

            tab.classList.add("active");
            document.querySelector(`form[data-tab="${targetTab}"]`).classList.add("active");

            // Clear any messages
            document.getElementById("message").style.display = "none";
          });
        });

        // Login form handler
        document.getElementById("loginForm").addEventListener("submit", async (e) => {
          e.preventDefault();

          const username = document.getElementById("loginUsername").value.trim();
          const password = document.getElementById("loginPassword").value;

          if (!username || !password) {
            UI.showMessage("Please fill in all fields");
            return;
          }

          UI.showLoading(true);

          try {
            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Demo: accept any username/password combo for testing
            if (username && password) {
              const mockResult = {
                success: true,
                token: 'demo-token-' + Date.now(),
                user: { username: username, id: 1 }
              };

              Auth.setAuth(mockResult.token, mockResult.user);
              UI.showMessage("Login successful! Welcome back!", "success");
              
              setTimeout(() => {
                UI.showMessage("In a real app, you'd be redirected to the dashboard now.", "success");
              }, 2000);
            } else {
              UI.showMessage("Invalid credentials");
            }
          } catch (error) {
            UI.showMessage("Network error. Please try again.");
          }

          UI.showLoading(false);
        });

        // Register form handler
        document.getElementById("registerForm").addEventListener("submit", async (e) => {
          e.preventDefault();

          const username = document.getElementById("registerUsername").value.trim();
          const password = document.getElementById("registerPassword").value;
          const confirmPassword = document.getElementById("confirmPassword").value;

          if (!username || !password || !confirmPassword) {
            UI.showMessage("Please fill in all fields");
            return;
          }

          if (password !== confirmPassword) {
            UI.showMessage("Passwords do not match");
            return;
          }

          if (password.length < 8) {
            UI.showMessage("Password must be at least 8 characters long");
            return;
          }

          UI.showLoading(true);

          try {
            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Demo: always succeed for testing
            UI.showMessage("Registration successful! You can now login.", "success");

            // Switch to login tab after successful registration
            setTimeout(() => {
              document.querySelector('.tab[data-tab="login"]').click();
              document.getElementById("loginUsername").value = username;
              document.getElementById("loginUsername").focus();
            }, 1500);
          } catch (error) {
            UI.showMessage("Network error. Please try again.");
          }

          UI.showLoading(false);
        });
      });
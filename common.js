(function() {
    'use strict';
    
    let starCanvas, starCtx;
    let stars = [];
    let animationId;
    
    // Configuration based on page type
    const configs = {
        login: { numStars: 1000, speed: 0.3, alpha: 0.8 },
        dashboard: { numStars: 2500, speed: 0.4, alpha: 0.6 },
        status: { numStars: 1500, speed: 0.35, alpha: 0.7 }
    };
    
    function initStarfield() {
        starCanvas = document.getElementById("starfield");
        if (!starCanvas) {
            console.warn('Starfield canvas not found');
            return;
        }
        
        starCtx = starCanvas.getContext("2d");
        resizeCanvas();
        
        // Determine page type from body class or URL
        const pageType = document.body.className.includes('login') ? 'login' :
                        document.body.className.includes('dashboard') ? 'dashboard' :
                        window.location.pathname.includes('status') ? 'status' : 'dashboard';
        
        const config = configs[pageType] || configs.dashboard;
        
        initStars(config.numStars);
        startAnimation(config.speed, config.alpha);
        
        // Handle window resize
        window.addEventListener("resize", () => {
            resizeCanvas();
            initStars(config.numStars);
        });
    }
    
    function resizeCanvas() {
        starCanvas.width = window.innerWidth;
        starCanvas.height = window.innerHeight;
    }
    
    function initStars(numStars) {
        stars = [];
        for (let i = 0; i < numStars; i++) {
            stars.push({
                x: (Math.random() - 0.5) * starCanvas.width,
                y: (Math.random() - 0.5) * starCanvas.height,
                z: Math.random() * starCanvas.width
            });
        }
    }
    
    function drawStars(speed, alpha) {
        // Clear with subtle fade effect
        starCtx.fillStyle = "rgba(0, 0, 0, 0.1)";
        starCtx.fillRect(0, 0, starCanvas.width, starCanvas.height);
        
        for (let i = 0; i < stars.length; i++) {
            let star = stars[i];
            star.z -= speed;
            
            if (star.z <= 0) {
                star.x = (Math.random() - 0.5) * starCanvas.width;
                star.y = (Math.random() - 0.5) * starCanvas.height;
                star.z = starCanvas.width;
            }
            
            let k = 128.0 / star.z;
            let x = star.x * k + starCanvas.width / 2;
            let y = star.y * k + starCanvas.height / 2;
            
            if (x < 0 || x >= starCanvas.width || y < 0 || y >= starCanvas.height) continue;
            
            let size = (1 - star.z / starCanvas.width) * 2.5;
            let shade = 255 - Math.floor(star.z / starCanvas.width * 200);
            
            starCtx.fillStyle = `rgba(${shade}, ${shade}, ${shade}, ${alpha})`;
            starCtx.beginPath();
            starCtx.arc(x, y, size, 0, Math.PI * 2);
            starCtx.fill();
        }
    }
    
    function startAnimation(speed, alpha) {
        function animate() {
            drawStars(speed, alpha);
            animationId = requestAnimationFrame(animate);
        }
        animate();
    }
    
    function stopAnimation() {
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
    }
    
    // Initialize when DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initStarfield);
    } else {
        initStarfield();
    }
    
    // Handle page visibility changes to pause/resume animation
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            stopAnimation();
        } else {
            const pageType = document.body.className.includes('login') ? 'login' :
                            document.body.className.includes('dashboard') ? 'dashboard' :
                            window.location.pathname.includes('status') ? 'status' : 'dashboard';
            const config = configs[pageType] || configs.dashboard;
            startAnimation(config.speed, config.alpha);
        }
    });
    
    // Export functions for manual control if needed
    window.starfield = {
        init: initStarfield,
        stop: stopAnimation,
        start: function(speed = 0.4, alpha = 0.6) {
            startAnimation(speed, alpha);
        }
    };
})();
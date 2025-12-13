// ==========================================
// AI SKATING PHYSICS MODULE
// Handles directional speed decay and hard caps.
// ==========================================



function applyAISkatingPhysics(p) {
    const currentSpeed = Math.hypot(p.vx, p.vy);

    // If moving very slowly, just let friction handle it (in main loop)
    if (currentSpeed < 0.1) return;

    // 1. Calculate Movement Angle (Where am I going?)
    const moveAngle = Math.atan2(p.vy, p.vx);
    
    // 2. Calculate Deviation (Angle difference between facing and movement)
    // We rely on the global normalizeAngle function from your main file
    const angleDiff = Math.abs(normalizeAngle(moveAngle - p.angle));

    // 3. Determine Dynamic Limit
    // If deviation is > 60 degrees (approx 1.0 radian), we are skating "sideways/backwards"
    // Misaligned = 70% Max Speed. Aligned = 100% Max Speed.
    let dynamicLimit = p.maxSpeed;
    
    if (angleDiff > 1.0) {
        dynamicLimit = p.maxSpeed * 0.70; 
    }

    // 4. The Taper (Decay)
    // If we are faster than our allowed limit, slow down GRACEFULLY.
    if (currentSpeed > dynamicLimit) {
        // DECAY_RATE: How fast we lose speed when facing the wrong way.
        // 0.02 = Glides for a long time (Icy)
        // 0.05 = Slows down noticeably
        const DECAY_RATE = 0.08; 

        // Smoothly interpolate (Lerp) down to the limit
        const newSpeed = currentSpeed + (dynamicLimit - currentSpeed) * DECAY_RATE;
        
        // Apply the new speed while preserving the direction vector
        const ratio = newSpeed / currentSpeed;
        p.vx *= ratio;
        p.vy *= ratio;
    }
    
    // 5. Hard Cap (Absolute Max)
    // Prevents physics explosions from collisions pushing them to mach speed
    if (currentSpeed > p.maxSpeed) {
            const s = p.maxSpeed / currentSpeed;
            p.vx *= s;
            p.vy *= s;
    }
}
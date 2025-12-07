// ==========================================
// STRATEGY: THE POSSESSION MASTERS (BT8)
// ==========================================
// - High IQ passing system
// - Dynamic spacing to avoid clusters
// - Only shoots when truly open (>70% chance)
// - Designed to beat aggressive rush teams
// ==========================================

(function() {

    const STRATEGY_ID   = "BT8_Possession";
    const STRATEGY_NAME = "Possession Masters";

    // PASSING STATS TRACKER
    if (!window.BT8_STATS) {
        window.BT8_STATS = { attempts: 0, completions: 0 };
    }

    function makeBB(p) {
        const myGoalX    = (p.team === 0) ? goal1 : goal2; 
        const enemyGoal  = (p.team === 0) ? goal2 : goal1;
        const forwardDir = (enemyGoal > myGoalX) ? 1 : -1;
        
        // Zone detection
        const blueLineX = RX + (110 * forwardDir);
        const inOffZone = (forwardDir === 1) ? (p.x > blueLineX) : (p.x < blueLineX);
        const inDefZone = (forwardDir === 1) ? (p.x < RX - 110) : (p.x > RX + 110);
        
        const carrier = getPlayerById(puck.ownerId);
        const distToNet = Math.hypot(enemyGoal - p.x, RY - p.y);
        
        // Teammates
        const teammates = players.filter(m => 
            m.team === p.team && 
            m.id !== p.id && 
            m.type === "skater"
        );
        
        // Pressure detection
        let nearestOpp = 999;
        let oppCount = 0;
        for (const o of players) {
            if (o.team !== p.team) {
                const d = Math.hypot(p.x - o.x, p.y - o.y);
                if (d < nearestOpp) nearestOpp = d;
                if (d < 80) oppCount++;
            }
        }
        
        return {
            p, role: p.role, forwardDir,
            myGoalX, enemyGoal, blueLineX,
            inOffZone, inDefZone, distToNet,
            teammates, carrier,
            nearestOpp, oppCount,
            hasPuck: (puck.ownerId === p.id),
            mateHasPuck: (carrier && carrier.team === p.team && carrier.id !== p.id),
            oppHasPuck: (carrier && carrier.team !== p.team),
            loosePuck: (puck.ownerId === null),
            isUnderPressure: (nearestOpp < 50),
            isClustered: (oppCount >= 2)
        };
    }

    // ==========================================
    // ACTIONS
    // ==========================================

    // Smart Chase with Physics Prediction
    const actChase = (bb) => {
        const target = getPuckIntercept(bb.p);
        return { tx: target.x, ty: target.y, action: "none" };
    };

    // High-Percentage Shot (more aggressive volume)
    const actShoot = (bb) => {
        // Point blank range - ALWAYS shoot (don't skate into goalie!)
        if (bb.distToNet < 80) {
            return { tx: bb.enemyGoal, ty: RY, action: "shoot" };
        }
        
        // Good scoring position - SHOOT MORE!
        if (bb.distToNet > 220) return null; // Extended from 200
        
        // In offensive zone? Don't be too picky about lanes
        if (bb.inOffZone && bb.distToNet < 160) {
            // Take the shot even with some traffic (create rebounds)
            return { tx: bb.enemyGoal, ty: RY, action: "shoot" };
        }
        
        // Outside the zone - check if lane is clear
        if (isLaneBlocked(bb.p.x, bb.p.y, bb.enemyGoal, RY, bb.p.team)) return null;
        
        return { tx: bb.enemyGoal, ty: RY, action: "shoot" };
    };

    // Intelligent Pass Selection (more selective)
    const actSmartPass = (bb) => {
        // Don't pass immediately after receiving (reduce ping-pong)
        if (bb.p.possessionTime < 15) return null;

        const openMates = findOpenTeammates(bb.p);
        if (openMates.length === 0) return null;

        let bestTarget = null;
        let bestScore = -999;

        for (const option of openMates) {
            const mate = option.mate;
            
            // Skip if lane blocked (current OR future position)
            if (!option.currentClear && !option.futureClear) continue;
            
            let score = 0;
            
            // 1. Forward Progress (highest priority)
            const myProgress = (bb.p.x - bb.myGoalX) * bb.forwardDir;
            const mateProgress = (mate.x - bb.myGoalX) * bb.forwardDir;
            const progressGain = mateProgress - myProgress;
            
            // NEW: Only pass if significant forward progress (>30px)
            if (progressGain < 30 && !bb.isClustered) continue;
            
            score += progressGain * 2.0;
            
            // 2. Mate's Openness (space to operate)
            let mateSpace = 0;
            for (const o of players) {
                if (o.team !== bb.p.team) {
                    const d = Math.hypot(mate.x - o.x, mate.y - o.y);
                    if (d < 100) mateSpace -= (100 - d);
                }
            }
            score += mateSpace * 0.5;
            
            // 3. Scoring Position Bonus
            const mateDistToNet = Math.hypot(mate.x - bb.enemyGoal, mate.y - RY);
            if (mateDistToNet < 130) score += 80; // Increased bonus for slot position
            
            // 4. Panic Pass (if under heavy pressure, any safe pass is good)
            if (bb.isClustered && option.futureClear) {
                score += 100;
            }
            
            if (score > bestScore) {
                bestScore = score;
                bestTarget = option;
            }
        }

        if (bestTarget) {
            // STATS: Mark this player as intended recipient
            puck.passTargetId = bestTarget.mate.id;
            
            return { 
                tx: bestTarget.leadX, 
                ty: bestTarget.leadY, 
                action: "pass", 
                target: bestTarget.mate 
            };
        }

        return null;
    };

    // Possession Carry (patient advance)
    const actCarry = (bb) => {
        // Find the safest lane with space
        const lanes = [
            { x: bb.enemyGoal, y: RY - 70 },  // Top lane
            { x: bb.enemyGoal, y: RY },       // Center lane
            { x: bb.enemyGoal, y: RY + 70 }   // Bottom lane
        ];
        
        let bestLane = lanes[1];
        let bestScore = -999;
        
        for (const lane of lanes) {
            let score = 0;
            
            // Check enemy density in this lane
            for (const o of players) {
                if (o.team !== bb.p.team) {
                    const d = pointLineDistance(bb.p.x, bb.p.y, lane.x, lane.y, o.x, o.y);
                    score += d; // More distance = better
                }
            }
            
            if (score > bestScore) {
                bestScore = score;
                bestLane = lane;
            }
        }
        
        return { tx: bestLane.x, ty: bestLane.y, action: "none" };
    };

    // Support Position (Triangle Formation)
    const actSupport = (bb) => {
        if (!bb.carrier) return actChase(bb);
        
        // Position based on role
        const carrierToGoal = bb.enemyGoal - bb.carrier.x;
        const supportDist = 70;
        
        let offsetX = 0, offsetY = 0;
        
        if (bb.role === "C") {
            // Center: Trail behind for back pass
            offsetX = -bb.forwardDir * supportDist;
            offsetY = 0;
        } else if (bb.role === "RW" || bb.role === "LW") {
            // Wings: Flank wide for cross-ice pass
            offsetX = bb.forwardDir * 40;
            offsetY = (bb.role === "RW") ? 80 : -80;
        } else {
            // Defense: Stay back as safety valve
            offsetX = -bb.forwardDir * 100;
            offsetY = 0;
        }
        
        const tx = bb.carrier.x + offsetX;
        const ty = bb.carrier.y + offsetY;
        
        // Clamp to rink
        return { 
            tx: Math.max(120, Math.min(880, tx)), 
            ty: Math.max(170, Math.min(430, ty)), 
            action: "none" 
        };
    };

    // Defensive Positioning (aggressive in our zone)
    const actDefend = (bb) => {
        if (!bb.carrier) return actChase(bb);
        
        const carrierDist = Math.hypot(bb.carrier.x - bb.p.x, bb.carrier.y - bb.p.y);
        
        // CRITICAL: If opponent is near our crease, HIT THEM!
        const distCarrierToOurNet = Math.hypot(bb.carrier.x - bb.myGoalX, bb.carrier.y - RY);
        
        if (distCarrierToOurNet < 150) {
            // Close enough to hit - charge directly at them
            if (carrierDist < 100) {
                // Aim slightly ahead to intercept their path
                const leadX = bb.carrier.x + bb.carrier.vx * 10;
                const leadY = bb.carrier.y + bb.carrier.vy * 10;
                return { tx: leadX, ty: leadY, action: "none" };
            }
        }
        
        // Standard gap control - stay between carrier and our net
        const gapX = (bb.carrier.x + bb.myGoalX) / 2;
        const gapY = (bb.carrier.y + RY) / 2;
        
        // Don't chase too deep - maintain defensive structure
        const maxChase = bb.myGoalX + (bb.forwardDir * 200);
        const clampedX = (bb.forwardDir === 1) 
            ? Math.min(gapX, maxChase) 
            : Math.max(gapX, maxChase);
        
        return { tx: clampedX, ty: gapY, action: "none" };
    };

    // ==========================================
    // MAIN BRAIN
    // ==========================================
    function think(p) {
        const bb = makeBB(p);

        // ============================================
        // OFFENSE: I have the puck
        // ============================================
        if (bb.hasPuck) {
            
            // 1. CRITICAL: Point blank shot (prevent goalie collision!)
            if (bb.distToNet < 80) {
                return { tx: bb.enemyGoal, ty: RY, action: "shoot" };
            }
            
            // 2. DEFENSIVE ZONE EXIT: Clear it ASAP!
            if (bb.inDefZone) {
                // Look for a quick outlet pass up ice
                const pass = actSmartPass(bb);
                if (pass) return pass;
                
                // No pass? Chip it out hard along the boards
                const boardSide = (bb.p.y < RY) ? RY - 120 : RY + 120;
                return { tx: bb.enemyGoal, ty: boardSide, action: "shoot" }; // Hard clear
            }
            
            // 3. Emergency: Under heavy pressure? Pass immediately!
            if (bb.isClustered) {
                const pass = actSmartPass(bb);
                if (pass) return pass;
            }
            
            // 4. IN OFFENSIVE ZONE: Shoot first, ask questions later
            if (bb.inOffZone) {
                const shoot = actShoot(bb);
                if (shoot) return shoot;
                
                // Only pass if teammate is in PRIME scoring position
                const pass = actSmartPass(bb);
                if (pass && pass.target) {
                    const targetDist = Math.hypot(pass.target.x - bb.enemyGoal, pass.target.y - RY);
                    if (targetDist < 100) return pass; // Only pass to slot
                }
                
                // Otherwise drive net
                return actCarry(bb);
            }
            
            // 5. NEUTRAL ZONE: Look for good outlet pass
            const pass = actSmartPass(bb);
            if (pass) return pass;
            
            // 6. Carry puck forward (patient possession)
            return actCarry(bb);
        }

        // ============================================
        // SUPPORT: Teammate has puck
        // ============================================
        if (bb.mateHasPuck) {
            return actSupport(bb);
        }

        // ============================================
        // DEFENSE: Opponent has puck
        // ============================================
        if (bb.oppHasPuck) {
            return actDefend(bb);
        }

        // ============================================
        // LOOSE PUCK: Race for it
        // ============================================
        return actChase(bb);
    }

    // ==========================================
    // REGISTER
    // ==========================================
    if (typeof registerStrategy === "function") {
        registerStrategy(
            STRATEGY_ID,
            STRATEGY_NAME,
            "Canadiens",
            "MTL",
            think,
            { main: "#af1e2d", secondary: "#192168" } // Red - Blue
        );
    }

})();
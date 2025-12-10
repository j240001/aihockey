// ==========================================
// STRATEGY: HAND CRAFTED (BT9) - UPDATED v8
// ==========================================
// - Loose Pucks: Physics-Aware Iterative Solver (Fixes Jitter)
// - D-Zone: Priority Pass -> Carry -> Safety Pass
// ==========================================

(function() {

    const STRATEGY_ID   = "BT9_SmartPassing";
    const STRATEGY_NAME = "Hand Crafted v8"; 

    const T1 = {
        shot_range: 160, 
        def_shot_range: 220, 
        blue_line_offset: 110
    };

    // --- TRANSLATOR ---
    function getOldRole(newRole) {
        if (newRole === "C") return "P"; 
        if (newRole === "RW" || newRole === "LW") return "S"; 
        return "D"; 
    }

    // ==========================================
    // NEW HELPER: PHYSICS-AWARE INTERCEPT
    // ==========================================
    function predictPuckIntersection(p) {
        const pSpeed = Math.hypot(puck.vx, puck.vy);
        
        // 1. STATIONARY PUCK FIX (The "Drive-Through")
        // If the puck is barely moving, aim 15px THROUGH it.
        // This forces the skater's hitbox to collide with the puck's hitbox.
        if (pSpeed < 1.5) {
            const dx = puck.x - p.x;
            const dy = puck.y - p.y;
            const angle = Math.atan2(dy, dx);
            return { 
                x: puck.x + Math.cos(angle) * 15, 
                y: puck.y + Math.sin(angle) * 15 
            };
        }

        // 2. MOVING PUCK: EXACT PHYSICS SIMULATION
        // We simulate the puck moving + slowing down to find the
        // exact frame where the player can catch it.
        
        let tX = puck.x;
        let tY = puck.y;
        let tVX = puck.vx;
        let tVY = puck.vy;
        
        const mySpeed = 2.3; // Skater max speed approx
        const friction = 0.993; // Matches physics engine

        // Look up to 60 frames ahead (1 second)
        for(let frames = 1; frames <= 60; frames++) {
            // A. Simulate Puck Physics for 1 frame
            tX += tVX;
            tY += tVY;
            tVX *= friction;
            tVY *= friction;

            // B. Can I get there by this frame?
            const dist = Math.hypot(tX - p.x, tY - p.y);
            const possibleDist = frames * mySpeed;

            if (possibleDist >= dist) {
                // C. INTERCEPT FOUND!
                // Clamp to rink walls so we don't try to skate into the stands
                return {
                    x: Math.max(120, Math.min(880, tX)), 
                    y: Math.max(170, Math.min(430, tY))
                };
            }
        }

        // D. FALLBACK (Too fast to catch in 1 sec)
        // Just go to where it will be in 1 second.
        return {
            x: Math.max(120, Math.min(880, tX)),
            y: Math.max(170, Math.min(430, tY))
        };
    }

    // --- BLACKBOARD ---
    function makeBB(p) {
        const myGoalX   = (p.team === 0) ? goal1 : goal2; 
        const enemyGoal = (p.team === 0) ? goal2 : goal1;
        const defendingRight = (myGoalX > RX);
        const defBlueLine = defendingRight ? (RX + T1.blue_line_offset) : (RX - T1.blue_line_offset);
        const puckInDefZone = defendingRight ? (puck.x > defBlueLine) : (puck.x < defBlueLine);
        const carrier = getPlayerById(puck.ownerId);

        const p_translated = Object.create(p);
        p_translated.role = getOldRole(p.role);

        const attackerMate = players.find(m => {
            if (m.team !== p.team) return false;
            return getOldRole(m.role) === "P";
        });

        // Calculate intercept once per frame
        const intercept = predictPuckIntersection(p);

        return {
            p: p_translated,
            real_p: p,
            myGoalX,
            enemyGoal,
            defBlueLine,
            attackerMate, 
            hasPuck: (puck.ownerId === p.id),
            loosePuck: (puck.ownerId === null),
            oppHasPuck: (carrier && carrier.team !== p.team),
            teamHasPuck: (carrier && carrier.team === p.team),
            carrier,
            distToGoal: Math.hypot(enemyGoal - p.x, RY - p.y),
            inShotRange: (Math.hypot(enemyGoal - p.x, RY - p.y) < T1.shot_range),
            inDefShotRange: (Math.hypot(enemyGoal - p.x, RY - p.y) < T1.def_shot_range),
            isDelayedOffside: (offsideState.active && offsideState.team === p.team),
            puckInDefZone,
            
            // Stored calculations
            interceptPoint: intercept,
            carryTarget: null,
            passTarget: null,
            passPoint: null,
            dumpTarget: null
        };
    }

    // ==========================================
    // 1. SMART CONDITIONS
    // ==========================================
    
    const condHasPuck        = new ConditionNode(bb => bb.hasPuck);
    const condLoosePuck      = new ConditionNode(bb => bb.loosePuck);
    const condOppHasPuck     = new ConditionNode(bb => bb.oppHasPuck);
    const condTeamHasPuck    = new ConditionNode(bb => bb.teamHasPuck);
    const condPuckInDefZone  = new ConditionNode(bb => bb.puckInDefZone);
    const condInShotRange    = new ConditionNode(bb => bb.inShotRange);
    const condInDefShotRange = new ConditionNode(bb => bb.inDefShotRange);
    const condDelayedOffside = new ConditionNode(bb => bb.isDelayedOffside);

    const condForwardLaneClear = new ConditionNode(bb => {
        const p = bb.real_p;
        const forwardDir = (bb.enemyGoal > RX) ? 1 : -1;
        const targetX = p.x + (forwardDir * 150);
        const targetY = p.y; 

        if (isLaneBlocked(p.x, p.y, targetX, targetY, p.team)) return false;
        
        bb.carryTarget = { x: targetX, y: targetY };
        return true;
    });

    const condHasBreakoutPass = new ConditionNode(bb => {
        const p = bb.real_p;
        const options = findOpenTeammates(p); 
        if (options.length === 0) return false;

        const forwardDir = (bb.enemyGoal > RX) ? 1 : -1;

        // Filter: MUST BE FORWARD
        const forwardOptions = options.filter(o => (o.mate.x - p.x) * forwardDir > 0);
        if (forwardOptions.length === 0) return false;

        // Sort: Furthest Forward Wins
        forwardOptions.sort((a, b) => {
            const aFwd = (a.mate.x - p.x) * forwardDir;
            const bFwd = (b.mate.x - p.x) * forwardDir;
            return bFwd - aFwd;
        });

        const best = forwardOptions[0];
        if (!best.futureClear) return false;

        bb.passTarget = best.mate;
        bb.passPoint = { x: best.leadX, y: best.leadY };
        return true;
    });

    const condHasSafetyPass = new ConditionNode(bb => {
        const p = bb.real_p;
        const options = findOpenTeammates(p);
        if (options.length === 0) return false;

        // Sort: Closest / Safest
        options.sort((a, b) => {
            const d1 = Math.hypot(a.mate.x - p.x, a.mate.y - p.y);
            const d2 = Math.hypot(b.mate.x - p.x, b.mate.y - p.y);
            return d1 - d2;
        });

        const best = options[0];
        if (!best.futureClear) return false;

        bb.passTarget = best.mate;
        bb.passPoint = { x: best.leadX, y: best.leadY };
        return true;
    });

    const condHasNeutralForwardPass = new ConditionNode(bb => {
        const targets = findNeutralZonePassTargets(bb.real_p); 
        if (!targets || targets.length === 0) return false;

        const forwardDir = (bb.enemyGoal > RX) ? 1 : -1;
        targets.sort((a, b) => (b.mate.x * forwardDir) - (a.mate.x * forwardDir));

        bb.passTarget = targets[0].mate;
        bb.passPoint = { x: targets[0].leadX, y: targets[0].leadY };
        return true;
    });

    const condCanDumpPuck = new ConditionNode(bb => {
        const p = bb.real_p;
        const goalX = bb.enemyGoal;
        if (!isLaneBlocked(p.x, p.y, goalX, RY, p.team)) {
            bb.dumpTarget = { x: goalX, y: RY };
            return true;
        }
        const cornerY = (p.y < RY) ? RY - 250 : RY + 250;
        bb.dumpTarget = { x: goalX, y: cornerY };
        return true;
    });


    // ==========================================
    // 2. ACTIONS 
    // ==========================================

    const actSmartIntercept = new ActionNode(bb => {
        return { tx: bb.interceptPoint.x, ty: bb.interceptPoint.y, action: "none" };
    });

    const actDriveNet  = new ActionNode(bb => ({ tx: bb.enemyGoal, ty: RY, action: "none" }));
    const actShoot     = new ActionNode(bb => ({ tx: bb.enemyGoal, ty: RY, action: "shoot" }));

    const actExecuteCarry = new ActionNode(bb => {
        if (!bb.carryTarget) return null;
        return { tx: bb.carryTarget.x, ty: bb.carryTarget.y, action: "none" };
    });

    const actExecutePass = new ActionNode(bb => {
        if (!bb.passTarget) return null;
        return { tx: bb.passPoint.x, ty: bb.passPoint.y, action: "pass", target: bb.passTarget };
    });

    const actExecuteDump = new ActionNode(bb => {
        if (!bb.dumpTarget) return null;
        return { tx: bb.dumpTarget.x, ty: bb.dumpTarget.y, action: "shoot" }; 
    });

    const actShakePressure = new ActionNode(bb => {
        const p = bb.real_p;
        const targetY = (p.y < RY) ? p.y - 120 : p.y + 120;
        return { tx: p.x, ty: targetY, action: "none" };
    });

    const actHoverBlueLine = new ActionNode(bb => {
        if (typeof hoverDynamicLine === 'function') return hoverDynamicLine(bb);
        return { tx: RX, ty: RY, action: "none" };
    });

    const actAttackerBreakout = new ActionNode(bb => {
        const candidates = [RY - 80, RY, RY + 80];
        const testX = bb.enemyGoal; 
        let bestY = RY;
        let bestScore = -9999;
        for (let y of candidates) {
            const score = openSpaceScore(testX, y, bb.real_p.team);
            if (score > bestScore) { bestScore = score; bestY = y; }
        }
        return { tx: bb.enemyGoal, ty: bestY, action: "none" };
    });

    const actMirrorAttacker = new ActionNode(bb => {
        if (!bb.attackerMate) return { tx: puck.x, ty: puck.y, action: "none" };
        const attacker = bb.attackerMate;
        const attackerIsTop = (attacker.y < RY);
        const laneOffset = 85; 
        const targetY = attackerIsTop ? (RY + laneOffset) : (RY - laneOffset);
        return { tx: puck.x, ty: targetY, action: "none" };
    });

    const actTagUp_T1 = new ActionNode(bb => {
        const dir = (bb.enemyGoal > RX) ? 1 : -1;
        const safeX = RX - dir * 80; 
        return { tx: safeX, ty: RY, action: "none" };
    });


    // ==========================================
    // 3. TREES
    // ==========================================

    const SEQ_D_ZONE_BREAKOUT = new SequenceNode([
        condPuckInDefZone, 
        new SelectorNode([
            new SequenceNode([ condHasBreakoutPass, actExecutePass ]),
            new SequenceNode([ condForwardLaneClear, actExecuteCarry ]),
            new SequenceNode([ condHasSafetyPass, actExecutePass ]),
            actShakePressure
        ])
    ]);

    const SEQ_NZ_DEFENDER = new SequenceNode([
        new ConditionNode(bb => !bb.puckInDefZone && !bb.inShotRange),
        new SelectorNode([
            new SequenceNode([ condForwardLaneClear, actExecuteCarry ]),
            new SequenceNode([ condHasNeutralForwardPass, actExecutePass ]),
            new SequenceNode([ condCanDumpPuck, actExecuteDump ])
        ])
    ]);


    // --- MAIN ROLES ---

    const TREE_ATTACKER = new SelectorNode([
        new SequenceNode([ condDelayedOffside, actTagUp_T1 ]),
        new SequenceNode([
            condHasPuck,
            new SelectorNode([
                SEQ_D_ZONE_BREAKOUT, 
                new SequenceNode([ condInShotRange, actShoot ]),
                actDriveNet 
            ])
        ]),
        new SequenceNode([ condTeamHasPuck, actAttackerBreakout ]),
        
        // ** SMART INTERCEPT ** (Replaces actChasePuck)
        actSmartIntercept 
    ]);

    const TREE_WINGER = new SelectorNode([
        new SequenceNode([ condDelayedOffside, actTagUp_T1 ]),
        new SequenceNode([
            condHasPuck,
            new SelectorNode([
                SEQ_D_ZONE_BREAKOUT, 
                new SequenceNode([ condInShotRange, actShoot ]),
                actDriveNet
            ])
        ]),
        new SequenceNode([ condLoosePuck, actSmartIntercept ]),
        actMirrorAttacker
    ]);

    const TREE_DEFENDER = new SelectorNode([
        new SequenceNode([ condDelayedOffside, actTagUp_T1 ]),
        new SequenceNode([
            condHasPuck,
            new SelectorNode([
                SEQ_D_ZONE_BREAKOUT, 
                SEQ_NZ_DEFENDER,     
                new SequenceNode([ condInShotRange, actShoot ]),
                actDriveNet
            ])          
        ]),
        new SequenceNode([ condLoosePuck, condPuckInDefZone, actSmartIntercept ]),
        new SequenceNode([
            condOppHasPuck,
            new SelectorNode([
                new SequenceNode([ condPuckInDefZone, actSmartIntercept ]), 
                actHoverBlueLine 
            ])
        ]),
        actHoverBlueLine
    ]);

    // --- MAIN FUNCTION ---
    function think(p) {
        const bb = makeBB(p);
        
        if (bb.p.role === "P") return TREE_ATTACKER.tick(bb);
        if (bb.p.role === "S") return TREE_WINGER.tick(bb);
        if (bb.p.role === "D") return TREE_DEFENDER.tick(bb);

        return { tx: RX, ty: RY, action: "none" };
    }

    if (typeof registerStrategy === "function") {
        registerStrategy(
            STRATEGY_ID,
            STRATEGY_NAME,
            "Oilers",
            "EDM",
            think, 
            { main: "#ff6b26", secondary: "#1814ff" }
        );
    }

})();
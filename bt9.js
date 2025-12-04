// ==========================================
// STRATEGY: ORIGINAL TEAM 1 (BT9)
// ==========================================
// - "Smart Passing" (Calculates Openness)
// - Uses Forward/Sniper/Defender trees
// ==========================================

(function() {

    const STRATEGY_ID   = "BT9_SmartPassing";
    const STRATEGY_NAME = "Original Team 1"; 

    const T1 = {
        shot_range: 150, 
        def_shot_range: 200, 
        pressure_dist: 55,
        blue_line_offset: 110
    };

    // --- TRANSLATOR ---
    function getOldRole(newRole) {
        if (newRole === "C") return "P"; // Playmaker (Attacker)
        if (newRole === "RW" || newRole === "LW") return "S"; // Sniper (Winger)
        return "D"; // Defender
    }

    // --- BLACKBOARD ---
    function makeBB(p) {
        const myGoalX   = (p.team === 0) ? goal1 : goal2; // Note: Original was team==1, we use generic
        const enemyGoal = (p.team === 0) ? goal2 : goal1;
        const defendingRight = (myGoalX > RX);
        const defBlueLine = defendingRight ? (RX + T1.blue_line_offset) : (RX - T1.blue_line_offset);
        const puckInDefZone = defendingRight ? (puck.x > defBlueLine) : (puck.x < defBlueLine);
        const carrier = getPlayerById(puck.ownerId);

        // *** APPLY TRANSLATED ROLE TO P ***
        const p_translated = Object.create(p);
        p_translated.role = getOldRole(p.role);

        // Find the OTHER forward (P looking for S, S looking for P)
        const forwardRoleToFind = (p_translated.role === "P") ? "S" : "P";
        
        // We have to scan players and translate their roles on the fly to match
        const forwardMate = players.find(m => {
            if (m.team !== p.team) return false;
            const mRole = getOldRole(m.role);
            return mRole === forwardRoleToFind;
        });

        const attackerMate = players.find(m => {
            if (m.team !== p.team) return false;
            return getOldRole(m.role) === "P";
        });

        // GOLDEN RULE CHECK
        let amIClosest = true;
        const myDistToPuck = Math.hypot(puck.x - p.x, puck.y - p.y);
        for (const mate of players) {
            if (mate.team === p.team && mate.id !== p.id && mate.type === "skater") {
                const d = Math.hypot(puck.x - mate.x, puck.y - mate.y);
                if (d < myDistToPuck) { amIClosest = false; break; }
            }
        }

        let distToCarrier = 9999;
        if (carrier) {
            distToCarrier = Math.hypot(carrier.x - p.x, carrier.y - p.y);
        }

        const distFromGoalLine = Math.abs(puck.x - myGoalX);
        const isDeepInZone = (puckInDefZone && distFromGoalLine < 60);

        return {
            p: p_translated,
            real_p: p,
            myGoalX,
            enemyGoal,
            defBlueLine,
            forwardMate,
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
            isDeepInZone,
            distToCarrier,
            amIClosest
        };
    }

    // --- CONDITIONS ---
    const condHasPuck        = new ConditionNode(bb => bb.hasPuck);
    const condLoosePuck      = new ConditionNode(bb => bb.loosePuck);
    const condOppHasPuck     = new ConditionNode(bb => bb.oppHasPuck);
    const condTeamHasPuck    = new ConditionNode(bb => bb.teamHasPuck);
    const condPuckInDefZone  = new ConditionNode(bb => bb.puckInDefZone);
    const condInShotRange    = new ConditionNode(bb => bb.inShotRange);
    const condInDefShotRange = new ConditionNode(bb => bb.inDefShotRange);
    const condAmIClosest     = new ConditionNode(bb => bb.amIClosest);
    const DZone              = new ConditionNode(bb => (bb.myGoalX > RX) ? bb.real_p.x > (RX + T1.blue_line_offset) : bb.real_p.x < (RX - T1.blue_line_offset));
    const OZone              = new ConditionNode(bb => (bb.enemyGoal > RX) ? bb.real_p.x > (RX + T1.blue_line_offset) : bb.real_p.x < (RX - T1.blue_line_offset));
    const condPuckDeep       = new ConditionNode(bb => bb.isDeepInZone);
    const condInHittingRange = new ConditionNode(bb => bb.distToCarrier < 60);
    const condDelayedOffside = new ConditionNode(bb => bb.isDelayedOffside);

    // --- ACTIONS ---
    const actChasePuck = new ActionNode(bb => ({ tx: puck.x, ty: puck.y, action: "none" }));
    const actDriveNet = new ActionNode(bb => ({ tx: bb.enemyGoal, ty: RY, action: "none" }));
    const actShoot = new ActionNode(bb => ({ tx: bb.enemyGoal, ty: RY, action: "shoot" }));

    const actBodyCheck = new ActionNode(bb => {
        if (!bb.carrier) return null;
        const tx = bb.carrier.x + bb.carrier.vx * 10;
        const ty = bb.carrier.y + bb.carrier.vy * 10;
        return { tx: tx, ty: ty, action: "none" };
    });

    const actGapControl = new ActionNode(bb => {
        if (!bb.carrier) return null;
        const midX = (bb.carrier.x + bb.myGoalX) / 2;
        const midY = (bb.carrier.y + RY) / 2;
        return { tx: midX, ty: midY, action: "none" };
    });

    const actHoverBlueLine = new ActionNode(bb => {
        // Reuse helper if available, or simple logic
        if (typeof hoverDynamicLine === 'function') return hoverDynamicLine(bb);
        return { tx: RX, ty: RY, action: "none" };
    });

    const actEvadePressure = new ActionNode(bb => {
        if (typeof evadePressure === 'function') return evadePressure(bb);
        return null;
    });

    const actDefenderPass = new ActionNode(bb => {
        const mates = players.filter(m => m.team === bb.real_p.team && m.id !== bb.real_p.id && m.type === "skater");
        let bestTarget = null, bestDistToNet = Infinity;
        for (const m of mates) {
            let safe = true;
            for (const o of players) {
                if (o.team !== bb.real_p.team && Math.hypot(o.x - m.x, o.y - m.y) < 80) { safe = false; break; }
            }
            if (!safe) continue;
            if (isLaneBlocked(bb.real_p.x, bb.real_p.y, m.x, m.y, bb.real_p.team)) continue;
            const dToNet = Math.hypot(m.x - bb.enemyGoal, m.y - RY);
            if (dToNet < bestDistToNet) { bestDistToNet = dToNet; bestTarget = m; }
        }
        if (bestTarget) return { tx: bestTarget.x, ty: bestTarget.y, action: "pass", target: bestTarget };
        return null; 
    });

    const actMirrorAttacker = new ActionNode(bb => {
        if (!bb.attackerMate) return { tx: puck.x, ty: puck.y, action: "none" };
        const attacker = bb.attackerMate;
        const attackerIsTop = (attacker.y < RY);
        const laneOffset = 85; 
        const targetY = attackerIsTop ? (RY + laneOffset) : (RY - laneOffset);
        return { tx: puck.x, ty: targetY, action: "none" };
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

    const actSmartForwardPass = new ActionNode(bb => {
        if (!bb.forwardMate) return null; 
        const mate = bb.forwardMate;

        function getOpennessScore(player) {
            let score = 100;
            let nearestDist = 999;
            for (const o of players) {
                if (o.team !== bb.real_p.team) {
                    const d = Math.hypot(player.x - o.x, player.y - o.y);
                    if (d < nearestDist) nearestDist = d;
                }
            }
            if (nearestDist < 80) score -= (80 - nearestDist) * 2;
            if (isLaneBlocked(player.x, player.y, bb.enemyGoal, RY, bb.real_p.team)) score -= 50; 
            return score;
        }

        if (isLaneBlocked(bb.real_p.x, bb.real_p.y, mate.x, mate.y, bb.real_p.team)) return null;
        const myScore = getOpennessScore(bb.real_p);
        const mateScore = getOpennessScore(mate);
        if (mateScore > myScore + 20) {
            return { tx: mate.x, ty: mate.y, action: "pass", target: mate };
        }
        return null; 
    });

    const actTagUp_T1 = new ActionNode(bb => {
        const dir = (bb.enemyGoal > RX) ? 1 : -1;
        const safeX = RX - dir * 80; 
        return { tx: safeX, ty: RY, action: "none" };
    });

    // === TREES ===
    const TREE_ATTACKER = new SelectorNode([
        new SequenceNode([ condDelayedOffside, actTagUp_T1 ]),
        new SequenceNode([
            condHasPuck,
            new SelectorNode([
                new SequenceNode([ condInShotRange, actShoot ]), 
                actSmartForwardPass, 
                actDriveNet 
            ])
        ]),
        new SequenceNode([ condTeamHasPuck, actAttackerBreakout ]),
        actChasePuck 
    ]);

    const TREE_WINGER = new SelectorNode([
        new SequenceNode([ condDelayedOffside, actTagUp_T1 ]),
        new SequenceNode([
            condHasPuck,
            new SelectorNode([
                new SequenceNode([ condInShotRange, actShoot ]), 
                actSmartForwardPass, 
                actDriveNet 
            ])
        ]),
        new SequenceNode([ condLoosePuck, condAmIClosest, actChasePuck ]),
        actMirrorAttacker
    ]);

    const TREE_DEFENDER = new SelectorNode([
        new SequenceNode([ condDelayedOffside, actTagUp_T1 ]),
        new SequenceNode([
            condHasPuck,
            new SelectorNode([
                new SequenceNode([
                    OZone,
                    new SelectorNode([
                        new SequenceNode([ condInDefShotRange, actShoot ]),
                        actDriveNet
                    ])
                ]),    
                new SequenceNode([    
                    DZone,
                    new SelectorNode([
                        actEvadePressure,
                        actDefenderPass,
                        new SequenceNode([ condInDefShotRange, actShoot ]),
                        actDriveNet
                    ])
                ])    
            ])          
        ]),
        new SequenceNode([ condLoosePuck, condPuckInDefZone, actChasePuck ]),
        new SequenceNode([
            condOppHasPuck,
            new SelectorNode([
                new SequenceNode([ condPuckDeep, actChasePuck ]),
                new SequenceNode([ condInHittingRange, actBodyCheck ]),
                actGapControl
            ])
        ]),
        actHoverBlueLine
    ]);

    // --- MAIN FUNCTION ---
    function think(p) {
        const bb = makeBB(p);
        
        // Logic for old roles
        if (bb.p.role === "P") return TREE_ATTACKER.tick(bb);
        if (bb.p.role === "S") return TREE_WINGER.tick(bb);
        if (bb.p.role === "D") return TREE_DEFENDER.tick(bb);

        return { tx: RX, ty: RY, action: "none" };
    }

    if (typeof registerStrategy === "function") {
        registerStrategy(
            STRATEGY_ID,
            "Hand Crafted",
            "Oilers",
            "EDM",
            think, 
            { main: "#ff6b26", secondary: "#1814ff" } // Orange - Blue
        );
    }

})();
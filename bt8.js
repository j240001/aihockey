// ==========================================
// STRATEGY: BT8 - THE RELAY SYSTEM (D-Zone Safety)
// ==========================================
// - Fix: "Paranoid Slot" (High Pressure sensitivity).
// - Fix: D-Zone passes MUST target Neutral Zone.
// - Result: No more passing into own slot/goalie.
// ==========================================

(function() {

    const STRATEGY_ID   = "BT8_Relay";
    const STRATEGY_NAME = "The Relay System";

    const RY = 320; 
    const RX = 500; 

    // --- HELPER: DETECT ZONE (0-10) ---
    function getZoneID(puckX, puckY, attackingRight) {
        const absX = attackingRight ? puckX : (1000 - puckX); 
        let yZone = "C";
        if (puckY < 260) yZone = "T";
        if (puckY > 380) yZone = "B";

        if (absX < 350) {
            if (absX < 100) return 0; // Behind Net
            if (yZone === "T") return 1; 
            if (yZone === "B") return 3; 
            return 2; // Slot (Danger)
        }
        if (absX < 650) {
            if (yZone === "T") return 4; 
            if (yZone === "B") return 6; 
            return 5; 
        }
        if (absX < 900) {
            if (yZone === "T") return 7; 
            if (yZone === "B") return 9; 
            return 8; 
        }
        return 10; 
    }

    // --- HELPER: DEFINE CHAIRS ---
    function getChairs(zoneID, bb) {
        const myGoal = bb.myGoalX;
        const enemyGoal = bb.enemyGoal;
        const dir = (bb.attackingRight) ? 1 : -1; 

        let c1 = { x: RX, y: RY };
        let c2 = { x: RX, y: RY };

        const offenseMode = bb.teamHasPuck;

        switch (zoneID) {
            // --- DEFENSIVE ZONES ---
            case 0: 
            case 1: 
            case 2: 
            case 3: 
                const strongSideY = (puck.y < RY) ? RY - 70 : RY + 70;
                if (offenseMode) {
                    // Outlet: Push FAR into Neutral Zone (Stretch the ice)
                    c1 = { x: myGoal + (dir * 350), y: (puck.y < RY) ? RY - 250 : RY + 250 }; 
                    // Safety: Post
                    c2 = { x: myGoal + (dir * 30), y: strongSideY }; 
                } else {
                    c1 = { x: myGoal + (dir * 30), y: RY - 30 }; 
                    c2 = { x: myGoal + (dir * 30), y: RY + 30 }; 
                }
                break;

            // --- NEUTRAL ZONES ---
            case 4: 
            case 6: 
            case 5:
                if (offenseMode) {
                    c1 = { x: enemyGoal - (dir * 300), y: RY - 100 }; 
                    c2 = { x: enemyGoal - (dir * 300), y: RY + 100 }; 
                } else {
                    c1 = { x: RX, y: RY }; 
                    c2 = { x: myGoal + (dir * 350), y: RY }; 
                }
                break;

            // --- OFFENSIVE ZONES ---
            case 7: 
            case 9: 
                c1 = { x: enemyGoal - (dir * 50), y: (puck.y > RY) ? RY - 200 : RY + 200 }; 
                c2 = { x: enemyGoal - (dir * 280), y: RY }; 
                break;
            case 8: 
            case 10: 
                c1 = { x: enemyGoal - (dir * 30), y: RY - 50 }; 
                c2 = { x: enemyGoal - (dir * 250), y: RY }; 
                break;
        }
        return [c1, c2];
    }


    // --- BLACKBOARD ---
    function makeBB(p) {
        const myGoalX = (p.team === 0) ? goal1 : goal2;
        const enemyGoal = (p.team === 0) ? goal2 : goal1;
        const attackingRight = (enemyGoal > RX);
        
        const blueLineOffset = 110;
        const blueLineX = attackingRight ? (RX + blueLineOffset) : (RX - blueLineOffset);
        const puckInOZone = attackingRight ? (puck.x > blueLineX) : (puck.x < blueLineX);
        const puckInNeutral = !puckInOZone;

        const teammates = players.filter(m => m.team === p.team && m.type === "skater");
        teammates.sort((a, b) => {
            const dA = Math.hypot(puck.x - a.x, puck.y - a.y);
            const dB = Math.hypot(puck.x - b.x, puck.y - b.y);
            return dA - dB;
        });
        const engagedId = teammates[0].id; 
        const amIEngaged = (p.id === engagedId);
        
        const teamHasPuck = (puck.ownerId !== null && getPlayerById(puck.ownerId).team === p.team);

        // Zone Detection
        let zone = getZoneID(puck.x, puck.y, attackingRight);

        // --- PRESSURE CHECK (DYNAMIC) ---
        // If in D-Zone Slot (Zone 2), be PARANOID (120px radius).
        // Otherwise use standard 45px.
        const panicRadius = (zone === 2) ? 120 : 45;
        
        let isPressured = false;
        let isExtremePressure = false;
        
        for(const o of players) {
            if(o.team !== p.team) {
                const d = Math.hypot(p.x - o.x, p.y - o.y);
                if(d < panicRadius) { isPressured = true; } 
                if(d < 30) { isExtremePressure = true; } 
            }
        }

        let myChair = null;
        if (!amIEngaged) {
            const chairs = getChairs(zone, { myGoalX, enemyGoal, attackingRight, teamHasPuck });
            const pA = teammates[1]; 
            const pB = teammates[2]; 

            if (pA && pB) {
                const dist1 = Math.hypot(pA.x - chairs[0].x, pA.y - chairs[0].y) + 
                              Math.hypot(pB.x - chairs[1].x, pB.y - chairs[1].y);
                const dist2 = Math.hypot(pA.x - chairs[1].x, pA.y - chairs[1].y) + 
                              Math.hypot(pB.x - chairs[0].x, pB.y - chairs[0].y);

                if (dist1 < dist2) {
                    if (p.id === pA.id) myChair = chairs[0];
                    if (p.id === pB.id) myChair = chairs[1];
                } else {
                    if (p.id === pA.id) myChair = chairs[1];
                    if (p.id === pB.id) myChair = chairs[0];
                }
            } else {
                myChair = chairs[0]; 
            }
        }

        // --- FORWARD TARGET (THE FIX) ---
        let forwardTarget = null;
        if (p.id === puck.ownerId) {
            const dir = attackingRight ? 1 : -1;
            let bestLead = -999;

            // Defensive Zone Blue Line (The line we must cross to exit)
            // Attacking Right -> Exit line is Left Blue (RX - 110) ?? No, exit line is Blue (RX+110).
            // Actually: 
            // Attacking Right (0 -> 1000). D-Zone ends at RX-110? No.
            // D-Zone is 0 to BlueLine. 
            // If Attacking Right, D-Zone is Left Side (x < 390). Blue Line is 390 (RX-110).
            const dZoneExitX = attackingRight ? (RX - 110) : (RX + 110);

            for (const m of teammates) {
                if (m.id === p.id) continue;
                const leadDistance = (m.x - p.x) * dir;
                
                if (leadDistance > 50) {
                    
                    // --- SAFETY CHECK ---
                    // 1. Offside Check
                    const isOffside = attackingRight 
                        ? (m.x > blueLineX && puck.x < blueLineX)
                        : (m.x < blueLineX && puck.x > blueLineX);
                    if (isOffside) continue;

                    // 2. D-ZONE TRAP CHECK [CRITICAL]
                    // If I am in D-Zone (zone <= 3), I can ONLY pass to someone
                    // who is OUT of the D-Zone (Neutral Zone).
                    if (zone <= 3) {
                        const mateOut = attackingRight 
                            ? (m.x > dZoneExitX) 
                            : (m.x < dZoneExitX);
                        if (!mateOut) continue; // Deny pass to teammate stuck in mud
                    }

                    // 3. Lane Check
                    if (isLaneBlocked(p.x, p.y, m.x, m.y, p.team)) continue;

                    if (leadDistance > bestLead) {
                        bestLead = leadDistance;
                        forwardTarget = m;
                    }
                }
            }
        }

        const distNet = Math.hypot(p.x - enemyGoal, p.y - RY);
        const netPathBlocked = isLaneBlocked(p.x, p.y, enemyGoal, RY, p.team);
        const distToBlueLine = Math.abs(p.x - blueLineX);
        const amIAheadOfPuck = attackingRight ? (p.x > puck.x) : (p.x < puck.x);

        return {
            p, amIEngaged, myChair, zone, 
            isPressured, isExtremePressure,
            enemyGoal, myGoalX, attackingRight,
            blueLineX, puckInNeutral,
            distNet, netPathBlocked,
            distToBlueLine, amIAheadOfPuck,
            forwardTarget, 
            hasPuck: (puck.ownerId === p.id),
            teamHasPuck,
            oppHasPuck: (puck.ownerId !== null && getPlayerById(puck.ownerId).team !== p.team),
            loosePuck: (puck.ownerId === null)
        };
    }

    // ==========================================
    // CONDITIONS & ACTIONS
    // ==========================================

    const cAmEngaged = new ConditionNode(bb => bb.amIEngaged);
    const cHasPuck   = new ConditionNode(bb => bb.hasPuck);
    
    const cDangerZone = new ConditionNode(bb => {
        if (!bb.hasPuck) return false;
        // Only panic in Defensive Zone
        if (bb.zone > 3) return false;

        // Extreme Panic
        if (bb.isExtremePressure) return true;

        // High Pressure Panic
        if (bb.isPressured) {
            if (bb.p.possessionTime < 30) return false; 
            return true;
        }
        return false;
    });

    const cCanShoot  = new ConditionNode(bb => {
        if (Math.abs(bb.p.y - RY) > 80 && Math.abs(bb.p.x - bb.enemyGoal) < 20) return false;
        if (bb.distNet < 220) return true;
        if (bb.distNet < 300 && !bb.netPathBlocked) return true;
        return false;
    });

    const cCanRelay  = new ConditionNode(bb => bb.forwardTarget !== null);

    const cRushingOffside = new ConditionNode(bb => {
        if (!bb.puckInNeutral) return false; 
        if (!bb.amIAheadOfPuck) return false; 
        if (bb.distToBlueLine > 60) return false; 
        return true; 
    });

    const cEntryBlocked = new ConditionNode(bb => {
        if (!bb.puckInNeutral) return false;
        if (bb.distToBlueLine > 100) return false;
        if (bb.netPathBlocked) return true; 
        return false;
    });

    const actShoot = new ActionNode(bb => ({ tx: bb.enemyGoal, ty: RY, action: "shoot" }));
    const actDriveNet = new ActionNode(bb => ({ tx: bb.enemyGoal, ty: RY, action: "none" }));
    
    // Use the Predictive Intercept for Chasing
    const actChase = new ActionNode(bb => ({ tx: bb.interceptPoint ? bb.interceptPoint.x : puck.x, ty: bb.interceptPoint ? bb.interceptPoint.y : puck.y, action: "none" }));
    
    // Add simple intercept logic back if missing
    function predictPuckIntersection(p) {
        const dx = puck.x - p.x;
        const dy = puck.y - p.y;
        const dist = Math.hypot(dx, dy);
        let framesAhead = dist / 2.3;
        if (framesAhead > 30) framesAhead = 30; 
        const futureX = puck.x + (puck.vx * framesAhead * 0.7);
        const futureY = puck.y + (puck.vy * framesAhead * 0.7);
        return { x: futureX, y: futureY };
    }
    // Update actChase to use it
    actChase.fn = (bb) => {
        const pt = predictPuckIntersection(bb.p);
        return { tx: pt.x, ty: pt.y, action: "none" };
    };

    const actHardClear = new ActionNode(bb => {
        const topDist = Math.abs(bb.p.y - 0);
        const botDist = Math.abs(bb.p.y - 600);
        const targetY = (topDist < botDist) ? 40 : 560; 
        const dir = bb.attackingRight ? 1 : -1;
        const defBlueX = bb.attackingRight ? RX - 110 : RX + 110;
        const targetX = defBlueX + (dir * 150); 
        return { tx: targetX, ty: targetY, action: "shoot" };
    });

    const actRelayPass = new ActionNode(bb => {
        const t = bb.forwardTarget;
        return { tx: t.x, ty: t.y, action: "pass", target: t };
    });

    const actGoToChair = new ActionNode(bb => {
        if (!bb.myChair) return null;
        return { tx: bb.myChair.x, ty: bb.myChair.y, action: "none" };
    });

    const actStraddleLine = new ActionNode(bb => {
        const offset = bb.attackingRight ? -15 : 15;
        return { tx: bb.blueLineX + offset, ty: bb.p.y, action: "none" };
    });
    const actDumpIn = new ActionNode(bb => {
        const cornerY = (bb.p.y < RY) ? RY + 200 : RY - 200;
        return { tx: bb.enemyGoal, ty: cornerY, action: "shoot" };
    });

    // ==========================================
    // THE TREE
    // ==========================================
    const ROOT_TREE = new SelectorNode([
        
        new SequenceNode([ 
            new ConditionNode(bb => bb.teamHasPuck),
            cRushingOffside, 
            actStraddleLine 
        ]),

        new SequenceNode([ 
            cAmEngaged,
            new SelectorNode([
                new SequenceNode([ 
                    cHasPuck,
                    new SelectorNode([
                        // A. PANIC CLEAR (Strict)
                        new SequenceNode([ cDangerZone, actHardClear ]),

                        // B. OFFENSE
                        new SequenceNode([ cCanShoot, actShoot ]),
                        new SequenceNode([ cCanRelay, actRelayPass ]),
                        new SequenceNode([ cEntryBlocked, actDumpIn ]),
                        actDriveNet
                    ])
                ]),
                actChase
            ])
        ]),

        actGoToChair
    ]);

    function think(p) {
        const bb = makeBB(p);
        return ROOT_TREE.tick(bb);
    }

    if (typeof registerStrategy === "function") {
        registerStrategy(
            STRATEGY_ID,
            STRATEGY_NAME,
            "Canadiens",
            "MTL",
            think,
            { main: "#af1e2d", secondary: "#192168" }
        );
    }

})();
// ==========================================
// STRATEGY: BT8 - TIME, SPACE & STATS (Fixed)
// ==========================================
// - Fix: Removed stats counter from decision loop (Prevents inflation).
// - Logic: Only tags the puck with 'passTargetId'.
// ==========================================

(function() {

    const STRATEGY_ID   = "BT8_TimeSpace";
    const STRATEGY_NAME = "Time & Space";

    const RY = 320; 
    const RX = 500; 

    // --- HELPER: DETECT ZONE (0-10) ---
    function getZoneID(puckX, puckY, attackingRight) {
        const absX = attackingRight ? puckX : (1000 - puckX); 
        let yZone = "C";
        if (puckY < 260) yZone = "T";
        if (puckY > 380) yZone = "B";

        if (absX < 350) {
            if (absX < 100) return 0; 
            if (yZone === "T") return 1; 
            if (yZone === "B") return 3; 
            return 2; 
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

    // --- HELPER: EASY MATH CHAIRS ---
    function chair(relX, relY, bb) {
        const dir = bb.attackingRight ? 1 : -1;
        const finalX = RX + (relX * dir);
        const clampedRelY = Math.max(-160, Math.min(160, relY));
        const finalY = RY + clampedRelY;
        return { x: finalX, y: finalY };
    }

    // --- DEFINE CHAIRS ---
    function getChairs(zoneID, bb) {
        const offenseMode = bb.teamHasPuck;
        const puckYRel = puck.y - RY; 

        let c1 = chair(0, 0, bb);
        let c2 = chair(0, 0, bb);

        switch (zoneID) {
            case 0: // Behind Net
                c1 = chair(-300, -30, bb); 
                c2 = chair(-300, 30, bb); 
                break;
            case 1: // Top Corner
            case 3: // Bot Corner
                if (offenseMode) {
                    c1 = chair(100, 0, bb); 
                    const postY = (puckYRel < 0) ? -70 : 70;
                    c2 = chair(-280, postY, bb); 
                } else {
                    c1 = chair(-300, -30, bb); 
                    c2 = chair(-200, 0, bb);     
                }
                break;
            case 2: // Slot
                if (offenseMode) {
                    c1 = chair(-200, -160, bb); 
                    c2 = chair(-200, 160, bb);  
                } else {
                    c1 = chair(-300, -40, bb); 
                    c2 = chair(-300, 40, bb); 
                }
                break;
            case 4: 
            case 6: 
            case 5:
                if (offenseMode) {
                    c1 = chair(100, -100, bb); 
                    c2 = chair(100, 100, bb); 
                } else {
                    c1 = chair(0, -50, bb); 
                    c2 = chair(0, 50, bb); 
                }
                break;
            case 7: 
                c1 = chair(325, 60, bb); 
                c2 = chair(110, 0, bb); 
                break;
            case 9: 
                c1 = chair(325, -60, bb);
                c2 = chair(110, 0, bb); 
                break;
            case 8: 
            case 10: 
                c1 = chair(300, 0, bb); 
                c2 = chair(150, 0, bb); 
                break;
        }
        return [c1, c2];
    }

    // --- SAFETY CALCULATOR ---
    function getSafetyRadius(p, allPlayers) {
        let minDist = 9999;
        for (const o of allPlayers) {
            if (o.team !== p.team) {
                const d = Math.hypot(p.x - o.x, p.y - o.y);
                if (d < minDist) minDist = d;
            }
        }
        return minDist;
    }


    // --- BLACKBOARD ---
    function makeBB(p) {
        const myGoalX = (p.team === 0) ? goal1 : goal2;
        const enemyGoal = (p.team === 0) ? goal2 : goal1;
        
        let attackingRight;
        if (p.team === 0) attackingRight = (typeof team0AttacksRight !== 'undefined') ? team0AttacksRight : (enemyGoal > RX);
        else             attackingRight = (typeof team0AttacksRight !== 'undefined') ? !team0AttacksRight : (enemyGoal > RX);
        
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

        // Zone & Chairs
        let myChair = null;
        let zone = getZoneID(puck.x, puck.y, attackingRight);

        // Debug Export
        if (p.team === 0) { 
            window.BT8_DEBUG = { zone, chairs: getChairs(zone, { myGoalX, enemyGoal, attackingRight, teamHasPuck }), attackingRight };
        }

        if (!amIEngaged) {
            const chairs = window.BT8_DEBUG ? window.BT8_DEBUG.chairs : getChairs(zone, { myGoalX, enemyGoal, attackingRight, teamHasPuck });
            const pA = teammates[1]; 
            const pB = teammates[2]; 
            if (pA && pB) {
                const d1 = Math.hypot(pA.x - chairs[0].x, pA.y - chairs[0].y) + Math.hypot(pB.x - chairs[1].x, pB.y - chairs[1].y);
                const d2 = Math.hypot(pA.x - chairs[1].x, pA.y - chairs[1].y) + Math.hypot(pB.x - chairs[0].x, pB.y - chairs[0].y);
                if (d1 < d2) {
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

        // Time & Space
        const mySafety = getSafetyRadius(p, players);
        
        let safestMate = null;
        let maxSafety = -1;
        let forwardTarget = null;

        if (p.id === puck.ownerId) {
            for (const m of teammates) {
                if (m.id === p.id) continue;
                if (isLaneBlocked(p.x, p.y, m.x, m.y, p.team)) continue;

                const mateZone = getZoneID(m.x, m.y, attackingRight);
                if (mateZone === 2 || mateZone === 0) continue;

                const mateSafety = getSafetyRadius(m, players);
                let score = mateSafety + (1000 - Math.hypot(m.x - enemyGoal, m.y - RY)) * 0.2; 

                if (score > maxSafety) {
                    maxSafety = score;
                    safestMate = m;
                }
            }
        }

        const isSafe = (mySafety > 65); 
        const isPressured = (mySafety < 50); 
        const isPanic = (mySafety < 25); 

        let shouldPass = false;
        if (safestMate) {
            const mateSafety = getSafetyRadius(safestMate, players);
            
            // O-Zone Override
            if (zone >= 7) {
                if (isPanic && mateSafety > 40) shouldPass = true;
            } 
            else {
                if (isSafe) {
                    if (mateSafety > 200) shouldPass = true; 
                } else if (isPressured) {
                    if (mateSafety > mySafety + 80) shouldPass = true;
                } else if (isPanic) {
                    if (mateSafety > 40) shouldPass = true;
                }
            }
        }

        const distNet = Math.hypot(p.x - enemyGoal, p.y - RY);
        const netPathBlocked = isLaneBlocked(p.x, p.y, enemyGoal, RY, p.team);
        const distToBlueLine = Math.abs(p.x - blueLineX);
        const amIAheadOfPuck = attackingRight ? (p.x > puck.x) : (p.x < puck.x);

        let matesUpIce = 0;
        let matesPastCenter = 0;
        const centerLineX = RX;
        for (const t of teammates) {
            if (t.id === p.id) continue;
            const tZone = getZoneID(t.x, t.y, attackingRight);
            if (tZone >= 4) matesUpIce++;
            
            const isPast = attackingRight ? (t.x > centerLineX) : (t.x < centerLineX);
            if (isPast) matesPastCenter++;
        }

        let nearestEnemy = null;
        let minEDist = 9999;
        for(const o of players) {
            if(o.team !== p.team) {
                const d = Math.hypot(p.x - o.x, p.y - o.y);
                if(d < minEDist) { minEDist = d; nearestEnemy = o; }
            }
        }

        return {
            p, amIEngaged, myChair, zone, 
            isSafe, isPressured, isPanic, nearestEnemy,
            safestMate, shouldPass, forwardTarget,
            matesUpIce, matesPastCenter,
            enemyGoal, myGoalX, attackingRight,
            blueLineX, puckInNeutral,
            distNet, netPathBlocked,
            distToBlueLine, amIAheadOfPuck,
            interceptPoint: (typeof getPuckIntercept === "function") ? getPuckIntercept(p) : {x:puck.x, y:puck.y},
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
    const cShouldPass = new ConditionNode(bb => bb.shouldPass);
    const cCanRelay  = new ConditionNode(bb => bb.forwardTarget !== null);
    
    const cMustClear = new ConditionNode(bb => {
        if (!bb.isPanic) return false;
        if (bb.shouldPass) return false; 
        if (bb.zone > 3) return false; 
        return true;
    });

    const cCanShoot  = new ConditionNode(bb => {
        const isBehind = bb.attackingRight 
            ? (bb.p.x >= bb.enemyGoal) 
            : (bb.p.x <= bb.enemyGoal);
        if (isBehind) return false;

        if (Math.abs(bb.p.y - RY) > 70 && Math.abs(bb.p.x - bb.enemyGoal) < 30) return false;

        if (bb.distNet < 190) return true; 
        if (bb.distNet < 240 && !bb.netPathBlocked) return true; 
        return false;
    });

    const cRushingOffside = new ConditionNode(bb => {
        if (!bb.puckInNeutral) return false; 
        if (!bb.amIAheadOfPuck) return false; 
        if (bb.distToBlueLine > 60) return false; 
        return true; 
    });

    const cEntryBlocked = new ConditionNode(bb => {
        if (!bb.puckInNeutral) return false;
        if (bb.distToBlueLine > 100) return false;
        if (bb.matesPastCenter < 1) return false; 
        if (bb.netPathBlocked) return true; 
        return false; 
    });

    const cSafeToCarry = new ConditionNode(bb => {
        if (!bb.isPressured) return true;
        if (!bb.isPanic) return true;
        return false;
    });

    const actShoot = new ActionNode(bb => ({ tx: bb.enemyGoal, ty: RY, action: "shoot" }));
    const actDriveNet = new ActionNode(bb => ({ tx: bb.enemyGoal, ty: RY, action: "none" }));
    
    function predictPuckIntersection(p) {
        if (typeof getPuckIntercept === "function") return getPuckIntercept(p);
        return { x: puck.x, y: puck.y };
    }
    const actChase = new ActionNode(bb => {
        const pt = predictPuckIntersection(bb.p);
        return { tx: pt.x, ty: pt.y, action: "none" };
    });

    const actHardClear = new ActionNode(bb => {
        const topDist = Math.abs(bb.p.y - 0);
        const botDist = Math.abs(bb.p.y - 600);
        const targetY = (topDist < botDist) ? 40 : 560; 
        const dir = bb.attackingRight ? 1 : -1;
        const defBlueX = bb.attackingRight ? RX - 110 : RX + 110;
        const targetX = defBlueX + (dir * 150); 
        return { tx: targetX, ty: targetY, action: "shoot" };
    });

    // *** STATS FIX: ONLY SET INTENTION ***
    const actSafePass = new ActionNode(bb => {
        const t = bb.safestMate;
        if (!t) return null;
        
        puck.passTargetId = t.id; // Set intention

        // Use Predictive Lead if available
        if (typeof predictLeadPass === "function") {
            const lead = predictLeadPass(bb.p, t);
            if (lead) return { tx: lead.x, ty: lead.y, action: "pass", target: t };
        }
        return { tx: t.x, ty: t.y, action: "pass", target: t };
    });

    const actRelayPass = new ActionNode(bb => {
        const t = bb.forwardTarget;
        if (!t) return null;

        puck.passTargetId = t.id; // Set intention

        if (typeof predictLeadPass === "function") {
            const lead = predictLeadPass(bb.p, t);
            if (lead) return { tx: lead.x, ty: lead.y, action: "pass", target: t };
        }
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

    const actKeepAway = new ActionNode(bb => {
        const enemy = bb.nearestEnemy;
        if (!enemy) return { tx: bb.enemyGoal, ty: RY, action: "none" };
        const dx = bb.p.x - enemy.x;
        const dy = bb.p.y - enemy.y;
        const forwardBias = bb.attackingRight ? 0.3 : -0.3;
        const tx = bb.p.x + (dx * 3) + (forwardBias * 50);
        const ty = bb.p.y + (dy * 3);
        return { tx: tx, ty: ty, action: "none" };
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
                        new SequenceNode([ cCanShoot, actShoot ]),
                        new SequenceNode([ cMustClear, actHardClear ]),
                        new SequenceNode([ cCanRelay, actRelayPass ]),
                        new SequenceNode([ cShouldPass, actSafePass ]),
                        new SequenceNode([ cEntryBlocked, actDumpIn ]),
                        new SequenceNode([ cSafeToCarry, new SelectorNode([ actDriveNet, actKeepAway ]) ]),
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
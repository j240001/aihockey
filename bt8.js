// ==========================================
// STRATEGY: BT8 - THE RELAY SYSTEM (Safety First)
// ==========================================
// - Fix: Defensive Slot = HARD CLEAR to boards.
// - No more passing across the middle in D-Zone.
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
            return 2; // D-Slot (Danger Zone)
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
            case 0: 
                c1 = { x: myGoal + (dir * 30), y: RY - 40 }; 
                c2 = { x: myGoal + (dir * 30), y: RY + 40 }; 
                break;
            case 1: 
            case 3: 
                if (offenseMode) {
                    c1 = { x: RX, y: RY }; 
                    c2 = { x: myGoal + (dir * 40), y: RY }; 
                } else {
                    c1 = { x: myGoal + (dir * 30), y: RY - 30 }; 
                    c2 = { x: myGoal + (dir * 120), y: RY };     
                }
                break;
            case 2: // Slot
                // If we are in panic mode, chairs go WIDE to boards
                c1 = { x: myGoal + (dir * 100), y: RY - 200 }; // Top Wall
                c2 = { x: myGoal + (dir * 100), y: RY + 200 }; // Bot Wall
                break;
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
            case 7: 
            case 9: 
                c1 = { x: enemyGoal - (dir * 50), y: (puck.y > RY) ? RY - 200 : RY + 200 }; 
                c2 = { x: enemyGoal - (dir * 180), y: RY };      
                break;
            case 8: 
            case 10: 
                c1 = { x: enemyGoal - (dir * 30), y: RY - 50 }; 
                c2 = { x: enemyGoal - (dir * 30), y: RY + 50 }; 
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

        let myChair = null;
        let zone = getZoneID(puck.x, puck.y, attackingRight);

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

        let forwardTarget = null;
        if (p.id === puck.ownerId) {
            const dir = attackingRight ? 1 : -1;
            let bestLead = -999;

            for (const m of teammates) {
                if (m.id === p.id) continue;
                const leadDistance = (m.x - p.x) * dir;
                
                if (leadDistance > 50) {
                    const isOffside = attackingRight 
                        ? (m.x > blueLineX && puck.x < blueLineX)
                        : (m.x < blueLineX && puck.x > blueLineX);
                    
                    if (isOffside) continue;
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
    
    // *** PANIC CHECK ***
    // If I have the puck in Zone 2 (Slot) or Zone 0 (Behind Net), I am in Danger.
    const cDangerZone = new ConditionNode(bb => (bb.zone === 2 || bb.zone === 0));

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
    const actChase = new ActionNode(bb => ({ tx: puck.x, ty: puck.y, action: "none" }));
    
    // *** HARD CLEAR ACTION ***
    // Shoots the puck toward the boards at the blue line.
    const actHardClear = new ActionNode(bb => {
        // 1. Find nearest boards
        const topDist = Math.abs(bb.p.y - 0);
        const botDist = Math.abs(bb.p.y - 600);
        const targetY = (topDist < botDist) ? 40 : 560; // Aim near wall
        
        // 2. Find target X (Neutral Zone Wall)
        // Aim past the blue line to ensure it clears zone
        const dir = bb.attackingRight ? 1 : -1;
        const targetX = bb.blueLineX + (dir * 50);

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
                        // A. PANIC CLEAR (Priority #1 in D-Zone)
                        // If in slot/behind net -> Get it out.
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
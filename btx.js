// ==========================================
// STRATEGY: BT9 - THE 11-ZONE CHAIR SYSTEM
// ==========================================
// - Map: 11 Spatial Zones (Defensive, Neutral, Offensive)
// - Logic: "Engaged" Player chases, others fill "Chairs"
// - Movement: Cost-based assignment (shortest total travel)
// ==========================================

(function() {

    const STRATEGY_ID   = "BT9_ZoneSystem";
    const STRATEGY_NAME = "11-Zone System";

    // --- CONSTANTS ---
    const RY = 320; // Rink Center Y
    const RX = 500; // Rink Center X

    // --- HELPER: DETECT ZONE (0-10) ---
    function getZoneID(p, puckX, puckY) {
        // Normalize X relative to OUR net (0 = Our Net, 1000 = Enemy Net)
        const absX = (p.team === 0) ? puckX : (1000 - puckX); 
        
        // Y-Axis Zones (Absolute)
        // Top < 260 | Center 260-380 | Bottom > 380
        let yZone = "C";
        if (puckY < 260) yZone = "T";
        if (puckY > 380) yZone = "B";

        // --- DEFENSIVE ZONE (0-350) ---
        if (absX < 350) {
            if (absX < 100) return 0; // Z0: Behind Net
            if (yZone === "T") return 1; // Z1: Top Corner
            if (yZone === "B") return 3; // Z3: Bot Corner
            return 2; // Z2: The Slot (House)
        }

        // --- NEUTRAL ZONE (350-650) ---
        if (absX < 650) {
            if (yZone === "T") return 4; // Z4: Top Wall
            if (yZone === "B") return 6; // Z6: Bot Wall
            return 5; // Z5: Center Ice
        }

        // --- OFFENSIVE ZONE (650+) ---
        if (absX < 900) {
            if (yZone === "T") return 7; // Z7: Top Corner
            if (yZone === "B") return 9; // Z9: Bot Corner
            return 8; // Z8: High Slot
        }
        
        return 10; // Z10: Deep Offense (Gretzky Office)
    }

    // --- HELPER: DEFINE CHAIRS ---
    // Returns [Chair1, Chair2] for the OFF-PUCK players.
    // Coordinates are absolute (Game World X/Y).
    function getChairs(zoneID, bb) {
        const myGoal = bb.myGoalX;
        const enemyGoal = bb.enemyGoal;
        const dir = (bb.attackingRight) ? 1 : -1; // 1 = Right, -1 = Left
        
        // Helper to flip Y relative to "Strong Side" if needed
        // But for this map, we defined fixed zones (Top/Bot), so we use absolute Y.
        // Top = ~150, Bottom = ~490.

        let c1 = { x: RX, y: RY };
        let c2 = { x: RX, y: RY };

        switch (zoneID) {
            // ------------------------------------------
            // 🛡️ DEFENSIVE ZONES
            // ------------------------------------------
            
            case 0: // Z0: BEHIND NET -> TRAP
                // Seal the posts. Don't chase him behind.
                c1 = { x: myGoal + (dir * 30), y: RY - 40 }; // Left Post
                c2 = { x: myGoal + (dir * 30), y: RY + 40 }; // Right Post
                break;

            case 1: // Z1: TOP CORNER -> BOX + 1
                // Puck is Top Left. 
                c1 = { x: myGoal + (dir * 30), y: RY - 30 }; // Strong Post (Top)
                c2 = { x: myGoal + (dir * 120), y: RY };     // High Slot (Prevent centering)
                break;

            case 2: // Z2: SLOT -> COLLAPSE
                // Panic Mode. Protect the house.
                c1 = { x: myGoal + (dir * 20), y: RY - 30 }; // Left Post
                c2 = { x: myGoal + (dir * 20), y: RY + 30 }; // Right Post
                break;

            case 3: // Z3: BOTTOM CORNER -> BOX + 1
                // Puck is Bottom Left.
                c1 = { x: myGoal + (dir * 30), y: RY + 30 }; // Strong Post (Bottom)
                c2 = { x: myGoal + (dir * 120), y: RY };     // High Slot
                break;

            // ------------------------------------------
            // 😐 NEUTRAL ZONES
            // ------------------------------------------

            case 4: // Z4: TOP WALL -> ANGLE
                // Force them to the boards.
                c1 = { x: RX, y: RY }; // Center Circle
                c2 = { x: myGoal + (dir * 350), y: RY - 150 }; // Top D-Blue Line
                break;

            case 5: // Z5: CENTER -> 1-2-2 TRAP
                c1 = { x: RX - (dir * 50), y: RY - 100 }; // Left Lane
                c2 = { x: RX - (dir * 50), y: RY + 100 }; // Right Lane
                break;

            case 6: // Z6: BOTTOM WALL -> ANGLE
                c1 = { x: RX, y: RY }; // Center Circle
                c2 = { x: myGoal + (dir * 350), y: RY + 150 }; // Bot D-Blue Line
                break;

            // ------------------------------------------
            // ⚔️ OFFENSIVE ZONES
            // ------------------------------------------

            case 7: // Z7: TOP CORNER -> CYCLE
                // Puck is Top Right.
                c1 = { x: enemyGoal - (dir * 50), y: RY - 250 }; // Behind Net / Deep Cycle
                c2 = { x: enemyGoal - (dir * 180), y: RY };      // The Slot (One Timer)
                break;

            case 8: // Z8: SLOT -> SCREEN
                // Puck is High Slot.
                c1 = { x: enemyGoal - (dir * 20), y: RY - 40 }; // Left Post (Rebound)
                c2 = { x: enemyGoal - (dir * 20), y: RY + 40 }; // Right Post (Rebound)
                break;

            case 9: // Z9: BOTTOM CORNER -> CYCLE
                // Puck is Bottom Right.
                c1 = { x: enemyGoal - (dir * 50), y: RY + 250 }; // Behind Net / Deep Cycle
                c2 = { x: enemyGoal - (dir * 180), y: RY };      // The Slot
                break;

            case 10: // Z10: DEEP / BEHIND NET -> GRETZKY OFFICE
                // Feeding the slot from behind.
                c1 = { x: enemyGoal - (dir * 150), y: RY - 100 }; // Left Faceoff Dot
                c2 = { x: enemyGoal - (dir * 150), y: RY + 100 }; // Right Faceoff Dot
                break;
        }
        return [c1, c2];
    }


    // --- BLACKBOARD ---
    function makeBB(p) {
        const myGoalX = (p.team === 0) ? goal1 : goal2;
        const enemyGoal = (p.team === 0) ? goal2 : goal1;
        const attackingRight = (enemyGoal > RX);
        
        // 1. DETERMINE "ENGAGED" PLAYER
        // -------------------------------
        // The player closest to the puck is ALWAYS "Engaged".
        // They ignore chairs and play the puck (Chase/Attack).
        
        const teammates = players.filter(m => m.team === p.team && m.type === "skater");
        teammates.sort((a, b) => {
            const dA = Math.hypot(puck.x - a.x, puck.y - a.y);
            const dB = Math.hypot(puck.x - b.x, puck.y - b.y);
            return dA - dB;
        });
        
        const engagedId = teammates[0].id; // Closest is Index 0
        const amIEngaged = (p.id === engagedId);

        // 2. IF NOT ENGAGED -> FIND MY CHAIR
        // -------------------------------
        let myChair = null;
        let zone = -1;

        if (!amIEngaged) {
            // A. Detect Zone
            zone = getZoneID(p, puck.x, puck.y);
            
            // B. Get Chairs for this Zone
            const chairs = getChairs(zone, { myGoalX, enemyGoal, attackingRight });
            
            // C. Cost-Based Assignment (The "Shift" Logic)
            // Identify the two off-puck players
            const pA = teammates[1]; // 2nd closest
            const pB = teammates[2]; // 3rd closest (if exists)

            if (pA && pB) {
                // Calculate total distance for Configuration 1: (A->C1, B->C2)
                const dist1 = Math.hypot(pA.x - chairs[0].x, pA.y - chairs[0].y) + 
                              Math.hypot(pB.x - chairs[1].x, pB.y - chairs[1].y);
                
                // Calculate total distance for Configuration 2: (A->C2, B->C1)
                const dist2 = Math.hypot(pA.x - chairs[1].x, pA.y - chairs[1].y) + 
                              Math.hypot(pB.x - chairs[0].x, pB.y - chairs[0].y);

                // Assign based on cheapest cost
                if (dist1 < dist2) {
                    if (p.id === pA.id) myChair = chairs[0];
                    if (p.id === pB.id) myChair = chairs[1];
                } else {
                    if (p.id === pA.id) myChair = chairs[1];
                    if (p.id === pB.id) myChair = chairs[0];
                }
            } else {
                // Fallback for 2v2 or penalties
                myChair = chairs[0];
            }
        }

        // 3. COMMON LOGIC
        return {
            p,
            amIEngaged,
            myChair,
            zone, // For debug/rendering if needed
            
            hasPuck: (puck.ownerId === p.id),
            enemyGoal,
            netPathBlocked: isLaneBlocked(p.x, p.y, enemyGoal, RY, p.team),
            distNet: Math.hypot(p.x - enemyGoal, p.y - RY)
        };
    }

    // ==========================================
    // ACTIONS & TREES
    // ==========================================

    // 1. ENGAGED LOGIC (The "Active" Player)
    const actEngagedLogic = new ActionNode(bb => {
        
        // A. OFFENSE (I have puck)
        if (bb.hasPuck) {
            // If close and open -> Shoot
            if (bb.distNet < 180 && !bb.netPathBlocked) {
                return { tx: bb.enemyGoal, ty: RY, action: "shoot" };
            }
            // Otherwise -> Drive Net
            return { tx: bb.enemyGoal, ty: RY, action: "none" };
        } 
        
        // B. DEFENSE (Chase Puck)
        else {
            return { tx: puck.x, ty: puck.y, action: "none" };
        }
    });

    // 2. CHAIR LOGIC (The "Support" Players)
    const actGoToChair = new ActionNode(bb => {
        if (!bb.myChair) return null;
        
        // Move to assigned coordinate
        return { tx: bb.myChair.x, ty: bb.myChair.y, action: "none" };
    });

    // --- MAIN TREE ---
    const ROOT_TREE = new SelectorNode([
        
        // Priority 1: Am I Engaged? (F1) -> Play Hockey
        new SequenceNode([ 
            new ConditionNode(bb => bb.amIEngaged),
            actEngagedLogic
        ]),

        // Priority 2: Not Engaged? -> Go to Chair
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
            "Edmonton",
            "EDM",
            think,
            { main: "#ff6b26", secondary: "#1814ff" }
        );
    }

})();
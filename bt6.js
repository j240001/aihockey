
// ==========================================
// VISUAL BUILDER GENERATED (v3 Compact)
// ==========================================
(function() { 

    const STRATEGY_ID = "BT_Visual_v3_" + Math.floor(Math.random()*999);
    const STRATEGY_NAME = "Compact Builder Brain";

    // --- BT ENGINE ---
    class Node { constructor() {} tick(bb) { return false; } }
    
    class ConditionNode extends Node { 
        constructor(fn) { super(); this.fn = fn; } 
        tick(bb) { return this.fn(bb) ? "SUCCESS" : "FAILURE"; } 
    }
    
    class ActionNode extends Node { 
        constructor(fn) { super(); this.fn = fn; } 
        tick(bb) { return this.fn(bb); } 
    }
    
    class SequenceNode extends Node {
        constructor(children) { super(); this.children = children; }
        tick(bb) {
            for (let c of this.children) {
                const res = c.tick(bb);
                if (res !== "SUCCESS") return res; // Pass up FAILURE or Action Object
            }
            return "SUCCESS";
        }
    }
    
    class SelectorNode extends Node {
        constructor(children) { super(); this.children = children; }
        tick(bb) {
            for (let c of this.children) {
                const res = c.tick(bb);
                if (res !== "FAILURE") return res; // Pass up SUCCESS or Action Object
            }
            return "FAILURE";
        }
    }

    // --- HELPERS ---
    function predictPuckIntersection(p) {
        return { x: puck.x + puck.vx*10, y: puck.y + puck.vy*10 };
    }
    
    // --- BLACKBOARD ---
    function makeBB(p) {
        const myGoalX = (p.team === 0) ? goal1 : goal2; 
        const enemyGoal = (p.team === 0) ? goal2 : goal1;
        const forwardDir = (enemyGoal > myGoalX) ? 1 : -1;
        const carrier = getPlayerById(puck.ownerId);
        
        return {
            p, real_p: p, myGoalX, enemyGoal, forwardDir,
            hasPuck: (puck.ownerId === p.id),
            loosePuck: (puck.ownerId === null),
            oppHasPuck: (carrier && carrier.team !== p.team),
            teamHasPuck: (carrier && carrier.team === p.team),
            puckInDefZone: (forwardDir===1 ? puck.x < RX-60 : puck.x > RX+60),
            distToGoal: Math.hypot(enemyGoal - p.x, RY - p.y),
            inShotRange: (Math.hypot(enemyGoal - p.x, RY - p.y) < 200),
            interceptPoint: predictPuckIntersection(p),
            carryTarget: null, passTarget: null
        };
    }

    // ===========================
    // CONDITIONS & ACTIONS
    // ===========================
    const condHasPuck = new ConditionNode(bb => bb.hasPuck);
    const condLoosePuck = new ConditionNode(bb => bb.loosePuck);
    const condOppHasPuck = new ConditionNode(bb => bb.oppHasPuck);
    const condTeamHasPuck = new ConditionNode(bb => bb.teamHasPuck);
    const condPuckInDefZone = new ConditionNode(bb => bb.puckInDefZone);
    const condInShotRange = new ConditionNode(bb => bb.inShotRange);
    
    const condForwardLaneClear = new ConditionNode(bb => {
        bb.carryTarget = { x: bb.p.x + bb.forwardDir*100, y: bb.p.y };
        return !isLaneBlocked(bb.p.x, bb.p.y, bb.carryTarget.x, bb.carryTarget.y, bb.p.team);
    });

    const condHasBreakoutPass = new ConditionNode(bb => {
        for(let m of players) {
            if(m.team === bb.p.team && m.id !== bb.p.id && (m.x - bb.p.x)*bb.forwardDir > 0) {
                 if(!isLaneBlocked(bb.p.x, bb.p.y, m.x, m.y, bb.p.team)) {
                     bb.passTarget = m;
                     return true;
                 }
            }
        }
        return false;
    });

    // ACTIONS
    const actShoot = new ActionNode(bb => ({ tx: bb.enemyGoal, ty: RY, action: "shoot" }));
    const actDriveNet = new ActionNode(bb => ({ tx: bb.enemyGoal, ty: RY, action: "none" }));
    const actSmartIntercept = new ActionNode(bb => ({ tx: bb.interceptPoint.x, ty: bb.interceptPoint.y, action: "none" }));
    const actHoverBlueLine = new ActionNode(bb => ({ tx: (bb.forwardDir===1 ? RX+60 : RX-60), ty: RY, action: "none" }));
    const actTagUp_T1 = new ActionNode(bb => ({ tx: RX - bb.forwardDir*50, ty: RY, action: "none" }));
    const actIdle = new ActionNode(bb => ({ tx: bb.p.x, ty: bb.p.y, action: "none" }));
    
    const actExecuteCarry = new ActionNode(bb => {
        if(bb.carryTarget) return { tx: bb.carryTarget.x, ty: bb.carryTarget.y, action: "none" };
        return { tx: bb.enemyGoal, ty: RY, action: "none" };
    });
    
    const actExecutePass = new ActionNode(bb => {
        if(bb.passTarget) return { tx: bb.passTarget.x, ty: bb.passTarget.y, action: "pass", target: bb.passTarget };
        return { tx: bb.enemyGoal, ty: RY, action: "none" };
    });

    // ===========================
    // DECISION TREES
    // ===========================

    const TREE_ATTACKER = 
        new SelectorNode([
            new SequenceNode([
                condHasPuck,
                actShoot
            ]),
            actSmartIntercept
        ]);

    const TREE_WINGER = 
        new SelectorNode([
            new SequenceNode([
                condHasPuck,
                actShoot
            ]),
            actSmartIntercept
        ]);

    const TREE_DEFENDER = 
        new SelectorNode([
            new SequenceNode([
                condHasPuck,
                actShoot
            ]),
            actSmartIntercept
        ]);

    // --- MAIN BRAIN ---
    function think(p) {
        const bb = makeBB(p);
        let result = null;

        if (p.role === "C") result = TREE_ATTACKER.tick(bb);
        else if (p.role === "LW" || p.role === "RW") result = TREE_WINGER.tick(bb);
        else if (p.role === "LD" || p.role === "RD") result = TREE_DEFENDER.tick(bb);
        
        // CRASH PROTECTION:
        // If the tree returns "FAILURE" (no matching rule), default to IDLE.
        // If the tree returns "SUCCESS" (a Sequence finished without an action), default to IDLE.
        if (typeof result === "string") {
            return { tx: p.x, ty: p.y, action: "none" };
        }
        
        return result;
    }


        




    if (typeof registerStrategy === "function") {
        registerStrategy(
            STRATEGY_ID,
            "The Elite",
            "Jets",
            "WPG",
            think,
            { main: "#4070ff", secondary: "#ffffff" }
        );
    }

})();
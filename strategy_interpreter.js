// =========================================================
// STRATEGY INTERPRETER
// Converts Builder JSON directly into Executable Behavior Trees
// =========================================================

const StrategyInterpreter = {
    
    // Main entry point: Converts a full team JSON into a 'think(p)' function
    buildTeamStrategy: function(teamJson) {
        // Pre-compile the trees for each role to save performance
        const trees = {
            C:  this.buildTree(teamJson.c),
            LW: this.buildTree(teamJson.lw),
            RW: this.buildTree(teamJson.rw),
            LD: this.buildTree(teamJson.ld),
            RD: this.buildTree(teamJson.rd)
        };

        // Return the function that the game loop calls
        return function(p) {
            const bb = makeBB(p); // Uses the global makeBB from helpers.js
            let result = null;

            // Select tree based on role
            let tree = trees.C; // Default
            if (p.role === "LW" && trees.LW) tree = trees.LW;
            if (p.role === "RW" && trees.RW) tree = trees.RW;
            if (p.role === "LD" && trees.LD) tree = trees.LD;
            if (p.role === "RD" && trees.RD) tree = trees.RD;

            if (tree) {
                result = tree.tick(bb);
            }

            // Fallback if tree fails
            if (!result || typeof result === "string" || (typeof result === 'object' && isNaN(result.tx))) {
                return { tx: p.x, ty: p.y, action: "none" };
            }
            return result;
        };
    },

    // Recursively build the Node structure
    buildTree: function(nodeList) {
        if (!nodeList || nodeList.length === 0) return null;

        // The root of a column is usually a single node (often a Selector)
        // If it's a list, we wrap it in a Sequence implicitly, or just take the first one.
        // The Builder exports columns as arrays.
        
        // Map all nodes in the list
        const builtNodes = nodeList.map(nodeData => this.createNode(nodeData));
        
        // If the top level has multiple nodes, wrapping them is safer, 
        // but usually the Builder root is a single Selector. 
        // We'll return the first one as the Root.
        return builtNodes[0];
    },

    createNode: function(data) {
        // 1. Handle Structural Nodes (Selector / Sequence)
        if (data.cat === "struct") {
            const children = data.children ? data.children.map(c => this.createNode(c)) : [];
            
            if (data.type === "Selector") return new SelectorNode(children);
            if (data.type === "Sequence") return new SequenceNode(children);
        }

        // 2. Handle Condition Nodes
        if (data.cat === "cond") {
            // We look up the function by name from the global scope (defined in helpers.js or strategies.js)
            // Note: This requires your condition functions (condHasPuck, etc.) to be globally accessible.
            const fn = window[data.type]; 
            if (typeof fn !== 'object' && typeof fn !== 'function') {
                console.warn(`Interpreter: Condition function '${data.type}' not found.`);
                return new ConditionNode(() => false); // Fail safe
            }
            // If the global object is a ConditionNode instance (like in your generated code), use its fn
            if (fn instanceof ConditionNode) return fn;
            
            // If it's just a function logic
            return new ConditionNode(fn);
        }

        // 3. Handle Action Nodes (With Parameters!)
        if (data.cat === "act") {
            // Special handling for parameterized actions
            if (data.type === "actSupportPosition") {
                return new ActionNode(bb => {
                    const carrier = getPlayerById(puck.ownerId);
                    if (!carrier) return { tx: bb.p.x, ty: bb.p.y, action:'none' };
                    
                    // Use the params from JSON (or defaults)
                    const offX = parseInt(data.offsetx) || -40;
                    const offY = parseInt(data.offsety) || 60;
                    
                    // Dynamic math (copied from builder generator)
                    const finalX = carrier.x + (bb.forwardDir * offX);
                    const finalY = (bb.p.y < RY) ? carrier.y - offY : carrier.y + offY;
                    return { tx: finalX, ty: finalY, action:'none' };
                });
            }
            
            if (data.type === "actSafetyPosition") {
                return new ActionNode(bb => {
                    const depth = parseInt(data.depth) || 120;
                    return {
                        tx: bb.myGoalX + (bb.forwardDir * depth),
                        ty: RY,
                        action:'none'
                    };
                });
            }

            // Standard Actions
            const fn = window[data.type];
            if (typeof fn !== 'object' && typeof fn !== 'function') {
                console.warn(`Interpreter: Action function '${data.type}' not found.`);
                return new ActionNode(() => ({ tx:0, ty:0, action:'none' }));
            }
            if (fn instanceof ActionNode) return fn;
            return new ActionNode(fn);
        }

        return null;
    }
};
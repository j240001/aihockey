// =========================================================
// EVOLUTION ENGINE: The Genetic Architect
// =========================================================
class EvolutionEngine {
    constructor() {
        this.generation = 0;
        this.mutationHistory = []; // Stack to undo bad changes
        
        // --- THE DECK OF CARDS ---
        // These are the building blocks the AI is allowed to use.
        this.library = {
            conditions: [
                "condHasPuck", "condLoosePuck", "condOppHasPuck", "condTeamHasPuck",
                "condPuckInDefZone", "condPuckInNeuZone", "condPuckInOffZone",
                "condInShotRange", "condForwardLaneClear", "condHasBreakoutPass",
                "condAmIClosest", "condIsPressured", "condHasBackdoor"
            ],
            actions: [
                "actShoot", "actPass", "actDriveNet", "actExecuteCarry",
                "actSmartIntercept", "actDefendHome", "actClearPuck",
                "actChill"
            ],
            structures: ["Sequence", "Selector"]
        };
    }

    // =====================================================
    // 1. THE MUTATION LOOP
    // =====================================================
    mutate(strategyJSON) {
        // Deep copy to avoid reference errors
        const newStrategy = JSON.parse(JSON.stringify(strategyJSON));
        
        // 1. Save state for Undo
        this.mutationHistory.push(JSON.stringify(strategyJSON));
        if (this.mutationHistory.length > 5) this.mutationHistory.shift();

        // 2. Pick a Target (Attacker, Winger, or Defender)
        const roles = ["attacker", "winger", "defender"];
        const targetRole = roles[Math.floor(Math.random() * roles.length)];
        const tree = newStrategy[targetRole];

        // 3. Pick a Mutation Type
        const mutationType = Math.random();

        console.log(`🧬 MUTATING: ${targetRole.toUpperCase()}`);

        if (mutationType < 0.30) {
            this.opInsertNode(tree);
            console.log("   -> Inserted new Logic Node");
        } 
        else if (mutationType < 0.60) {
            this.opSwapNodes(tree);
            console.log("   -> Reordered Priorities");
        } 
        else if (mutationType < 0.90) {
            this.opReplaceAction(tree);
            console.log("   -> Swapped Action Strategy");
        } 
        else {
            this.opDeleteNode(tree); // Rare (destructive)
            console.log("   -> Pruned Logic Branch");
        }

        this.generation++;
        return newStrategy;
    }

    // =====================================================
    // 2. FAIL-SAFE REVERT
    // =====================================================
    revert() {
        if (this.mutationHistory.length > 0) {
            console.warn("⚠️ MUTATION FAILED (Crippled Team). REVERTING...");
            const oldJSON = this.mutationHistory.pop();
            return JSON.parse(oldJSON);
        }
        return null;
    }

    // =====================================================
    // 3. GENETIC OPERATIONS (The Surgery)
    // =====================================================
    
    // Finds a Sequence and adds a Condition before the Action
    opInsertNode(tree) {
        const target = this.findRandomNode(tree, "Sequence");
        if (!target) return;

        // Pick a random condition card
        const card = this.library.conditions[Math.floor(Math.random() * this.library.conditions.length)];
        const newNode = { type: card, cat: "cond" };

        // Insert at the beginning or middle, never after the action
        const idx = Math.floor(Math.random() * (target.children.length - 1)); 
        target.children.splice(idx, 0, newNode);
    }

    // Swaps two branches (e.g. prioritize Defense over Intercept)
    opSwapNodes(tree) {
        const target = this.findRandomNode(tree, "Selector");
        if (!target || target.children.length < 2) return;

        const i = Math.floor(Math.random() * target.children.length);
        let j = Math.floor(Math.random() * target.children.length);
        while (j === i) j = Math.floor(Math.random() * target.children.length);

        [target.children[i], target.children[j]] = [target.children[j], target.children[i]];
    }

    // Changes actShoot to actPass, etc.
    opReplaceAction(tree) {
        const target = this.findRandomNode(tree, "act"); // Find any action
        if (!target) return;

        const card = this.library.actions[Math.floor(Math.random() * this.library.actions.length)];
        target.type = card;
        
        // Remove params if swapping to non-param action
        delete target.offsetx;
        delete target.offsety;
        delete target.depth;
    }

    opDeleteNode(tree) {
        // Find a struct and remove one of its children
        const target = this.findRandomNode(tree, "struct");
        if (!target || target.children.length <= 1) return;
        
        const idx = Math.floor(Math.random() * target.children.length);
        target.children.splice(idx, 1);
    }

    // Helper: Recursively find a node of a specific category/type
    findRandomNode(nodes, filterCat) {
        let candidates = [];
        
        function traverse(list) {
            for (let node of list) {
                if (filterCat === "act" && node.cat === "act") candidates.push(node);
                if (filterCat === "struct" && node.cat === "struct") candidates.push(node);
                if (filterCat === "Sequence" && node.type === "Sequence") candidates.push(node);
                if (filterCat === "Selector" && node.type === "Selector") candidates.push(node);

                if (node.children) traverse(node.children);
            }
        }
        traverse(nodes);
        
        if (candidates.length === 0) return null;
        return candidates[Math.floor(Math.random() * candidates.length)];
    }
}

// Global Instance
window.Evo = new EvolutionEngine();
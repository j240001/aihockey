// =========================================================
// AI COACH: TOURNAMENT EDITION (Optimized)
// =========================================================

const AICoach = {
    active: false,
    
    // Configuration
    traineeJSON: null,      // The current "Best" version
    mutantJSON: null,       // The version currently playing
    opponents: [],          // Array of Strategy IDs
    roundsPerEpisode: 4,    
    maxEpisodes: 100,
    
    // State
    currentEpisode: 0,
    bestPoints: -1,         
    bestGoalDiff: -999,
    
    mutationDetails: "",    
    
    // History Tracking
    mutationHistory: [], 

    // 1. INITIALIZE
    initTournamentTraining: function(json, opponents, rounds, episodes) {
        console.log("👨‍🏫 COACH: Initializing Tournament Mode");
        
        this.traineeJSON = JSON.parse(JSON.stringify(json));
        this.mutantJSON = JSON.parse(JSON.stringify(json)); 
        this.opponents = opponents;
        this.roundsPerEpisode = rounds;
        this.maxEpisodes = episodes;
        
        this.currentEpisode = 0;
        this.bestPoints = -1;
        this.active = true;
        this.mutationDetails = "Baseline Assessment (No Mutation)";
        
        this.mutationHistory = []; // Reset log

        this.startEpisode();
    },

    // 2. START EPISODE
    startEpisode: function() {
        this.currentEpisode++;
        console.log(`\n🎬 STARTING EPISODE ${this.currentEpisode} / ${this.maxEpisodes}`);

        // A. Inject the Mutant
        const mutantBrain = StrategyInterpreter.buildTeamStrategy(this.mutantJSON);
        
        const jsonName = this.mutantJSON.name || "Trainee";
        const jsonCode = this.mutantJSON.code || "TRN";
        const jsonColors = this.mutantJSON.colors || { main: "#00ff00", secondary: "#004400" };

        Strategies["TRAINEE"] = {
            name: jsonName + " (V" + this.currentEpisode + ")", 
            short: jsonCode,
            code: jsonCode,
            teamName: jsonName,
            colors: jsonColors, 
            think: mutantBrain
        };

        // B. Start Gauntlet
        // Uses the "Trainee vs World" scheduler we built
        Tournament.startTrainingGauntlet("TRAINEE", this.opponents, this.roundsPerEpisode);
    },

    // 3. EPISODE COMPLETE
    reportTournamentResult: function(standings) {
        const stats = standings["TRAINEE"];
        if (!stats) { console.error("Trainee missing from standings!"); return; }

        const points = stats.Pts;
        const goalDiff = stats.GF - stats.GA;
        
        console.log(`📊 REPORT: Pts: ${points}, GD: ${goalDiff}`);
        
        let improved = false;
        let outcomeString = "REJECTED";

        // D. EVALUATION LOGIC
        if (this.currentEpisode === 1) {
            this.bestPoints = points;
            this.bestGoalDiff = goalDiff;
            this.mutationDetails = "Baseline Established.";
            outcomeString = "BASELINE";
        } 
        else {
            if (points > this.bestPoints || (points === this.bestPoints && goalDiff > this.bestGoalDiff)) {
                console.log("🚀 IMPROVEMENT CONFIRMED!");
                this.bestPoints = points;
                this.bestGoalDiff = goalDiff;
                this.traineeJSON = JSON.parse(JSON.stringify(this.mutantJSON)); 
                improved = true;
                outcomeString = "IMPROVED";
            } else {
                console.log("❌ REGRESSION. Discarding.");
            }
        }

        // Log it
        this.logHistory(stats, outcomeString);

        // E. PREPARE NEXT EPISODE
        if (this.currentEpisode < this.maxEpisodes) {
            this.prepareNextMutation(improved);
        } else {
            console.log("🎓 TRAINING COMPLETE.");
            this.active = false;
            
            this.downloadJSON();     // Best File
            this.downloadHistory();  // Log File
            
            alert("Training Complete! Downloading results.");
            gameState = "menu"; 
        }
    },

    // 4. MUTATION PHASE (NaN-Proof Edition)
    prepareNextMutation: function(lastWasImprovement) {
        this.mutantJSON = JSON.parse(JSON.stringify(this.traineeJSON));
        
        const roles = ['c', 'lw', 'rw', 'ld', 'rd'];
        const role = roles[Math.floor(Math.random() * roles.length)];
        const tree = this.mutantJSON[role];
        
        const targetNode = this.getRandomNode(tree[0]);

        if (!targetNode || targetNode.cat !== 'act') {
            this.prepareNextMutation(lastWasImprovement); 
            return;
        }

        const status = lastWasImprovement ? "✅ KEEPING. " : "❌ REVERTING. ";
        
        // DECIDE: SWAP ACTION OR TWEAK PARAMS?
        // Only tweak if parameters actually EXIST and are valid numbers
        const hasValidParams = (targetNode.offsetx !== undefined && !isNaN(targetNode.offsetx)) || 
                               (targetNode.depth !== undefined && !isNaN(targetNode.depth));
                               
        // 50/50 chance, but ONLY if valid params exist
        const tweakParams = hasValidParams && Math.random() < 0.5;

        if (tweakParams) {
            // --- OPTION A: TWEAK PARAMETERS (SAFELY) ---
            let changeLog = "";

            if (targetNode.offsetx !== undefined) {
                const delta = (Math.floor(Math.random() * 5) - 2) * 10; 
                // SAFETY CHECK: Ensure we parse a real integer, default to 0 if fails
                const oldVal = parseInt(targetNode.offsetx) || 0;
                const newVal = oldVal + delta;
                targetNode.offsetx = newVal;
                changeLog += `OffsetX ${oldVal} -> ${newVal} `;
            }
            
            if (targetNode.offsety !== undefined) {
                const delta = (Math.floor(Math.random() * 5) - 2) * 10;
                const oldVal = parseInt(targetNode.offsety) || 0;
                const newVal = oldVal + delta;
                targetNode.offsety = newVal;
                changeLog += `OffsetY ${oldVal} -> ${newVal}`;
            }

            // Only tweak depth if the node actually uses it
            if (targetNode.depth !== undefined) {
                const delta = (Math.floor(Math.random() * 5) - 2) * 10;
                const oldVal = parseInt(targetNode.depth) || 0;
                const newVal = oldVal + delta;
                targetNode.depth = newVal;
                changeLog += `Depth ${oldVal} -> ${newVal}`;
            }

            this.mutationDetails = `${status} Tweaking ${role.toUpperCase()}: ${targetNode.type} (${changeLog})`;

        } else {
            // --- OPTION B: SWAP ACTION ---
            const newAction = this.getValidReplacement(targetNode.type);
            if (newAction) {
                this.mutationDetails = `${status} Swapping ${role.toUpperCase()}: ${targetNode.type} -> ${newAction}`;
                targetNode.type = newAction;
                
                // Set default params for specific new actions
                if (newAction === "actSupportPosition") {
                    targetNode.offsetx = -40; targetNode.offsety = 60;
                } else if (newAction === "actSafetyPosition") {
                    targetNode.depth = 120;
                } else {
                    // CRITICAL: Delete params so we don't carry over garbage
                    delete targetNode.offsetx; 
                    delete targetNode.offsety; 
                    delete targetNode.depth;
                }
            } else {
                this.mutationDetails = "Mutation Failed (No valid move). Retrying...";
                this.prepareNextMutation(lastWasImprovement);
                return;
            }
        }
            
        if (typeof startTrainingIntermission === 'function') {
            startTrainingIntermission();
        } else {
            this.startEpisode();
        }
    },


    // --- HELPERS ---

    // *** THE FIXED FUNCTION ***
    getRandomNode: function(node) {
        // Collect ALL Action nodes into a list first
        const candidates = [];
        
        const traverse = (n) => {
            if (n.cat === 'act') candidates.push(n);
            
            if (n.children) {
                for (const c of n.children) traverse(c);
            }
        };
        
        traverse(node);
        
        if (candidates.length === 0) return null;
        
        // Pick one at random
        return candidates[Math.floor(Math.random() * candidates.length)];
    },

    getValidReplacement: function(currentType) {
        if (typeof NODE_LIBRARY === 'undefined') return null;
        const currentCfg = NODE_LIBRARY.find(n => n.type === currentType);
        if (!currentCfg) return null;
        const reqContext = currentCfg.req || "ANY";
        
        const candidates = NODE_LIBRARY.filter(n => 
            n.cat === "act" && 
            n.type !== currentType &&
            (n.req === "ANY" || n.req === reqContext)
        );
        
        if (candidates.length === 0) return null;
        return candidates[Math.floor(Math.random() * candidates.length)].type;
    },

// 5. RENDERER (DOWNLOAD STYLE PROGRESS BAR)
    drawProgressBar: function(ctx, w, h) {
        if (!this.active) return;

        const barHeight = 30; // A bit thicker
        const margin = 50;    // Wider bar
        const y = h - 60;     // Positioned near bottom
        const fullWidth = w - (margin * 2);

        // Calculate Percentage
        const pct = Math.min(1, this.currentEpisode / this.maxEpisodes);

        ctx.save();

        // 1. Clear the area (Prevents text smearing in Warp Mode)
        ctx.fillStyle = "#000";
        ctx.fillRect(0, y - 40, w, 100);

        // 2. Draw Text Label (Centered Above)
        ctx.fillStyle = "#fff";
        ctx.font = "bold 18px Monospace";
        ctx.textAlign = "center";
        ctx.fillText(`TRAINING PROGRESS: ${this.currentEpisode} / ${this.maxEpisodes} (${Math.floor(pct * 100)}%)`, w / 2, y - 10);

        // 3. Draw The Hollow Container (White Border)
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#ffffff";
        ctx.strokeRect(margin, y, fullWidth, barHeight);

        // 4. Draw The Fill (Bright Green)
        if (pct > 0) {
            ctx.fillStyle = "#00ff00";
            // Fill with 3px padding so it doesn't touch the border
            const fillW = (fullWidth - 6) * pct;
            ctx.fillRect(margin + 3, y + 3, fillW, barHeight - 6);
        }

        ctx.restore();
    },




    // 6. LOGGING & DOWNLOADS
    logHistory: function(stats, outcome) {
        this.mutationHistory.push({
            episode: this.currentEpisode,
            description: this.mutationDetails,
            outcome: outcome,
            stats: {
                GP: stats.GP,
                Wins: stats.W,
                Points: stats.Pts,
                GF: stats.GF,
                GA: stats.GA
            },
            teamJSON: JSON.parse(JSON.stringify(this.mutantJSON))
        });
    },

    downloadJSON: function() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.traineeJSON, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        const name = (this.traineeJSON.name || "Team").replace(/\s+/g, '_');
        downloadAnchorNode.setAttribute("download", `${name}_V${this.currentEpisode}_BEST.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    },

    downloadHistory: function() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.mutationHistory, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        const name = (this.traineeJSON.name || "Team").replace(/\s+/g, '_');
        downloadAnchorNode.setAttribute("download", `${name}_FULL_HISTORY_LOG.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }
};
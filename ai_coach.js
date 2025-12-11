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
            
            this.downloadJSON();     // Best File (JSON)
            this.downloadHistory();  // Top 5 Report (HTML)
            
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
            }
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

    // *** NEW HTML REPORT GENERATOR ***
    downloadHistory: function() {
        // 1. Sort History: Descending Points, then Descending Goal Diff
        const sortedHistory = [...this.mutationHistory].sort((a, b) => {
            if (b.stats.Points !== a.stats.Points) return b.stats.Points - a.stats.Points;
            const gdA = a.stats.GF - a.stats.GA;
            const gdB = b.stats.GF - b.stats.GA;
            return gdB - gdA;
        });

        // 2. Slice the Top 5
        const top5 = sortedHistory.slice(0, 5);
        const teamName = (this.traineeJSON.name || "Team");

        // 3. Build HTML String
        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Training Report: ${teamName}</title>
            <style>
                body { background: #1e1e2e; color: #c0caf5; font-family: sans-serif; padding: 20px; }
                h1 { color: #7aa2f7; border-bottom: 2px solid #444; padding-bottom: 10px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; background: #252535; }
                th, td { padding: 12px; text-align: left; border-bottom: 1px solid #444; }
                th { background: #16161e; color: #7dcfff; }
                tr:hover { background: #2f2f40; }
                .rank { font-weight: bold; color: #e0af68; }
                .positive { color: #9ece6a; font-weight: bold; }
                .negative { color: #f7768e; font-weight: bold; }
                .neutral { color: #c0caf5; }
                .desc { font-family: monospace; font-size: 0.9em; color: #aaa; }
            </style>
        </head>
        <body>
            <h1>🏆 Top 5 Training Episodes: ${teamName}</h1>
            <table>
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Episode</th>
                        <th>Outcome</th>
                        <th>Mutation Details</th>
                        <th>GP</th>
                        <th>Wins</th>
                        <th>Points</th>
                        <th>GF</th>
                        <th>GA</th>
                        <th>Diff</th>
                    </tr>
                </thead>
                <tbody>
        `;

        top5.forEach((entry, index) => {
            const s = entry.stats;
            const diff = s.GF - s.GA;
            const diffClass = diff > 0 ? "positive" : (diff < 0 ? "negative" : "neutral");
            const sign = diff > 0 ? "+" : "";

            html += `
                <tr>
                    <td class="rank">#${index + 1}</td>
                    <td>${entry.episode}</td>
                    <td>${entry.outcome}</td>
                    <td class="desc">${entry.description}</td>
                    <td>${s.GP}</td>
                    <td>${s.Wins}</td>
                    <td style="font-weight:bold; color:#fff">${s.Points}</td>
                    <td>${s.GF}</td>
                    <td>${s.GA}</td>
                    <td class="${diffClass}">${sign}${diff}</td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
            <p style="margin-top: 20px; color: #666; font-size: 0.8em;">Generated by AI Hockey Coach</p>
        </body>
        </html>
        `;

        // 4. Trigger HTML Download
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", url);
        downloadAnchorNode.setAttribute("download", `${teamName.replace(/\s+/g, '_')}_REPORT.html`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        URL.revokeObjectURL(url);
    }
};
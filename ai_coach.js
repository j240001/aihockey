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

    bestStats: null,
    
    mutationDetails: "",    
    
    // History Tracking
    mutationHistory: [], 

    // 1. INITIALIZE (With Manual Baseline Support)
    initTournamentTraining: function(json, opponents, rounds, episodes, manualBaseline = -1) {
        console.log(`👨‍🏫 COACH: Initializing. Target Baseline: ${manualBaseline > -1 ? manualBaseline : "Auto"}`);
        
        this.traineeJSON = JSON.parse(JSON.stringify(json));
        this.mutantJSON = JSON.parse(JSON.stringify(json)); 
        this.opponents = opponents;
        this.roundsPerEpisode = rounds;
        this.maxEpisodes = episodes;
        
        // --- NEW: Manual Baseline Logic ---
        this.bestPoints = manualBaseline; 
        this.useManualBaseline = (manualBaseline > -1);
        // ----------------------------------
        
        this.bestGoalDiff = -999;
        this.currentEpisode = 0;
        this.active = true;
        this.mutationDetails = "Baseline Assessment";
        
        this.mutationHistory = [];
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

// 3. EPISODE COMPLETE (Modified for Manual Baseline)
    reportTournamentResult: function(standings) {
        const stats = standings["TRAINEE"];
        if (!stats) { console.error("Trainee missing!"); return; }

        const points = stats.Pts;
        const goalDiff = stats.GF - stats.GA;
        
        console.log(`📊 REPORT: Pts: ${points}, GD: ${goalDiff}`);
        
        let improved = false;
        let outcomeString = "REJECTED";

        // ============================================================
        // LOGIC BRANCH: AUTO vs MANUAL BASELINE
        // ============================================================
        
        // Scenario A: Auto Mode (Episode 1 is always the baseline)
        if (this.currentEpisode === 1 && !this.useManualBaseline) {
            this.bestPoints = points;
            this.bestGoalDiff = goalDiff;

            this.bestStats = JSON.parse(JSON.stringify(stats));

            this.mutationDetails = "Baseline Established (Auto).";
            outcomeString = "BASELINE";
        } 
        
        // Scenario B: Manual/Standard Mode (Must beat the target)
        else {
            // Check if we beat the current best (or manual target)
            if (points > this.bestPoints || (points === this.bestPoints && goalDiff > this.bestGoalDiff)) {
                console.log("🚀 IMPROVEMENT CONFIRMED!");
                this.bestPoints = points;
                this.bestGoalDiff = goalDiff;

                this.bestStats = JSON.parse(JSON.stringify(stats));
                                
                this.traineeJSON = JSON.parse(JSON.stringify(this.mutantJSON)); 
                improved = true;
                outcomeString = "IMPROVED";
            } else {
                // FAILED
                console.log(`❌ FAILED TARGET (${this.bestPoints}). Discarding.`);
            }
        }

        // ============================================================
        // LOGGING & FINISH (Preserves your HTML Report)
        // ============================================================
        this.logHistory(stats, outcomeString);

        if (this.currentEpisode < this.maxEpisodes) {
            // If failed, 'improved' is false, so it reverts and retries
            this.prepareNextMutation(improved);
        } else {
            console.log("🎓 TRAINING COMPLETE.");
            this.active = false;
            
            // DOWNLOADS
            this.downloadJSON();
            this.downloadHistory(); // <--- This runs your new HTML generator
            
            alert("Training Complete!");
            gameState = "menu"; 
        }
    },

// 4. MUTATION PHASE (Surgical / Coordinate Only)
    prepareNextMutation: function(lastWasImprovement) {
        // 1. Reset: Always start from the current "Best" (traineeJSON)
        this.mutantJSON = JSON.parse(JSON.stringify(this.traineeJSON));
        
        // Define which roles we want to train (3v3 Roster)
        const activeRoles = ['c', 'rw', 'ld']; 
        
        let changeLog = "";
        let mutated = false;
        let mutationStrength = 40; // How many pixels to move (Max)

        // 2. Loop to ensure we actually change *something* before starting
        let attempts = 0;
        while (!mutated && attempts < 100) {
            attempts++;

            // Loop through active roles
            activeRoles.forEach(role => {
                if (!this.mutantJSON[role]) return;

                const root = this.mutantJSON[role][0]; 
                if (!root || !root.children) return;

                // Traverse the Flattened List (Root Selector -> Sequences -> Nodes)
                root.children.forEach(sequence => {
                    if (!sequence.children) return;

                    sequence.children.forEach(node => {
                        // *** STRICTLY TARGET FORMATION NODES ***
                        if (node.type === "actFormationTarget") {
                            
                            // 15% chance to mutate any specific coordinate node
                            if (Math.random() < 0.15) {
                                
                                // Parse current values safely
                                let currentX = parseInt(node.offsetx) || 0;
                                let currentY = parseInt(node.offsety) || 0;

                                // Apply Nudge
                                let nudgeX = (Math.random() - 0.5) * 2 * mutationStrength;
                                let nudgeY = (Math.random() - 0.5) * 2 * mutationStrength;

                                // Calculate New Values
                                let newX = currentX + nudgeX;
                                let newY = currentY + nudgeY;

                                // *** CLAMP VALUES (Prevent "Wall-Hugging" bug) ***
                                // X: Keep between -350 (Deep D) and +350 (Deep O)
                                newX = Math.max(-350, Math.min(350, newX)); 
                                // Y: Keep inside the boards (-130 to +130)
                                newY = Math.max(-130, Math.min(130, newY));

                                // Save back as strings
                                node.offsetx = Math.round(newX).toString();
                                node.offsety = Math.round(newY).toString();
                                
                                mutated = true;
                            }
                        }
                    });
                });
            });
        }
        
        if (mutated) {
            changeLog = "Tweaked Coordinates";
        } else {
            changeLog = "No Change (Skipped)";
        }

        // 3. Log Status
        const status = lastWasImprovement ? "✅ KEEPING. " : "❌ REVERTING. ";
        this.mutationDetails = `${status} ${changeLog}`;
            
        // 4. Start Next Episode
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
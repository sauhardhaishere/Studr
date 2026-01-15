import { simulateAIAnalysis } from "./aiMock";
import { searchWebForStrategy } from "../services/searchService";

/**
 * Generates a structured schedule using AI (Groq, OpenAI, or Gemini).
 * If the API call fails or no key is provided, it falls back to a smart mock analysis.
 */
export const generateScheduleFromAI = async (userInput, tasks, activities, schedule, key, onStep = null) => {
    // Current Date Context for the AI
    const today = new Date();
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const todayStr = today.toLocaleDateString('en-US', dateOptions);
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    // Build a tiny "calendar table" for the next 14 days so AI doesn't hallucinate dates
    let calendarTable = "";
    for (let i = 0; i < 30; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        calendarTable += `${d.toLocaleDateString('en-US', { weekday: 'short' })}: ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${i === 0 ? " (TODAY)" : ""}\n`;
    }

    const systemPrompt = `
    You are Calendly, a high-precision academic scheduling engine. 
    
    CRITICAL: YOU MUST OPERATE USING THE INDEX SYSTEM BELOW. DO NOT USE YOUR OWN CALENDAR LOGIC.
    
    1. **WEB SEARCH INTEGRATION**:
        - If 'WEB SEARCH CONTEXT (LIVE)' is provided, you MUST use that information as your primary source of study strategies and resources.
        - Condense the web findings into the 'description' of the study tasks.
        - Mention that you searched the web to find this plan.
    
    CALENDAR LOOKUP INDEX:
    ${calendarTable}
    
    2. **CLASS VERIFICATION & AGENTIC CREATION:**
       - **VERIFICATION**: If a subject is mentioned but not in 'User's Classes', check if it is a **Standardized/Global Test** (e.g. SAT, ACT, Gaokao, IELTS, TOEFL, GRE, LSAT, MCAT). 
       - **BYPASS**: If it IS a global test (like Gaokao), do NOT ask for a class name. Create the task directly.
       - **PROMPT**: Only if it is a regular school class (History, Math, etc.) and missing, ask: "What's the full name of that class in your schedule?"
       - **HANDLING REPLIES**: If the user provides a name, **AUTOCORRECT TYPOS** (e.g. "Calclus" -> "Calculus") before creating it.
       - **IMMEDIATE ACTION**: After creating the class, IMMEDIATELY schedule the original request.

    3. **STUDY HELPER PROTOCOL (SPACED REPETITION):**
       - **TESTS**: Generate a multi-day plan (Test Task + Prep sessions).
       - **SPACING**: Use **Spaced Repetition**. If a test is far away (> 14 days), distribute the prep sessions across the entire duration (e.g., every 3-5 days) to maximize long-term retention. 
       - **SCALING**: 
         - If Test is < 1 week away: 2-3 sessions (Clustered).
         - If Test is 1-2 weeks away: 4 sessions (Spaced).
         - If Test is > 2 weeks away: ASK FOR **INTENSITY LEVEL**: "I've noted your test! Would you like a Normal, Moderate, or Hardcore study plan?"
         - **SESSIONS**: Normal = 3 sessions, Moderate = 5 sessions, Hardcore = 7 sessions.
       - **TIMING**: Always place the 'Final Review' session EXACTLY 1 day before the test.
 
    4. **ASSIGNMENT PROTOCOL (HW & PROJECTS):**
       - **RECOGNITION**: Detect keywords like "homework", "hw", "assignment", or "due".
       - **GAP FINDING**: You MUST check the 'User Routine' and 'Existing Tasks' provided in the context.
       - **OPTIMIZATION**: Find a 1-hour gap today or tomorrow BEFORE the deadline. Ensure it does NOT overlap with a class or an existing study session.
       - **DESCRIPTION**: Include the deadline in the task description.
 
    5. **SMART GAP-FINDING & DURATION MATH:**
       - **NO PAST SCHEDULING**: never pick a time in the past for TODAY.
       - **USER OVERRIDE**: If user says "any" or "anytime", pick 4 PM or the best available slot between 3 PM and 9 PM.
       - **NO BOLDING**: Do NOT use **bold** in your response messages.

    6. **RESOURCES & ASSETS**:
       - ALWAYS include these resources in EVERY study/prep task:
         1. {"label": "Study Coach (AI)", "url": "https://www.playlab.ai/project/cmi7fu59u07kwl10uyroeqf8n"}
         2. {"label": "Knowt", "url": "https://knowt.com"}
         3. {"label": "Quizlet", "url": "https://quizlet.com"}

    6. **FORMATTING RESPONSE (JSON ONLY):**
       {
         "message": "A note about what you found on the web and why this plan is optimized.",
         "newTasks": [],
         "newClasses": [],
         "newActivities": []
       }
    `;

    try {
        const userClassesContext = schedule.length > 0
            ? `\n\nUser's Classes:\n${schedule.map(c => `- ${c.name} (${c.subject})`).join('\n')}`
            : "";

        const lowerInput = userInput.toLowerCase();
        const commonSubjects = ["math", "science", "history", "english", "spanish", "physics", "bio", "chem", "biology", "chemistry", "algebra", "geometry", "calc", "calculus", "stats"];
        const isCommonSubject = commonSubjects.some(s => lowerInput.includes(s));
        const isStandardized = lowerInput.includes("gaokao") || lowerInput.includes("sat") || lowerInput.includes("act") || lowerInput.includes("ap") || lowerInput.includes("lsat") || lowerInput.includes("mcat");

        // ONLY search the web if it's a standardized test (not for basic school subjects)
        const isSearchNeeded = isStandardized && !isCommonSubject;

        if (onStep && isSearchNeeded) {
            onStep("Connecting to global academic database...");
            await sleep(500);
        }

        // --- WEB SEARCH ENGINE ---
        let webContext = "";
        let searchResults = null;

        // Smart extraction for search
        const probableSubject = userInput.match(/(?:test|exam|quiz|for)\s+([a-zA-Z0-9\s]{2,20})/i)?.[1] || userInput.split(' ').slice(0, 3).join(' ');

        if (isSearchNeeded) {
            if (onStep) onStep(`Searching the live web for "${probableSubject}" study strategies...`);
            searchResults = await searchWebForStrategy(probableSubject);
        }

        if (searchResults && searchResults.answer) {
            if (onStep) onStep(`Condensing real-time insights for ${probableSubject}...`);
            webContext = `\n\nWEB SEARCH CONTEXT (LIVE):\n${searchResults.answer}\n\nTop Resources Found:\n${JSON.stringify(searchResults.results)}`;
            await sleep(1000);
        } else {
            if (onStep) onStep("Syncing internal high-performance protocols...");
            await sleep(1000);
        }

        const userMessage = `TODAY'S TIMESTAMP: ${todayStr} ${today.toLocaleTimeString()}\n\nCALENDAR LOOKUP INDEX:\n${calendarTable}\n\nCurrent Task Context: ${JSON.stringify({ tasks, activities, schedule })}${userClassesContext}${webContext}\n\nUser Message: "${userInput}"`;

        if (key && key.startsWith("gsk_")) {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userMessage }
                    ],
                    response_format: { type: "json_object" },
                    temperature: 0.1
                })
            });
            if (!response.ok) throw new Error(`Groq Error: ${response.status}`);
            const data = await response.json();
            return JSON.parse(data.choices?.[0]?.message?.content || "{}");
        }

        if (key && key.startsWith("sk-")) {
            const response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
                body: JSON.stringify({
                    model: "gpt-4o",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userMessage }
                    ],
                    response_format: { type: "json_object" },
                    temperature: 0.1
                })
            });
            if (!response.ok) throw new Error(`OpenAI Error: ${response.status}`);
            const data = await response.json();
            return JSON.parse(data.choices?.[0]?.message?.content || "{}");
        }

        if (key) {
            // Assume Gemini/Generic
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: `${systemPrompt}\n\n${userMessage}` }] }],
                    generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
                })
            });
            if (response.ok) {
                const data = await response.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) return JSON.parse(text);
            }
        }

        throw new Error("No valid API key or fallback triggered.");

    } catch (error) {
        console.warn("AI Engine Failed, falling back to Mock:", error.message);
        return await simulateAIAnalysis(userInput, tasks, activities, schedule, today, onStep);
    }
};

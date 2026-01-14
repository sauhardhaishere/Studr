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
    
    13. **WEB SEARCH INTEGRATION**:
        - If 'WEB SEARCH CONTEXT (LIVE)' is provided, you MUST use that information as your primary source of study strategies and resources.
        - Mention that you searched the web to find this plan.
    
    CALENDAR LOOKUP INDEX:
    ${calendarTable}
    
    1. **CLASS VERIFICATION & AGENTIC CREATION:**
       - **VERIFICATION**: If a subject is mentioned but not in 'User's Classes', check if it is a **Standardized/Global Test** (e.g. SAT, ACT, Gaokao, IELTS, TOEFL, GRE, LSAT, MCAT). 
       - **BYPASS**: If it IS a global test, do NOT ask for a class name. Create it directly.
       - **PROMPT**: If it is a normal school subject (Spanish, Math, etc.) and missing, ask: "I see you have a Spanish test! What's the full name of that class in your schedule?"
       - **HANDLING REPLIES**: If the user provides a name, **AUTOCORRECT TYPOS** (e.g. "Calclus" -> "Calculus") before creating it.
       - **IMMEDIATE ACTION**: After creating the class, IMMEDIATELY schedule the original request.

    2. **STUDY HELPER PROTOCOL (SCALABLE PLANS):**
       - **TESTS**: Generate a multi-day plan (Test Task + Prep sessions).
       - **SCALING**: 
         - If Test is < 1 week away: 2 sessions.
         - If Test is 1-2 weeks away: 4 sessions.
         - If Test is > 2 weeks away: Stop and ask for **INTENSITY LEVEL**: "I've noted your [Subject] test! Since it's quite a bit away, would you like a Normal, Moderate, or Hardcore study plan?"
       - **TIMING**: Always place the 'Final Review' session EXACTLY 1 day before the test. Space other sessions out leading up to it.
       - **EXPERT STRATEGIES**:
         - **SAT**: Mention "Digital Adaptive Strategy", "Module 1 performance", and "Desmos Calculator".
         - **ACT**: Mention "Non-adaptive format", "4 math choices", and "Optional Science focus".
         - **GAOKAO**: Mention "12-hour study cycles", "Simulated mock exams", and "Endurance/resilience".
       - **RESOURCES**: Include: 
         - {"label": "Study Coach (AI)", "url": "https://www.playlab.ai/project/cmi7fu59u07kwl10uyroeqf8n"}
         - {"label": "Khan Academy (SAT)", "url": "https://www.khanacademy.org/test-prep/sat"}
         - {"label": "ACT Academy", "url": "https://www.act.org/content/act/en/products-and-services/the-act/test-preparation/act-academy.html"}

    3. **SMART GAP-FINDING & DURATION MATH:**
       - **NO PAST SCHEDULING**: If scheduling for TODAY, never pick a time in the past.
       - **DURATION AWARENESS**: Check 'tasks' start/end times.
       - **ROUTINE RANGE**: Use 'isFreeSlot' activities first.
       - **CONFLICT RESOLUTION**: If no gap exists in free slots, ask for a time. 
       - **USER OVERRIDE**: If user says "any" or "anytime", pick 4 PM or the best available slot between 3 PM and 9 PM.
       - **NO BOLDING**: Do NOT use **bold** in your response messages.

    4. **DATE ACCURACY:**
       - "Next [Day]" (e.g. "Next Tuesday") refers to the next occurrence of that day.
       - IMPORTANT: Only skip a week if the day is very close (e.g. today or tomorrow). If today is Wednesday, "Next Tuesday" is the upcoming Tuesday (Jan 20).
       - Verify the Month and Day match the index before outputting JSON.

    5. **AGENTIC PERSISTENCE & HELP:**
       - **HELP REQUESTS**: If the user says "I need help" without mentioning a task, explain what you can do (schedule tests, manage classes, optimize routine).
       - **CLOSE THE LOOP**: If you were waiting for a class name or intensity, and the user provides it, IMMEDIATELY generate the tasks.
       - **ID PRESERVATION**: If updating, ALWAYS use the existing ID from context.

    6. **TASK MODIFICATION & UPDATES:**
       - If the user says "actually move it to 5pm", identify the task and update its time while KEEPING THE SAME ID.

    7. **DYNAMIC SUBJECT HANDLING:**
       - If the user says "Change my Math class name to AP Calculus", update the class and all associated tasks in the response.
     
    8. **ROUTINE & NO REPEATS:**
       - **NO REPEATS**: If a test/exam already exists for a subject in the context, DO NOT create a new one. Ask to reschedule the existing one instead.
       - **AVAILABILITY**: Search the 'activities' context for 'isFreeSlot: true' blocks.
       - If no free slot exists, ASK for confirmation: "I've proposed 5 PM for this, is that fine? If not, what time is best for you on these days?"

    9. **NO PAST SCHEDULING (STRICT RULE):**
       - You MUST NOT generate any tasks or study sessions for dates that have already passed relative to TODAY.
       - If they mention a past event, acknowledge politely but do not schedule.

    10. **SPECIFICITY & WORK DURATION:**
        - Every task 'description' MUST start with a quantitative work requirement.
        - Example: "• Work for 45 minutes on Practice Set 1. Focus on..."

    11. **USER PREFERENCE PRIORITY:**
        - If the user says "I'm free 5-6" or "schedule it for 5pm", you MUST use that exact time window and ignore routine 'isFreeSlot' logic. Use rule 5 to save this to their routine!

    12. **FORMATTING RESPONSE (JSON ONLY):**
       {
         "message": "A warm, helpful note about what was scheduled or answered.",
         "newTasks": [],
         "newClasses": [],
         "newActivities": []
       }
    `;

    try {
        const userClassesContext = schedule.length > 0
            ? `\n\nUser's Classes:\n${schedule.map(c => `- ${c.name} (${c.subject})`).join('\n')}`
            : "";

        if (onStep) onStep("Integrating user history into context engine...");
        await sleep(1000);

        // --- WEB SEARCH ENGINE ---
        let webContext = "";
        let searchResults = null;

        // Extract a probable subject for searching
        const probableSubject = userInput.match(/(?:test|exam|quiz|for)\s+([a-zA-Z0-9\s]{2,20})/i)?.[1] || userInput.split(' ').slice(0, 3).join(' ');

        if (onStep) onStep(`Searching the live web for "${probableSubject}" study strategies...`);
        searchResults = await searchWebForStrategy(probableSubject);

        if (searchResults && searchResults.answer) {
            if (onStep) onStep(`Analyzing real-time search results for ${probableSubject}...`);
            webContext = `\n\nWEB SEARCH CONTEXT (LIVE):\n${searchResults.answer}\n\nTop Resources Found:\n${JSON.stringify(searchResults.results)}`;
            await sleep(1000);
        } else {
            if (onStep) onStep("Using internal high-performance protocols...");
            await sleep(1000);
        }

        const userMessage = `TODAY'S TIMESTAMP: ${todayStr} ${today.toLocaleTimeString()}\n\nCALENDAR LOOKUP INDEX:\n${calendarTable}\n\nCurrent Task Context: ${JSON.stringify({ tasks, activities, schedule })}${userClassesContext}${webContext}\n\nUser Message: "${userInput}"`;

        if (key && key.startsWith("gsk_")) {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${key}`
                },
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

            if (!response.ok) {
                const errDetail = await response.text();
                throw new Error(`Groq Status ${response.status}: ${errDetail}`);
            }
            const data = await response.json();
            const contentString = data.choices?.[0]?.message?.content;
            if (!contentString) throw new Error("Groq returned malformed response (no content)");
            return JSON.parse(contentString);
        }

        if (key && key.startsWith("sk-")) {
            const response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${key}`
                },
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
            const contentString = data.choices?.[0]?.message?.content;
            if (!contentString) throw new Error("OpenAI returned malformed response (no content)");
            return JSON.parse(contentString);
        }

        if (key && !key.startsWith("sk-") && !key.startsWith("gsk_")) {
            const models = [
                { ver: 'v1beta', name: 'gemini-1.5-flash-latest' },
                { ver: 'v1beta', name: 'gemini-1.5-flash' },
                { ver: 'v1', name: 'gemini-pro' }
            ];

            let lastErr = "";
            for (const model of models) {
                try {
                    const response = await fetch(`https://generativelanguage.googleapis.com/${model.ver}/models/${model.name}:generateContent?key=${key}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            contents: [{
                                parts: [{ text: `${systemPrompt}\n\n${userMessage}` }]
                            }],
                            generationConfig: {
                                responseMimeType: "application/json",
                                temperature: 0.1
                            }
                        })
                    });

                    if (response.ok) {
                        const data = await response.json();
                        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (text) return JSON.parse(text);
                    } else {
                        lastErr = await response.text();
                    }
                } catch (e) {
                    lastErr = e.message;
                }
            }
            throw new Error(`Gemini All Models Failed: ${lastErr}`);
        }

        // --- FALLBACK TO MOCK ---
        throw new Error("No valid API key provided or API calls failed.");

    } catch (error) {
        console.warn("AI Connection Failed, using Mock:", error.message);
        return await simulateAIAnalysis(userInput, tasks, activities, schedule, today);
    }
};
